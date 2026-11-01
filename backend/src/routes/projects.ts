import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../lib/prisma.js';
import { getProjectMetrics, getRate, summarizeProjectEconomy } from '../lib/projectMetrics.js';
import { loadProjectPurchaseCosts } from '../lib/projectPurchaseCosts.js';
import { enqueueProjectChanged } from '../lib/obsidianSync.js';
import { requireRoles } from '../lib/authorization.js';
import {
  canViewProjectFinancials, canViewProjectHours, getApprovedProjectHours,
  permanentDeletionDisabledMessage, toPublicProjectHoursEntry,
  toPublicProjectMaterial, toPublicProjectSummaryEntry, toPublicProjectTimeEntry,
} from '../lib/safety.js';
import { endOfUtcDay, getWeekStartUtc, parseDateOnly } from '../lib/dateOnly.js';
import { getNextProjectCodeFromCodes } from '../lib/projectCode.js';

const projectSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  code: z.string().min(1),
  site: z.string().optional().nullable(),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED']).optional(),
  budgetHours: z.number().optional().nullable(),
  fixedPrice: z.number().optional().nullable(),
  billingModel: z.enum(['HOURLY', 'FIXED']).optional(),
  defaultRate: z.number().nonnegative().optional().nullable(),
  employeeCanSeeResults: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const createProjectSchema = projectSchema.extend({
  code: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).optional()
  ),
});

const employeeCreateProjectSchema = projectSchema.pick({ name: true, customerId: true, site: true })
  .extend({ name: z.string().trim().min(2) }).strict();


const requireAdmin = requireRoles(['ADMIN']);
const requireAdminOrSupervisor = requireRoles(['ADMIN', 'SUPERVISOR']);
const requireProjectCreator = requireRoles(['ADMIN', 'SUPERVISOR', 'EMPLOYEE']);
const requireProjectAccess = async (request: any, reply: any) => {
  if (request.user.role === 'ACCOUNTANT') {
    return reply.status(403).send({ error: 'Lön och ekonomi använder rapporter med attesterad tid' });
  }
};

const canManageMaterials = (role: string) => ['ADMIN', 'SUPERVISOR'].includes(role);

// `/:id/time-entries` may be shown to employees. An explicit select prevents
// Prisma from serializing GPS, rates, invoice information or offline metadata.
const projectTimeEntrySelect = {
  id: true,
  userId: true,
  projectId: true,
  activityId: true,
  date: true,
  startTime: true,
  endTime: true,
  hours: true,
  billable: true,
  note: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  user: { select: { id: true, name: true } },
  activity: { select: { id: true, name: true, code: true } },
} as const;

const employeeProjectHoursSelect = {
  id: true,
  userId: true,
  date: true,
  hours: true,
  status: true,
  user: { select: { id: true, name: true } },
  activity: { select: { id: true, name: true, code: true } },
} as const;

function sanitizeProjectForRole<T extends Record<string, any>>(project: T, canView: boolean): T {
  if (canView) return project;
  const {
    fixedPrice: _fixedPrice,
    defaultRate: _defaultRate,
    billingModel: _billingModel,
    budgetHours: _budgetHours,
    ...safeProject
  } = project;
  const sanitized = {
    ...safeProject,
    fixedPrice: null,
    defaultRate: null,
    billingModel: null,
    budgetHours: null,
  } as Record<string, any>;

  if (sanitized.customer && typeof sanitized.customer === 'object') {
    const { defaultRate: _customerDefaultRate, ...safeCustomer } = sanitized.customer;
    sanitized.customer = safeCustomer;
  }

  return sanitized as T;
}

async function customerBelongsToCompany(prisma: typeof defaultPrisma, customerId: string | null | undefined, companyId: string, activeOnly = false) {
  if (!customerId) return true;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId, ...(activeOnly ? { active: true } : {}) },
    select: { id: true },
  });
  return Boolean(customer);
}

const mapMaterialForRole = toPublicProjectMaterial;

function parseDateFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | null {
  const parsedFrom = from ? parseDateOnly(from) : null;
  const parsedTo = to ? parseDateOnly(to) : null;
  if ((from && !parsedFrom) || (to && !parsedTo) || (parsedFrom && parsedTo && parsedFrom > parsedTo)) return null;

  return {
    ...(parsedFrom ? { gte: parsedFrom } : {}),
    ...(parsedTo ? { lte: endOfUtcDay(parsedTo) } : {}),
  };
}

async function getNextProjectCode(prisma: typeof defaultPrisma, companyId: string) {
  const projects = await prisma.project.findMany({
    where: { companyId },
    select: { code: true },
  });

  return getNextProjectCodeFromCodes(projects.map((project) => project.code));
}

export function createProjectRoutes(prisma: typeof defaultPrisma = defaultPrisma): FastifyPluginAsync {
return async (fastify) => {
  // List projects (same company)
  fastify.get('/', {
    preHandler: [fastify.authenticate, requireProjectAccess],
  }, async (request) => {
    const { status, customerId, active } = request.query as {
      status?: string;
      customerId?: string;
      active?: string;
    };

    const where: any = { companyId: request.user.companyId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (active !== undefined) where.active = active === 'true';

    const projects = await prisma.project.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true },
        },
        _count: {
          select: { timeEntries: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    // Beräkna totala timmar per projekt
    const projectsWithHours = await Promise.all(
      projects.map(async (project) => {
        const hoursVisible = canViewProjectHours(request.user.role, project.employeeCanSeeResults);
        const financialsVisible = canViewProjectFinancials(request.user.role);
        const metrics = financialsVisible ? await getProjectMetrics(prisma, project) : null;
        const approvedHours = hoursVisible && !financialsVisible
          ? await getApprovedProjectHours(prisma, project.id)
          : null;

        return {
          ...sanitizeProjectForRole(project, financialsVisible),
          hoursVisibleToCurrentUser: hoursVisible,
          financialsVisibleToCurrentUser: financialsVisible,
          resultsVisibleToCurrentUser: financialsVisible,
          totalHours: financialsVisible ? metrics!.totalHours : approvedHours,
          billableHours: financialsVisible ? metrics!.billableHours : null,
          metrics: financialsVisible ? metrics : null,
        };
      })
    );

    return projectsWithHours;
  });

  // Reference choices do not need project financials or per-project metrics.
  fastify.get('/options', {
    preHandler: [fastify.authenticate, requireProjectAccess],
  }, async (request) => {
    return prisma.project.findMany({
      where: { companyId: request.user.companyId, active: true },
      select: { id: true, code: true, name: true, customer: { select: { id: true, name: true } } },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
  });

  fastify.get('/customer-options', { preHandler: [requireProjectCreator] }, async (request) => {
    return prisma.customer.findMany({
      where: { companyId: request.user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  fastify.get('/next-code', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request) => {
    const code = await getNextProjectCode(prisma, request.user.companyId);
    return { code };
  });

  fastify.get('/:id/summary', {
    preHandler: [fastify.authenticate, requireProjectAccess],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true, defaultRate: true } } },
    });

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const hoursVisible = canViewProjectHours(request.user.role, project.employeeCanSeeResults);
    const financialsVisible = canViewProjectFinancials(request.user.role);
    if (!financialsVisible) {
      return {
        project: sanitizeProjectForRole(project, false),
        period: { from: from || null, to: to || null },
        hoursVisibleToCurrentUser: hoursVisible,
        financialsVisibleToCurrentUser: false,
        resultsVisibleToCurrentUser: false,
        metrics: null,
        totals: {
          totalHours: null,
          billableHours: null,
          laborCost: null,
          materialCost: null,
          materialSalesValue: null,
          revenue: null,
          result: null,
          marginPercent: null,
          entryCount: null,
          materialRowCount: null,
        },
        warnings: [],
        byActivity: [],
        byUser: [],
        recentEntries: [],
        recentMaterials: [],
      };
    }

    const dateFilter = parseDateFilter(from, to);
    if (!dateFilter) return reply.status(400).send({ error: 'Ange giltiga datum som YYYY-MM-DD där from inte är efter to' });
    const whereDate = Object.keys(dateFilter).length ? { date: dateFilter } : {};

    const [approvedEntries, openEntryCount, materials, purchases] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { projectId: id, status: 'APPROVED', ...whereDate },
        include: {
          user: { select: { id: true, name: true, hourlyCost: true } },
          project: { select: { id: true, name: true, code: true, site: true, defaultRate: true, customer: { select: { defaultRate: true } } } },
          activity: { select: { id: true, name: true, code: true, category: true, rateOverride: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.timeEntry.count({
        where: { projectId: id, status: { not: 'APPROVED' }, ...whereDate },
      }),
      prisma.projectMaterial.findMany({
        where: { projectId: id, ...whereDate },
        include: { createdByUser: { select: { id: true, name: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      loadProjectPurchaseCosts(prisma, request.user.companyId, [id], Object.keys(dateFilter).length ? dateFilter : undefined),
    ]);

    const economy = summarizeProjectEconomy(project, approvedEntries, materials, purchases.get(id) ?? 0);
    const { approvedHours: totalHours, billableHours, billableValue, laborCost, materialCost, materialSalesValue, revenue, result, marginPercent } = economy;
    const warnings = [...economy.warnings];
    if (openEntryCount > 0) warnings.push(`${openEntryCount} tidrader är inte attesterade`);

    const byActivity = new Map<string, { activityId: string; activityName: string; activityCode: string; hours: number }>();
    const byUser = new Map<string, { userId: string; userName: string; hours: number; billableHours: number }>();

    for (const entry of approvedEntries) {
      const activity = byActivity.get(entry.activity.id) || {
        activityId: entry.activity.id,
        activityName: entry.activity.name,
        activityCode: entry.activity.code,
        hours: 0,
      };
      activity.hours += entry.hours;
      byActivity.set(entry.activity.id, activity);

      const user = byUser.get(entry.user.id) || {
        userId: entry.user.id,
        userName: entry.user.name,
        hours: 0,
        billableHours: 0,
      };
      user.hours += entry.hours;
      if (entry.billable) user.billableHours += entry.hours;
      byUser.set(entry.user.id, user);
    }

    return {
      project: sanitizeProjectForRole(project, true),
      period: { from: from || null, to: to || null },
      hoursVisibleToCurrentUser: true,
      financialsVisibleToCurrentUser: true,
      resultsVisibleToCurrentUser: true,
      metrics: {
        totalHours,
        billableHours,
        billableValue,
        laborCost,
        materialCost,
        materialSalesValue,
        projectResult: result,
        marginPercent,
        budgetUsagePercent: project.budgetHours ? (totalHours / project.budgetHours) * 100 : null,
      },
      totals: {
        totalHours,
        billableHours,
        laborCost,
        materialCost,
        materialSalesValue,
        revenue,
        result,
        marginPercent,
        entryCount: approvedEntries.length,
        materialRowCount: materials.length,
      },
      warnings,
      byActivity: Array.from(byActivity.values()).sort((a, b) => b.hours - a.hours),
      byUser: Array.from(byUser.values()).sort((a, b) => b.hours - a.hours),
      recentEntries: approvedEntries.slice(0, 8).map(toPublicProjectSummaryEntry),
      recentMaterials: materials.slice(0, 8).map((item) => mapMaterialForRole(item, true, canManageMaterials(request.user.role))),
    };
  });

  // Project by ID is registered after material registry routes so static
  // material paths can never be interpreted as project ids.
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, requireProjectAccess],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
      },
    });

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const hoursVisible = canViewProjectHours(request.user.role, project.employeeCanSeeResults);
    const financialsVisible = canViewProjectFinancials(request.user.role);
    const metrics = financialsVisible ? await getProjectMetrics(prisma, project) : null;

    const stats = !hoursVisible
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id, ...(financialsVisible ? {} : { status: 'APPROVED' }) },
          _sum: { hours: true },
        });

    const billableStats = !financialsVisible
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id, billable: true },
          _sum: { hours: true },
        });

    return {
      ...sanitizeProjectForRole(project, financialsVisible),
      hoursVisibleToCurrentUser: hoursVisible,
      financialsVisibleToCurrentUser: financialsVisible,
      resultsVisibleToCurrentUser: financialsVisible,
      totalHours: hoursVisible ? (stats?._sum.hours || 0) : null,
      billableHours: financialsVisible ? (billableStats?._sum.hours || 0) : null,
      metrics: financialsVisible ? metrics : null,
    };
  });

  // Get project time entries
  fastify.get('/:id/time-entries', {
    preHandler: [fastify.authenticate, requireProjectAccess],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    // Verify project belongs to company
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const hoursVisible = canViewProjectHours(request.user.role, project.employeeCanSeeResults);
    if (!hoursVisible) {
      return reply.status(403).send({ error: 'Projekttimmar är inte synliga för anställda i detta projekt' });
    }

    const dateFilter = parseDateFilter(from, to);
    if (!dateFilter) return reply.status(400).send({ error: 'Ange giltiga datum som YYYY-MM-DD där from inte är efter to' });
    const where: any = {
      projectId: id,
      ...(request.user.role === 'EMPLOYEE' ? { status: 'APPROVED' } : {}),
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    };

    if (request.user.role === 'EMPLOYEE') {
      const entries = await prisma.timeEntry.findMany({
        where,
        select: employeeProjectHoursSelect,
        orderBy: { date: 'desc' },
      });
      return entries.map(toPublicProjectHoursEntry);
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      select: projectTimeEntrySelect,
      orderBy: { date: 'desc' },
    });

    return entries.map(toPublicProjectTimeEntry);
  });

  // Manager summary by employee for project
  fastify.get('/:id/manager-summary', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const where: any = {
      projectId: id,
      user: { companyId: request.user.companyId },
    };

    const dateFilter = parseDateFilter(from, to);
    if (!dateFilter) return reply.status(400).send({ error: 'Ange giltiga datum som YYYY-MM-DD där from inte är efter to' });
    if (Object.keys(dateFilter).length) where.date = dateFilter;

    const entries = await prisma.timeEntry.findMany({
      where,
      select: {
        userId: true,
        date: true,
        hours: true,
        billable: true,
        approvedBillingRateSnapshot: true,
        financialSnapshotCapturedAt: true,
        project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
        activity: { select: { rateOverride: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const getIsoWeek = (date: Date) => {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const weekdayLabels = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

    const byEmployeeWeek: Record<string, {
      userId: string;
      name: string;
      email: string;
      weekStartDate: Date;
      weekNumber: number;
      hours: number;
      billableHours: number;
      nonBillableHours: number;
      amount: number;
      entryCount: number;
      dayHours: Record<string, number>;
    }> = {};

    for (const entry of entries) {
      const weekStartDate = getWeekStartUtc(entry.date);
      const key = `${entry.userId}_${weekStartDate.toISOString()}`;

      if (!byEmployeeWeek[key]) {
        byEmployeeWeek[key] = {
          userId: entry.user.id,
          name: entry.user.name,
          email: entry.user.email,
          weekStartDate,
          weekNumber: getIsoWeek(weekStartDate),
          hours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          amount: 0,
          entryCount: 0,
          dayHours: { Mån: 0, Tis: 0, Ons: 0, Tor: 0, Fre: 0, Lör: 0, Sön: 0 },
        };
      }

      byEmployeeWeek[key].hours += entry.hours;
      byEmployeeWeek[key].entryCount += 1;
      const dayLabel = weekdayLabels[entry.date.getUTCDay()] || 'Okänd';
      byEmployeeWeek[key].dayHours[dayLabel] = (byEmployeeWeek[key].dayHours[dayLabel] || 0) + entry.hours;

      if (entry.billable) {
        byEmployeeWeek[key].billableHours += entry.hours;
        byEmployeeWeek[key].amount += entry.hours * getRate(entry);
      } else {
        byEmployeeWeek[key].nonBillableHours += entry.hours;
      }
    }

    const employeeWeekBreakdown = Object.values(byEmployeeWeek)
      .sort((a, b) => {
        if (b.weekStartDate.getTime() !== a.weekStartDate.getTime()) {
          return b.weekStartDate.getTime() - a.weekStartDate.getTime();
        }
        return b.hours - a.hours;
      })
      .map((row) => ({
        userId: row.userId,
        userName: row.name,
        weekStartDate: row.weekStartDate,
        weekNumber: row.weekNumber,
        totalHours: row.hours,
        billableHours: row.billableHours,
        nonBillableHours: row.nonBillableHours,
        entryCount: row.entryCount,
        dayHours: row.dayHours,
        amount: row.amount,
      }));

    return {
      project,
      period: { from: from || null, to: to || null },
      employeeBreakdown: employeeWeekBreakdown,
      totals: {
        totalHours: employeeWeekBreakdown.reduce((sum, e) => sum + e.totalHours, 0),
        totalBillableHours: employeeWeekBreakdown.reduce((sum, e) => sum + e.billableHours, 0),
        totalAmount: employeeWeekBreakdown.reduce((sum, e) => sum + e.amount, 0),
        employeeCount: new Set(employeeWeekBreakdown.map((e) => e.userId)).size,
      },
    };
  });

  // Create project
  fastify.post('/', {
    preHandler: [requireProjectCreator],
  }, async (request, reply) => {
    try {
      const body: z.infer<typeof createProjectSchema> = request.user.role === 'EMPLOYEE'
        ? employeeCreateProjectSchema.parse(request.body)
        : (request.user.role === 'ADMIN' ? createProjectSchema : createProjectSchema.omit({ budgetHours: true, fixedPrice: true, billingModel: true, defaultRate: true }).strict()).parse(request.body);
      if (!await customerBelongsToCompany(prisma, body.customerId, request.user.companyId, request.user.role === 'EMPLOYEE')) {
        return reply.status(400).send({ error: 'Kunden finns inte eller är inte tillgänglig i ditt företag' });
      }

      const requestedCode = body.code?.trim();
      let code = requestedCode || await getNextProjectCode(prisma, request.user.companyId);
      let project: any = null;

      for (let attempt = 0; attempt < 10; attempt += 1) {

      // Kontrollera att projektkod är unik inom företaget
      const existing = await prisma.project.findUnique({
        where: {
          companyId_code: {
            companyId: request.user.companyId,
            code,
          },
        },
      });

      if (existing) {
        if (requestedCode) {
          return reply.status(400).send({ error: 'Projektkoden finns redan' });
        }
        code = await getNextProjectCode(prisma, request.user.companyId);
        continue;
      }

      try {
        project = await prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
        data: {
          ...body,
          code,
          employeeCanSeeResults: body.employeeCanSeeResults ?? false,
          companyId: request.user.companyId,
        },
        include: {
          customer: { select: { id: true, name: true } },
        },
      });
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'CREATE',
            entityType: 'Project',
            entityId: created.id,
            newValue: JSON.stringify({ name: created.name, code: created.code, employeeCanSeeResults: created.employeeCanSeeResults }),
          },
        });
        await enqueueProjectChanged(tx, {
          companyId: request.user.companyId,
          projectId: created.id,
          entityId: created.id,
          action: 'CREATE',
          payload: { code: created.code, name: created.name, customerId: created.customerId },
        });
        return created;
        });
        break;
      } catch (error: any) {
        if (!requestedCode && error?.code === 'P2002') {
          code = await getNextProjectCode(prisma, request.user.companyId);
          continue;
        }
        throw error;
      }
      }

      if (!project) {
        return reply.status(409).send({ error: 'Kunde inte skapa ett unikt projektnummer. Försök igen.' });
      }

      return reply.status(201).send(sanitizeProjectForRole(project, canViewProjectFinancials(request.user.role)));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update project
  fastify.put('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = (request.user.role === 'ADMIN' ? projectSchema.partial() : projectSchema.omit({ budgetHours: true, fixedPrice: true, billingModel: true, defaultRate: true }).partial().strict()).parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      if (body.customerId !== undefined && !await customerBelongsToCompany(prisma, body.customerId, request.user.companyId)) {
        return reply.status(400).send({ error: 'Kunden finns inte i ditt företag' });
      }

      // Om kod ändras, kontrollera att den är unik inom företaget
      if (body.code && body.code !== project.code) {
        const existing = await prisma.project.findUnique({
          where: {
            companyId_code: {
              companyId: request.user.companyId,
              code: body.code,
            },
          },
        });
        if (existing) {
          return reply.status(400).send({ error: 'Projektkoden finns redan' });
        }
      }

      const updatedProject = await prisma.$transaction(async (tx) => {
        const updatedProject = await tx.project.update({
          where: { id },
          data: body,
          include: {
            customer: { select: { id: true, name: true } },
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'UPDATE',
            entityType: 'Project',
            entityId: id,
            oldValue: JSON.stringify({
              name: project.name,
              status: project.status,
              employeeCanSeeResults: project.employeeCanSeeResults,
            }),
            newValue: JSON.stringify(body),
          },
        });

        await enqueueProjectChanged(tx, {
          companyId: request.user.companyId,
          projectId: id,
          entityId: id,
          action: 'UPDATE',
          payload: {
            code: updatedProject.code,
            name: updatedProject.name,
            changedFields: Object.keys(body),
          },
        });

        return updatedProject;
      });

      return sanitizeProjectForRole(updatedProject, canViewProjectFinancials(request.user.role));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete project (soft delete)
  fastify.delete('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { active: false },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'DELETE',
          entityType: 'Project',
          entityId: id,
          oldValue: JSON.stringify({ name: project.name, code: project.code }),
        },
      });

      await enqueueProjectChanged(tx, {
        companyId: request.user.companyId,
        projectId: id,
        entityId: id,
        action: 'DELETE',
        payload: {
          softDelete: true,
          code: project.code,
          name: project.name,
        },
      });

    });

    return { message: 'Projekt inaktiverat' };
  });

  // Restoring a project preserves its previous status and all historical records.
  fastify.post('/:id/restore', { preHandler: [requireAdminOrSupervisor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, companyId: request.user.companyId } });
    if (!project) return reply.status(404).send({ error: 'Projekt hittades inte' });
    if (project.active) return sanitizeProjectForRole(project, canViewProjectFinancials(request.user.role));
    return prisma.$transaction(async (tx) => {
      const restored = await tx.project.update({ where: { id }, data: { active: true }, include: { customer: { select: { id: true, name: true } } } });
      await tx.auditLog.create({ data: { userId: request.user.id, action: 'UPDATE', entityType: 'Project', entityId: id, oldValue: JSON.stringify({ active: false }), newValue: JSON.stringify({ active: true }) } });
      await enqueueProjectChanged(tx, { companyId: request.user.companyId, projectId: id, entityId: id, action: 'UPDATE', payload: { code: restored.code, name: restored.name, changedFields: ['active'] } });
      return sanitizeProjectForRole(restored, canViewProjectFinancials(request.user.role));
    });
  });

  // Delete project permanently (hard delete)
  fastify.delete('/:id/permanent', {
    preHandler: [requireAdminOrSupervisor],
  }, async (_request, reply) => {
    return reply.status(409).send({ error: permanentDeletionDisabledMessage });
  });
};

}

export default createProjectRoutes();
