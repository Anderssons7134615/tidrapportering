import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { createInventoryService, inventoryItemSchema, inventoryShelfSchema, movementSchema } from '../lib/inventory.js';

export function createInventoryRoutes(db = prisma): FastifyPluginAsync {
  return async (app) => {
    const service = createInventoryService(db);
    app.addHook('preHandler', requireRoles(['ADMIN', 'SUPERVISOR', 'EMPLOYEE']));
    app.setErrorHandler((error: any, _, reply) => {
      if (error instanceof z.ZodError) return reply.status(400).send({ error: error.issues[0]?.message || 'Ogiltig data' });
      if (error.statusCode) return reply.status(error.statusCode).send({ error: error.message });
      app.log.error(error);
      return reply.status(500).send({ error: 'Registreringen kunde inte bekräftas. Försök igen med samma uppgifter.' });
    });
    app.get('/items', async (req) => service.list(req.user));
    app.post('/items', async (req, reply) => reply.status(201).send(await service.addItem(req.user, inventoryItemSchema.parse(req.body))));
    app.patch('/items/:id', async (req) => service.setShelf(req.user, z.object({ id: z.string().uuid() }).parse(req.params).id, inventoryShelfSchema.parse(req.body)));
    app.get('/items/:id/history', async (req) => {
      const { page } = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).parse(req.query);
      return service.history(req.user, z.object({ id: z.string().uuid() }).parse(req.params).id, page);
    });
    app.post('/items/:id/movements', async (req, reply) => reply.status(201).send(await service.move(req.user, z.object({ id: z.string().uuid() }).parse(req.params).id, movementSchema.parse(req.body))));
  };
}
export default createInventoryRoutes();
