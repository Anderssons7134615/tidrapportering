import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { CalculationError, inspectCalculationV1 } from '../lib/projectCalculations.js';
import { editorBodySchema, editorPreview, checkReadyToLock } from '../lib/calculationEditor.js';

const lockBody = z.object({ expectedRevision: z.number().int().positive(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/), reviewed: z.literal(true) }).strict();
export function createCalculationEditorRoutes(db = prisma): FastifyPluginAsync {
  return async app => {
    app.addHook('preHandler', requireRoles(['ADMIN']));
    const params = (request: any) => z.object({ projectId: z.string().min(1), draftId: z.string().uuid().optional() }).parse(request.params);
    async function project(client: Pick<typeof db, 'project'>, projectId: string, companyId: string, write = false) {
      const row = await client.project.findFirst({ where: { id: projectId, companyId }, select: { active: true } });
      if (!row) throw new CalculationError('Projektet hittades inte.', 404);
      if (write && !row.active) throw new CalculationError('Projektet är inaktivt. Kalkylerna kan fortfarande läsas.', 409);
    }
    const present = (row: any) => ({ id: row.id, revision: row.revision, updatedAt: row.updatedAt, lockedCalculationId: row.lockedCalculationId,
      ...inspectCalculationV1({ format: 'andersson-kalkyl-v1', document: row.snapshot }) });
    app.get('/:projectId/editor', async request => {
      const { projectId } = params(request); const companyId = request.user.companyId;
      await project(db, projectId, companyId);
      return db.projectCalculationDraft.findMany({ where: { projectId, companyId, lockedCalculationId: null },
        select: { id: true, name: true, revision: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 200 });
    });
    app.get('/:projectId/editor/:draftId', async request => {
      const { projectId, draftId } = params(request); const companyId = request.user.companyId;
      await project(db, projectId, companyId);
      const row = await db.projectCalculationDraft.findFirst({ where: { id: draftId, projectId, companyId } });
      return row ? present(row) : null;
    });
    app.post('/:projectId/editor/:draftId/preview', { bodyLimit: 2 * 1024 * 1024 }, async request => {
      const { projectId, draftId } = params(request);
      await project(db, projectId, request.user.companyId, true);
      return editorPreview(draftId!, request.body);
    });
    app.put('/:projectId/editor/:draftId', { bodyLimit: 2 * 1024 * 1024 }, async request => {
      const { projectId, draftId } = params(request); const companyId = request.user.companyId;
      const body = editorBodySchema.parse(request.body), preview = editorPreview(draftId!, body);
      const where = { id: draftId!, projectId, companyId };
      const replay = (row: any) => row && row.revision === body.expectedRevision + 1 && row.fingerprint === preview.fingerprint;
      try {
        return await db.$transaction(async tx => {
          await project(tx, projectId, companyId);
          const current = await tx.projectCalculationDraft.findFirst({ where });
          if (replay(current)) return present(current);
          await project(tx, projectId, companyId, true);
          if (current?.lockedCalculationId) throw new CalculationError('Kalkylen är låst. Kopiera den för att fortsätta.', 409);
          if ((current?.revision ?? 0) !== body.expectedRevision) throw new CalculationError('Utkastet har ändrats. Hämta den sparade versionen innan du fortsätter.', 409);
          const data = { name: preview.document.name, revision: preview.document.revision, snapshot: preview.document as Prisma.InputJsonValue, fingerprint: preview.fingerprint };
          let row;
          if (current) {
            const result = await tx.projectCalculationDraft.updateMany({ where: { ...where, revision: body.expectedRevision, lockedCalculationId: null }, data });
            if (result.count !== 1) throw new CalculationError('Utkastet ändrades samtidigt. Hämta sparad version.', 409);
            row = await tx.projectCalculationDraft.findFirstOrThrow({ where });
          } else row = await tx.projectCalculationDraft.create({ data: { ...where, createdByUserId: request.user.id, ...data } });
          await tx.auditLog.create({ data: { userId: request.user.id, action: current ? 'UPDATE' : 'CREATE', entityType: 'ProjectCalculationDraft', entityId: row.id,
            newValue: JSON.stringify({ projectId, revision: row.revision, fingerprint: row.fingerprint }) } });
          return present(row);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          await project(db, projectId, companyId);
          const row = await db.projectCalculationDraft.findFirst({ where });
          if (replay(row)) return present(row);
          throw new CalculationError('Utkastet ändrades samtidigt. Hämta sparad version.', 409);
        }
        throw error;
      }
    });
    app.post('/:projectId/editor/:draftId/lock', async request => {
      const { projectId, draftId } = params(request); const companyId = request.user.companyId;
      const body = lockBody.parse(request.body), where = { id: draftId!, projectId, companyId };
      const matches = (row: any) => row && row.revision === body.expectedRevision && row.fingerprint === body.expectedFingerprint;
      try {
        return await db.$transaction(async tx => {
          await project(tx, projectId, companyId);
          const row = await tx.projectCalculationDraft.findFirst({ where });
          if (!row) throw new CalculationError('Utkastet hittades inte.', 404);
          if (!matches(row)) throw new CalculationError('Utkastet har ändrats. Hämta och granska den sparade versionen.', 409);
          if (row.lockedCalculationId) return { id: row.lockedCalculationId };
          await project(tx, projectId, companyId, true);
          const value = inspectCalculationV1({ format: 'andersson-kalkyl-v1', document: row.snapshot });
          checkReadyToLock(value.document);
          const version = await tx.projectCalculation.create({ data: { companyId, projectId, createdByUserId: request.user.id,
            sourceId: value.document.id, sourceRevision: row.revision, name: row.name, snapshot: row.snapshot as Prisma.InputJsonValue, fingerprint: row.fingerprint } });
          const changed = await tx.projectCalculationDraft.updateMany({ where: { ...where, revision: body.expectedRevision, lockedCalculationId: null }, data: { lockedCalculationId: version.id } });
          if (changed.count !== 1) throw new CalculationError('Utkastet ändrades samtidigt.', 409);
          await tx.auditLog.create({ data: { userId: request.user.id, action: 'CREATE', entityType: 'ProjectCalculation', entityId: version.id,
            newValue: JSON.stringify({ projectId, draftId, revision: row.revision, fingerprint: row.fingerprint }) } });
          return { id: version.id };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          await project(db, projectId, companyId);
          const row = await db.projectCalculationDraft.findFirst({ where });
          if (matches(row) && row?.lockedCalculationId) return { id: row.lockedCalculationId };
          throw new CalculationError('Utkastet ändrades samtidigt. Hämta och granska sparad version.', 409);
        }
        throw error;
      }
    });
  };
}
export default createCalculationEditorRoutes();
