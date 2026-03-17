import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const projectSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  code: z.string().min(1),
  site: z.string().optional().nullable(),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'INVOICED']).optional(),
  budgetHours: z.number().optional().nullable(),
  billingModel: z.enum(['HOURLY', 'FIXED']).optional(),
  defaultRate: z.number().optional().nullable(),
  employeeCanSeeResults: z.boolean().optional(),
});

const requireAdminOrSupervisor = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const shouldHideResultsForEmployee = (role: string, project: { employeeCanSeeResults: boolean }) => {
  return role === 'EMPLOYEE' && !project.employeeCanSeeResults;
};

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  // List projects (same company)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
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
        const totalHours = await prisma.timeEntry.aggregate({
          where: { projectId: project.id },
          _sum: { hours: true },
        });

        const hideResults = shouldHideResultsForEmployee(request.user.role, project);

        return {
          ...project,
          resultsVisibleToCurrentUser: !hideResults,
          totalHours: hideResults ? null : (totalHours._sum.hours || 0),
        };
      })
    );

    return projectsWithHours;
  });

  // Get project by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
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

    const hideResults = shouldHideResultsForEmployee(request.user.role, project);

    // Beräkna statistik
    const stats = hideResults
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id },
          _sum: { hours: true },
        });

    const billableStats = hideResults
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id, billable: true },
          _sum: { hours: true },
        });

    return {
      ...project,
      resultsVisibleToCurrentUser: !hideResults,
      totalHours: hideResults ? null : (stats?._sum.hours || 0),
      billableHours: hideResults ? null : (billableStats?._sum.hours || 0),
    };
  });

  // Get project time entries
  fastify.get('/:id/time-entries', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    // Verify project belongs to company
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    if (shouldHideResultsForEmployee(request.user.role, project)) {
      return reply.status(403).send({ error: 'Projektresultat är inte synliga för anställda i detta projekt' });
    }

    const where: any = { projectId: id };
    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: new Date(to) };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        activity: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
    });

    return entries;
  });

  // Manager summary by employee for project
  fastify.get('/:id/manager-summary', {
    preHandler: [requireAdminOrSupervisor],
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

    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: new Date(to) };

    const entries = await prisma.timeEntry.findMany({
      where,
      select: {
        userId: true,
        date: true,
        hours: true,
        billable: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getIsoWeek = (date: Date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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
      entryCount: number;
      dayHours: Record<string, number>;
    }> = {};

    for (const entry of entries) {
      const weekStartDate = getWeekStart(entry.date);
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
          entryCount: 0,
          dayHours: { Mån: 0, Tis: 0, Ons: 0, Tor: 0, Fre: 0, Lör: 0, Sön: 0 },
        };
      }

      byEmployeeWeek[key].hours += entry.hours;
      byEmployeeWeek[key].entryCount += 1;
      const dayLabel = weekdayLabels[entry.date.getDay()] || 'Okänd';
      byEmployeeWeek[key].dayHours[dayLabel] = (byEmployeeWeek[key].dayHours[dayLabel] || 0) + entry.hours;

      if (entry.billable) {
        byEmployeeWeek[key].billableHours += entry.hours;
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
        amount: 0,
      }));

    return {
      project,
      period: { from: from || null, to: to || null },
      employeeBreakdown: employeeWeekBreakdown,
      totals: {
        totalHours: employeeWeekBreakdown.reduce((sum, e) => sum + e.totalHours, 0),
        totalBillableHours: employeeWeekBreakdown.reduce((sum, e) => sum + e.billableHours, 0),
        employeeCount: new Set(employeeWeekBreakdown.map((e) => e.userId)).size,
      },
    };
  });

  // Create project
  fastify.post('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const body = projectSchema.parse(request.body);

      // Kontrollera att projektkod är unik inom företaget
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

      const project = await prisma.project.create({
        data: {
          ...body,
          employeeCanSeeResults: body.employeeCanSeeResults ?? false,
          companyId: request.user.companyId,
        },
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'Project',
          entityId: project.id,
          newValue: JSON.stringify({
            name: project.name,
            code: project.code,
            employeeCanSeeResults: project.employeeCanSeeResults,
          }),
        },
      });

      return reply.status(201).send(project);
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
      const body = projectSchema.partial().parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
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

      const updatedProject = await prisma.project.update({
        where: { id },
        data: body,
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
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

      return updatedProject;
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

    await prisma.project.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'Project',
        entityId: id,
        oldValue: JSON.stringify({ name: project.name, code: project.code }),
      },
    });

    return { message: 'Projekt inaktiverat' };
  });

  // Delete project permanently (hard delete)
  fastify.delete('/:id/permanent', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    await prisma.$transaction([
      prisma.attachment.deleteMany({ where: { timeEntry: { projectId: id } } }),
      prisma.timeEntry.deleteMany({ where: { projectId: id } }),
      prisma.workLog.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'Project',
        entityId: id,
        oldValue: JSON.stringify({ name: project.name, code: project.code, permanent: true }),
      },
    });

    return { message: 'Projekt raderat permanent' };
  });
};

export default projectRoutes;
