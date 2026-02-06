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
  // Get settings (per company)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    let settings = await prisma.settings.findUnique({
      where: { companyId: request.user.companyId },
    });

    // Skapa default settings om de inte finns
    if (!settings) {
      settings = await prisma.settings.create({
        data: { companyId: request.user.companyId },
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

      let settings = await prisma.settings.findUnique({
        where: { companyId: request.user.companyId },
      });

      if (settings) {
        settings = await prisma.settings.update({
          where: { companyId: request.user.companyId },
          data: body,
        });
      } else {
        settings = await prisma.settings.create({
          data: { ...body, companyId: request.user.companyId },
        });
      }

      // Uppdatera även företagsnamn i Company-tabellen om det ändras
      if (body.companyName) {
        await prisma.company.update({
          where: { id: request.user.companyId },
          data: { name: body.companyName },
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
