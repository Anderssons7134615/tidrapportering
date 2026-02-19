import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const workLogSchema = z.object({
  workItemId: z.string(),
  projectId: z.string().optional().nullable(),
  date: z.string(),
  quantity: z.number().positive(),
  minutes: z.number().int().positive(),
  note: z.string().optional().nullable(),
});

const workLogRoutes: FastifyPluginAsync = async (fastify) => {
  // List work logs
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { workItemId, projectId, from, to } = request.query as {
      workItemId?: string;
      projectId?: string;
      from?: string;
      to?: string;
    };

    const where: any = { companyId: request.user.companyId };

    // Employees only see own logs
    if (request.user.role === 'EMPLOYEE') {
      where.userId = request.user.id;
    }

    if (workItemId) where.workItemId = workItemId;
    if (projectId) where.projectId = projectId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    return prisma.workLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        workItem: { select: { id: true, name: true, unit: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
  });

  // Get stats per work item
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };

    const where: any = { companyId: request.user.companyId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const logs = await prisma.workLog.findMany({
      where,
      include: {
        workItem: { select: { id: true, name: true, unit: true } },
      },
    });

    // Aggregate per workItem
    const statsMap = new Map<string, {
      workItemId: string;
      name: string;
      unit: string;
      totalQuantity: number;
      totalMinutes: number;
      entryCount: number;
    }>();

    for (const log of logs) {
      const key = log.workItemId;
      const existing = statsMap.get(key);
      if (existing) {
        existing.totalQuantity += log.quantity;
        existing.totalMinutes += log.minutes;
        existing.entryCount += 1;
      } else {
        statsMap.set(key, {
          workItemId: log.workItemId,
          name: log.workItem.name,
          unit: log.workItem.unit,
          totalQuantity: log.quantity,
          totalMinutes: log.minutes,
          entryCount: 1,
        });
      }
    }

    return Array.from(statsMap.values()).map((s) => ({
      ...s,
      avgMinPerUnit: s.totalQuantity > 0
        ? Math.round((s.totalMinutes / s.totalQuantity) * 100) / 100
        : 0,
    }));
  });

  // Create work log
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = workLogSchema.parse(request.body);

      // Verify work item belongs to same company
      const workItem = await prisma.workItem.findUnique({ where: { id: body.workItemId } });
      if (!workItem || workItem.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Arbetsmoment hittades inte' });
      }

      const workLog = await prisma.workLog.create({
        data: {
          ...body,
          date: new Date(body.date),
          userId: request.user.id,
          companyId: request.user.companyId,
        },
        include: {
          user: { select: { id: true, name: true } },
          workItem: { select: { id: true, name: true, unit: true } },
          project: { select: { id: true, name: true } },
        },
      });

      return reply.status(201).send(workLog);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete work log
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const workLog = await prisma.workLog.findUnique({ where: { id } });
    if (!workLog || workLog.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Logg hittades inte' });
    }

    // Only own logs or admin
    if (workLog.userId !== request.user.id && request.user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Du kan bara ta bort egna loggar' });
    }

    await prisma.workLog.delete({ where: { id } });
    return { message: 'Logg borttagen' };
  });
};

export default workLogRoutes;
