import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const activitySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1),
  category: z.enum(['WORK', 'TRAVEL', 'MEETING', 'INTERNAL', 'CHANGE_ORDER', 'ABSENCE']).optional(),
  billableDefault: z.boolean().optional(),
  rateOverride: z.number().optional().nullable(),
  sortOrder: z.number().optional(),
});

const requireAdmin = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (request.user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Endast admin har åtkomst' });
  }
};

const activityRoutes: FastifyPluginAsync = async (fastify) => {
  // List activities (same company)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { active, category } = request.query as { active?: string; category?: string };

    const where: any = { companyId: request.user.companyId };
    if (active !== undefined) where.active = active === 'true';
    if (category) where.category = category;

    const activities = await prisma.activity.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return activities;
  });

  // Get activity by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity || activity.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Aktivitet hittades inte' });
    }

    return activity;
  });

  // Create activity
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const body = activitySchema.parse(request.body);

      // Kontrollera att kod är unik inom företaget
      const existing = await prisma.activity.findUnique({
        where: {
          companyId_code: {
            companyId: request.user.companyId,
            code: body.code,
          },
        },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Aktivitetskoden finns redan' });
      }

      const activity = await prisma.activity.create({
        data: { ...body, companyId: request.user.companyId },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'Activity',
          entityId: activity.id,
          newValue: JSON.stringify({ name: activity.name, code: activity.code }),
        },
      });

      return reply.status(201).send(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update activity
  fastify.put('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = activitySchema.partial().parse(request.body);

      const activity = await prisma.activity.findUnique({ where: { id } });
      if (!activity || activity.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Aktivitet hittades inte' });
      }

      // Om kod ändras, kontrollera att den är unik inom företaget
      if (body.code && body.code !== activity.code) {
        const existing = await prisma.activity.findUnique({
          where: {
            companyId_code: {
              companyId: request.user.companyId,
              code: body.code,
            },
          },
        });
        if (existing) {
          return reply.status(400).send({ error: 'Aktivitetskoden finns redan' });
        }
      }

      const updatedActivity = await prisma.activity.update({
        where: { id },
        data: body,
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'Activity',
          entityId: id,
          oldValue: JSON.stringify({ name: activity.name }),
          newValue: JSON.stringify(body),
        },
      });

      return updatedActivity;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete activity (soft delete)
  fastify.delete('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const activity = await prisma.activity.findUnique({ where: { id } });
    if (!activity || activity.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Aktivitet hittades inte' });
    }

    // Kontrollera om aktiviteten används
    const usageCount = await prisma.timeEntry.count({
      where: { activityId: id },
    });

    if (usageCount > 0) {
      // Soft delete om den används
      await prisma.activity.update({
        where: { id },
        data: { active: false },
      });
    } else {
      // Hard delete om den inte används
      await prisma.activity.delete({ where: { id } });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'Activity',
        entityId: id,
        oldValue: JSON.stringify({ name: activity.name, code: activity.code }),
      },
    });

    return { message: 'Aktivitet borttagen' };
  });
};

export default activityRoutes;
