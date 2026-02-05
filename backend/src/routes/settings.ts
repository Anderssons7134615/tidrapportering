import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const settingsSchema = z.object({
  companyName: z.string().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  weekStartDay: z.number().min(0).max(6).optional(),
  csvDelimiter: z.string().optional(),
  defaultCurrency: z.string().optional(),
  reminderTime: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
});

const requireAdmin = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (request.user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Endast admin har åtkomst' });
  }
};

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get settings
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    let settings = await prisma.settings.findFirst();

    // Skapa default settings om de inte finns
    if (!settings) {
      settings = await prisma.settings.create({
        data: {},
      });
    }

    return settings;
  });

  // Update settings
  fastify.put('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const body = settingsSchema.parse(request.body);

      let settings = await prisma.settings.findFirst();

      if (settings) {
        settings = await prisma.settings.update({
          where: { id: settings.id },
          data: body,
        });
      } else {
        settings = await prisma.settings.create({
          data: body,
        });
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'Settings',
          entityId: settings.id,
          newValue: JSON.stringify(body),
        },
      });

      return settings;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });
};

export default settingsRoutes;
