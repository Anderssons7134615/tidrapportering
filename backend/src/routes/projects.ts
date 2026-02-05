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
});

const requireAdminOrSupervisor = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  // List projects
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { status, customerId, active } = request.query as {
      status?: string;
      customerId?: string;
      active?: string;
    };

    const where: any = {};
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

        return {
          ...project,
          totalHours: totalHours._sum.hours || 0,
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

    if (!project) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    // Beräkna statistik
    const stats = await prisma.timeEntry.aggregate({
      where: { projectId: id },
      _sum: { hours: true },
    });

    const billableStats = await prisma.timeEntry.aggregate({
      where: { projectId: id, billable: true },
      _sum: { hours: true },
    });

    return {
      ...project,
      totalHours: stats._sum.hours || 0,
      billableHours: billableStats._sum.hours || 0,
    };
  });

  // Get project time entries
  fastify.get('/:id/time-entries', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

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

  // Create project
  fastify.post('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const body = projectSchema.parse(request.body);

      // Kontrollera att projektkod är unik
      const existing = await prisma.project.findUnique({
        where: { code: body.code },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Projektkoden finns redan' });
      }

      const project = await prisma.project.create({
        data: body,
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
          newValue: JSON.stringify({ name: project.name, code: project.code }),
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
      if (!project) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      // Om kod ändras, kontrollera att den är unik
      if (body.code && body.code !== project.code) {
        const existing = await prisma.project.findUnique({
          where: { code: body.code },
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
          oldValue: JSON.stringify({ name: project.name, status: project.status }),
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
    if (!project) {
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
};

export default projectRoutes;
