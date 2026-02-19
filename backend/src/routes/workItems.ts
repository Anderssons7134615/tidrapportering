import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const workItemSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const requireAdmin = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (request.user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Endast admin har åtkomst' });
  }
};

const workItemRoutes: FastifyPluginAsync = async (fastify) => {
  // List all work items
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { active } = request.query as { active?: string };

    const where: any = { companyId: request.user.companyId };
    if (active !== undefined) where.active = active === 'true';

    return prisma.workItem.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  });

  // Create work item
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const body = workItemSchema.parse(request.body);

      const existing = await prisma.workItem.findUnique({
        where: {
          companyId_name: {
            companyId: request.user.companyId,
            name: body.name,
          },
        },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Arbetsmoment med det namnet finns redan' });
      }

      const workItem = await prisma.workItem.create({
        data: { ...body, companyId: request.user.companyId },
      });

      return reply.status(201).send(workItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update work item
  fastify.put('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = workItemSchema.partial().parse(request.body);

      const workItem = await prisma.workItem.findUnique({ where: { id } });
      if (!workItem || workItem.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Arbetsmoment hittades inte' });
      }

      if (body.name && body.name !== workItem.name) {
        const existing = await prisma.workItem.findUnique({
          where: {
            companyId_name: {
              companyId: request.user.companyId,
              name: body.name,
            },
          },
        });
        if (existing) {
          return reply.status(400).send({ error: 'Arbetsmoment med det namnet finns redan' });
        }
      }

      return prisma.workItem.update({ where: { id }, data: body });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete work item (soft delete if logs exist, hard delete otherwise)
  fastify.delete('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const workItem = await prisma.workItem.findUnique({ where: { id } });
    if (!workItem || workItem.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Arbetsmoment hittades inte' });
    }

    const logCount = await prisma.workLog.count({ where: { workItemId: id } });

    if (logCount > 0) {
      await prisma.workItem.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.workItem.delete({ where: { id } });
    }

    return { message: 'Arbetsmoment borttaget' };
  });
};

export default workItemRoutes;
