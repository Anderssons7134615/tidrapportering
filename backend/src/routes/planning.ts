import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { planningCommentSchema, savePlanningSchema } from '../lib/planning.js';
import { z } from 'zod';

const read = requireRoles(['ADMIN', 'SUPERVISOR', 'EMPLOYEE']);
const admin = requireRoles(['ADMIN'], 'Endast administratörer får ändra planeringen');
const commentSelect = { id: true, content: true, createdAt: true, author: { select: { id: true, name: true } } } as const;

export function createPlanningRoutes(db: PrismaClient): FastifyPluginAsync {
  return async app => {
    app.get('/', { preHandler: [read] }, async request => db.planningBoard.findUnique({ where: { companyId: request.user.companyId } }));
    app.put('/', { preHandler: [admin], bodyLimit: 1024 * 1024 }, async (request, reply) => {
      const { expectedRevision, document } = savePlanningSchema.parse(request.body);
      const companyId = request.user.companyId;
      if (expectedRevision === 0) {
        try { return await db.planningBoard.create({ data: { companyId, document } }); }
        catch (error) { if ((error as { code?: string }).code !== 'P2002') throw error; }
      } else {
        const saved = await db.$transaction(async tx => {
          const changed = await tx.planningBoard.updateMany({ where: { companyId, revision: expectedRevision }, data: { document, revision: { increment: 1 } } });
          return changed.count ? tx.planningBoard.findUnique({ where: { companyId } }) : null;
        });
        if (saved) return saved;
      }
      return reply.status(409).send({ error: 'Planeringen har ändrats. Din text finns kvar. Hämta aktuell plan innan du försöker spara igen.' });
    });
    app.get('/comments', { preHandler: [read] }, async request => {
      const { page } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(request.query);
      const items = await db.planningComment.findMany({ where: { companyId: request.user.companyId }, select: commentSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 51 });
      return { items: items.slice(0, 50), hasMore: items.length > 50 };
    });
    app.post('/comments', { preHandler: [read] }, async (request, reply) => {
      const { content, requestKey } = planningCommentSchema.parse(request.body);
      const { companyId, id: authorId } = request.user;
      const board = await db.planningBoard.findUnique({ where: { companyId }, select: { id: true } });
      if (!board) return reply.status(404).send({ error: 'Ingen planering har publicerats ännu' });
      const key = { companyId_authorId_requestKey: { companyId, authorId, requestKey } };
      const existing = await db.planningComment.findUnique({ where: key, select: commentSelect });
      if (existing) return existing.content === content ? existing : reply.status(409).send({ error: 'Kommentaren har redan skickats med annan text. Hämta kommentarerna.' });
      try { return await db.planningComment.create({ data: { companyId, boardId: board.id, authorId, content, requestKey }, select: commentSelect }); }
      catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const saved = await db.planningComment.findUnique({ where: key, select: commentSelect });
        if (saved?.content === content) return saved;
        return reply.status(409).send({ error: 'Kommentaren har redan skickats med annan text. Hämta kommentarerna.' });
      }
    });
  };
}
export default createPlanningRoutes(prisma);
