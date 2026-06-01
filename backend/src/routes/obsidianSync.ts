import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import { getProjectMetrics } from '../lib/projectMetrics.js';

function requireSyncRole(role: string) {
  return ['ADMIN', 'SUPERVISOR'].includes(role);
}

const errorSchema = z.object({
  error: z.string().min(1).max(5000),
});

const obsidianSyncRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/events', async (request, reply) => {
    if (!requireSyncRole(request.user.role)) {
      return reply.status(403).send({ error: 'Endast admin/arbetsledare kan synka Obsidian' });
    }

    const { limit } = request.query as { limit?: string };
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const events = await prisma.obsidianSyncEvent.findMany({
      where: {
        companyId: request.user.companyId,
        ackedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return { events };
  });

  fastify.post('/events/:id/ack', async (request, reply) => {
    if (!requireSyncRole(request.user.role)) {
      return reply.status(403).send({ error: 'Endast admin/arbetsledare kan synka Obsidian' });
    }

    const { id } = request.params as { id: string };
    const result = await prisma.obsidianSyncEvent.updateMany({
      where: { id, companyId: request.user.companyId },
      data: {
        ackedAt: new Date(),
        ackedBy: request.user.id,
        error: null,
      },
    });

    if (result.count === 0) {
      return reply.status(404).send({ error: 'Sync-event hittades inte' });
    }

    return { ok: true };
  });

  fastify.post('/events/:id/error', async (request, reply) => {
    if (!requireSyncRole(request.user.role)) {
      return reply.status(403).send({ error: 'Endast admin/arbetsledare kan synka Obsidian' });
    }

    const { id } = request.params as { id: string };
    const body = errorSchema.parse(request.body);
    const result = await prisma.obsidianSyncEvent.updateMany({
      where: { id, companyId: request.user.companyId },
      data: {
        error: body.error,
        attempts: { increment: 1 },
      },
    });

    if (result.count === 0) {
      return reply.status(404).send({ error: 'Sync-event hittades inte' });
    }

    return { ok: true };
  });

  fastify.get('/projects/:id/snapshot', async (request, reply) => {
    if (!requireSyncRole(request.user.role)) {
      return reply.status(403).send({ error: 'Endast admin/arbetsledare kan synka Obsidian' });
    }

    const { id } = request.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, companyId: request.user.companyId },
      include: { customer: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Projekt hittades inte', deleted: true, projectId: id });
    }

    const [metrics, timeEntries, materials] = await Promise.all([
      getProjectMetrics(prisma, project),
      prisma.timeEntry.findMany({
        where: { projectId: id, user: { companyId: request.user.companyId } },
        include: {
          user: { select: { id: true, name: true, email: true, hourlyCost: true } },
          activity: { select: { id: true, name: true, code: true, category: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.projectMaterial.findMany({
        where: { projectId: id },
        include: {
          createdByUser: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      project,
      customer: project.customer,
      metrics,
      timeEntries,
      materials,
      generatedAt: new Date().toISOString(),
    };
  });
};

export default obsidianSyncRoutes;
