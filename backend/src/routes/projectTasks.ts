import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { dateOnlySchema, toDateKey } from '../lib/dateOnly.js';
import {
  classifyProjectTaskDeadline,
  compareProjectControlRows,
  getProjectTaskCapabilities,
  getProjectTaskCompletion,
  getProjectTaskScope,
  type ProjectTaskPriorityValue,
} from '../lib/projectControl.js';
import { calculateProjectFinancials, getHourlyCost, getHourlyCostValue, getRate } from '../lib/projectMetrics.js';

const taskStatuses = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'] as const;
const taskPriorities = ['LOW', 'NORMAL', 'HIGH'] as const;
const workRoles = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const;
const managerRoles = ['ADMIN', 'SUPERVISOR'] as const;
const portfolioRoles = ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'] as const;

const taskCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  note: z.string().trim().max(2000).optional().nullable(),
  assigneeId: z.string().uuid(),
  priority: z.enum(taskPriorities).default('NORMAL'),
  status: z.enum(taskStatuses).default('TODO'),
  dueDate: dateOnlySchema,
});

const taskPatchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  note: z.string().trim().max(2000).optional().nullable(),
  assigneeId: z.string().uuid().optional(),
  priority: z.enum(taskPriorities).optional(),
  status: z.enum(taskStatuses).optional(),
  dueDate: dateOnlySchema.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Inga ändringar skickades' });

const taskStatusSchema = z.object({
  status: z.enum(taskStatuses),
  dueDate: dateOnlySchema.optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'WAITING' && !value.dueDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Väntande uppgifter behöver ett nytt uppföljningsdatum' });
  }
  if (value.status !== 'WAITING' && value.dueDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Uppföljningsdatum kan bara ändras när uppgiften sätts som väntande' });
  }
});

const controlQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  projectStatus: z.enum(['PLANNED', 'ONGOING', 'COMPLETED']).optional(),
  assigneeId: z.string().uuid().optional(),
  taskStatus: z.enum(taskStatuses).optional(),
  deadline: z.enum(['OVERDUE', 'TODAY', 'UPCOMING', 'LATER']).optional(),
});

const listTaskQuerySchema = z.object({ includeArchived: z.enum(['true', 'false']).optional() });
const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, name: true } },
} as const;

function publicTask(task: any, referenceDate = new Date()) {
  const { companyId: _companyId, ...item } = task;
  return {
    ...item,
    dueDate: toDateKey(task.dueDate),
    deadlineBucket: task.status === 'DONE' ? null : classifyProjectTaskDeadline(task.dueDate, referenceDate),
  };
}

async function findActiveAssignee(db: typeof prisma, companyId: string, assigneeId: string) {
  return db.user.findFirst({
    where: { id: assigneeId, companyId, active: true, role: { in: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] } },
    select: { id: true },
  });
}

function auditTaskValue(task: any) {
  return JSON.stringify({
    projectId: task.projectId,
    title: task.title,
    assigneeId: task.assigneeId,
    priority: task.priority,
    status: task.status,
    dueDate: toDateKey(task.dueDate),
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
  });
}

export function createProjectTaskRoutes(db: typeof prisma = prisma): FastifyPluginAsync {
  return async (fastify) => {
  fastify.get('/project-control/projects', {
    preHandler: [requireRoles(workRoles, 'Lön och ekonomi använder den separata projektekonomin')],
  }, async (request) => {
    const query = controlQuerySchema.parse(request.query);
    const companyId = request.user.companyId;
    const taskScope = getProjectTaskScope(request.user);
    const projects = await db.project.findMany({
      where: {
        companyId,
        active: true,
        ...(query.projectStatus ? { status: query.projectStatus } : {}),
        ...(query.q ? {
          OR: [
            { code: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
            { site: { contains: query.q, mode: 'insensitive' } },
            { customer: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        } : {}),
      },
      select: {
        id: true, code: true, name: true, site: true, status: true, active: true, updatedAt: true,
        customer: { select: { id: true, name: true } },
      },
    });
    if (!projects.length) return { summary: { active: 0, overdue: 0, dueToday: 0, upcoming: 0 }, items: [] };

    const projectIds = projects.map((project) => project.id);
    const [tasks, timeActivity, materialActivity, updateActivity] = await Promise.all([
      db.projectTask.findMany({
        where: {
          ...taskScope!,
          projectId: { in: projectIds },
          archivedAt: null,
          ...(getProjectTaskCapabilities(request.user.role).manage && query.assigneeId ? { assigneeId: query.assigneeId } : {}),
          ...(query.taskStatus ? { status: query.taskStatus } : {}),
        },
        include: taskInclude,
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
      }),
      db.timeEntry.groupBy({ where: { projectId: { in: projectIds } }, by: ['projectId'], _max: { updatedAt: true } }),
      db.projectMaterial.groupBy({ where: { projectId: { in: projectIds } }, by: ['projectId'], _max: { updatedAt: true } }),
      db.projectUpdate.groupBy({ where: { projectId: { in: projectIds } }, by: ['projectId'], _max: { occurredAt: true } }),
    ]);

    const now = new Date();
    const tasksByProject = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (query.deadline && (task.status === 'DONE' || classifyProjectTaskDeadline(task.dueDate, now) !== query.deadline)) continue;
      const bucket = tasksByProject.get(task.projectId) ?? [];
      bucket.push(task);
      tasksByProject.set(task.projectId, bucket);
    }
    const timeMap = new Map(timeActivity.map((item) => [item.projectId, item._max.updatedAt]));
    const materialMap = new Map(materialActivity.map((item) => [item.projectId, item._max.updatedAt]));
    const updateMap = new Map(updateActivity.map((item) => [item.projectId, item._max.occurredAt]));
    const rows = projects.map((project) => {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const openTasks = projectTasks.filter((task) => task.status !== 'DONE');
      const buckets = openTasks.map((task) => classifyProjectTaskDeadline(task.dueDate, now));
      const lastActivityAt = [project.updatedAt, timeMap.get(project.id), materialMap.get(project.id), updateMap.get(project.id), ...projectTasks.map((task) => task.updatedAt)]
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const priorityOrder: ProjectTaskPriorityValue[] = ['HIGH', 'NORMAL', 'LOW'];
      const highestPriority = priorityOrder.find((priority) => openTasks.some((task) => task.priority === priority)) ?? null;
      return {
        ...project,
        nextTask: openTasks[0] ? publicTask(openTasks[0], now) : null,
        tasks: projectTasks.map((task) => publicTask(task, now)),
        overdueCount: buckets.filter((bucket) => bucket === 'OVERDUE').length,
        dueTodayCount: buckets.filter((bucket) => bucket === 'TODAY').length,
        upcomingCount: buckets.filter((bucket) => bucket === 'UPCOMING').length,
        waitingCount: openTasks.filter((task) => task.status === 'WAITING').length,
        highestPriority,
        earliestDueDate: openTasks[0]?.dueDate ?? null,
        lastActivityAt,
      };
    }).filter((row) => !(query.deadline || query.assigneeId || query.taskStatus) || row.tasks.length > 0).sort(compareProjectControlRows);

    return {
      summary: {
        active: rows.length,
        overdue: rows.reduce((sum, row) => sum + row.overdueCount, 0),
        dueToday: rows.reduce((sum, row) => sum + row.dueTodayCount, 0),
        upcoming: rows.reduce((sum, row) => sum + row.upcomingCount, 0),
      },
      items: rows.map(({ earliestDueDate: _earliestDueDate, highestPriority: _highestPriority, ...row }) => row),
    };
  });

  fastify.get('/projects/:projectId/tasks', { preHandler: [requireRoles(workRoles)] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const query = listTaskQuerySchema.parse(request.query);
    const manager = getProjectTaskCapabilities(request.user.role).manage;
    const taskScope = getProjectTaskScope(request.user)!;
    const project = await db.project.findFirst({ where: { id: projectId, companyId: request.user.companyId }, select: { id: true } });
    if (!project) return reply.status(404).send({ error: 'Projekt hittades inte' });
    const tasks = await db.projectTask.findMany({
      where: {
        ...taskScope,
        projectId,
        ...(!manager || query.includeArchived !== 'true' ? { archivedAt: null } : {}),
      },
      include: taskInclude,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { priority: 'desc' }],
    });
    return tasks.map((task) => publicTask(task));
  });

  fastify.post('/projects/:projectId/tasks', { preHandler: [requireRoles(managerRoles)] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = taskCreateSchema.parse(request.body);
    if (body.status === 'WAITING' && classifyProjectTaskDeadline(body.dueDate) === 'OVERDUE') return reply.status(400).send({ error: 'Uppföljningsdatum för en väntande uppgift måste vara idag eller senare' });
    const [project, assignee] = await Promise.all([
      db.project.findFirst({ where: { id: projectId, companyId: request.user.companyId, active: true }, select: { id: true } }),
      findActiveAssignee(db, request.user.companyId, body.assigneeId),
    ]);
    if (!project) return reply.status(404).send({ error: 'Projekt hittades inte eller är inaktivt' });
    if (!assignee) return reply.status(400).send({ error: 'Ansvarig måste vara en aktiv användare i företaget' });
    const task = await db.$transaction(async (tx) => {
      const created = await tx.projectTask.create({ data: { ...body, note: body.note || null, companyId: request.user.companyId, projectId, createdByUserId: request.user.id, completedAt: body.status === 'DONE' ? new Date() : null }, include: taskInclude });
      await tx.auditLog.create({ data: { userId: request.user.id, action: 'CREATE', entityType: 'ProjectTask', entityId: created.id, newValue: auditTaskValue(created) } });
      return created;
    });
    return reply.status(201).send(publicTask(task));
  });

  fastify.patch('/project-tasks/:taskId', { preHandler: [requireRoles(managerRoles)] }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const body = taskPatchSchema.parse(request.body);
    const current = await db.projectTask.findFirst({ where: { id: taskId, ...getProjectTaskScope(request.user)!, archivedAt: null }, include: taskInclude });
    if (!current) return reply.status(404).send({ error: 'Uppgift hittades inte' });
    if (body.assigneeId && !(await findActiveAssignee(db, request.user.companyId, body.assigneeId))) return reply.status(400).send({ error: 'Ansvarig måste vara en aktiv användare i företaget' });
    const nextStatus = body.status ?? current.status;
    if (body.status === 'WAITING' && !body.dueDate) return reply.status(400).send({ error: 'Väntande uppgifter behöver ett nytt uppföljningsdatum' });
    if (nextStatus === 'WAITING' && body.dueDate && classifyProjectTaskDeadline(body.dueDate) === 'OVERDUE') return reply.status(400).send({ error: 'Uppföljningsdatum för en väntande uppgift måste vara idag eller senare' });
    const task = await db.$transaction(async (tx) => {
      const updated = await tx.projectTask.update({ where: { id: current.id }, data: { ...body, note: body.note === '' ? null : body.note, completedAt: getProjectTaskCompletion(current.status, nextStatus, current.completedAt) }, include: taskInclude });
      await tx.auditLog.create({ data: { userId: request.user.id, action: 'UPDATE', entityType: 'ProjectTask', entityId: updated.id, oldValue: auditTaskValue(current), newValue: auditTaskValue(updated) } });
      return updated;
    });
    return publicTask(task);
  });

  fastify.patch('/project-tasks/:taskId/status', { preHandler: [requireRoles(workRoles)] }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const body = taskStatusSchema.parse(request.body);
    if (body.status === 'WAITING' && body.dueDate && classifyProjectTaskDeadline(body.dueDate) === 'OVERDUE') return reply.status(400).send({ error: 'Uppföljningsdatum för en väntande uppgift måste vara idag eller senare' });
    const current = await db.projectTask.findFirst({ where: { id: taskId, ...getProjectTaskScope(request.user)!, archivedAt: null }, include: taskInclude });
    if (!current) return reply.status(404).send({ error: 'Uppgift hittades inte' });
    const task = await db.$transaction(async (tx) => {
      const updated = await tx.projectTask.update({ where: { id: current.id }, data: { status: body.status, ...(body.dueDate ? { dueDate: body.dueDate } : {}), completedAt: getProjectTaskCompletion(current.status, body.status, current.completedAt) }, include: taskInclude });
      await tx.auditLog.create({ data: { userId: request.user.id, action: 'STATUS', entityType: 'ProjectTask', entityId: updated.id, oldValue: auditTaskValue(current), newValue: auditTaskValue(updated) } });
      return updated;
    });
    return publicTask(task);
  });

  fastify.delete('/project-tasks/:taskId', { preHandler: [requireRoles(managerRoles)] }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const current = await db.projectTask.findFirst({ where: { id: taskId, companyId: request.user.companyId, archivedAt: null } });
    if (!current) return reply.status(404).send({ error: 'Uppgift hittades inte' });
    const archivedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.projectTask.update({ where: { id: current.id }, data: { archivedAt } });
      await tx.auditLog.create({ data: { userId: request.user.id, action: 'ARCHIVE', entityType: 'ProjectTask', entityId: current.id, oldValue: auditTaskValue(current), newValue: JSON.stringify({ archivedAt }) } });
    });
    return { message: 'Uppgiften arkiverades' };
  });

  fastify.get('/project-portfolio', { preHandler: [requireRoles(portfolioRoles)] }, async (request) => {
    const companyId = request.user.companyId;
    const projects = await db.project.findMany({ where: { companyId, active: true }, include: { customer: { select: { id: true, name: true, defaultRate: true } } }, orderBy: { code: 'asc' } });
    const projectIds = projects.map((project) => project.id);
    const [entries, materials] = await Promise.all([
      db.timeEntry.findMany({ where: { projectId: { in: projectIds } }, include: { user: { select: { hourlyCost: true } }, project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } }, activity: { select: { rateOverride: true } } } }),
      db.projectMaterial.findMany({ where: { projectId: { in: projectIds } } }),
    ]);
    const entriesByProject = new Map<string, typeof entries>();
    for (const entry of entries) {
      if (!entry.projectId) continue;
      const bucket = entriesByProject.get(entry.projectId) ?? [];
      bucket.push(entry);
      entriesByProject.set(entry.projectId, bucket);
    }
    const materialsByProject = new Map<string, typeof materials>();
    for (const material of materials) {
      const bucket = materialsByProject.get(material.projectId) ?? [];
      bucket.push(material);
      materialsByProject.set(material.projectId, bucket);
    }
    return projects.map((project) => {
      const allEntries = entriesByProject.get(project.id) ?? [];
      const approvedEntries = allEntries.filter((entry) => entry.status === 'APPROVED');
      const projectMaterials = materialsByProject.get(project.id) ?? [];
      const reportedHours = allEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const approvedHours = approvedEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const billableEntries = approvedEntries.filter((entry) => entry.billable);
      const billableValue = billableEntries.reduce((sum, entry) => sum + entry.hours * getRate(entry), 0);
      const laborCost = approvedEntries.reduce((sum, entry) => sum + entry.hours * getHourlyCost(entry), 0);
      const materialCost = projectMaterials.reduce((sum, item) => sum + item.quantity * (item.purchasePrice ?? 0), 0);
      const materialSalesValue = projectMaterials.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
      const financials = calculateProjectFinancials({ billingModel: project.billingModel, fixedPrice: project.fixedPrice, billableValue, laborCost, materialCost, materialSalesValue });
      const warnings: string[] = [];
      if (approvedEntries.some((entry) => !entry.financialSnapshotCapturedAt)) warnings.push('Äldre attesterad tid saknar sparad prisbild');
      if (approvedEntries.some((entry) => getHourlyCostValue(entry) == null)) warnings.push('Timkostnad saknas');
      return {
        project: { id: project.id, code: project.code, name: project.name, status: project.status, customer: project.customer ? { id: project.customer.id, name: project.customer.name } : null },
        reportedHours,
        approvedHours,
        unapprovedHours: reportedHours - approvedHours,
        budgetHours: project.budgetHours,
        billingModel: project.billingModel,
        revenue: financials.revenue,
        laborCost,
        materialCost,
        result: financials.result,
        marginPercent: financials.marginPercent,
        warnings,
      };
    });
  });
  };
}

export default createProjectTaskRoutes();
