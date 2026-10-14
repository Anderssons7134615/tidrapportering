import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { CalculationError, calculationImportSchema, inspectCalculationV1 } from '../lib/projectCalculations.js';

const importBody = z.object({
  calculation: calculationImportSchema,
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal(true),
}).strict();

export function createProjectCalculationRoutes(db = prisma): FastifyPluginAsync {
  return async app => {
    app.addHook('preHandler', requireRoles(['ADMIN']));
    async function project(projectId: string, companyId: string, write = false, client: Pick<typeof db, 'project'> = db) {
      const value = await client.project.findFirst({ where: { id: projectId, companyId }, select: { id: true, active: true } });
      if (!value) throw new CalculationError('Projektet hittades inte.', 404);
      if (write && !value.active) throw new CalculationError('Projektet är inaktivt. Tidigare kalkyler kan fortfarande läsas.', 409);
      return value;
    }
    app.get('/:projectId', async request => {
      const { projectId } = request.params as { projectId: string };
      await project(projectId, request.user.companyId);
      return db.projectCalculation.findMany({ where: { projectId, companyId: request.user.companyId },
        select: { id: true, name: true, sourceId: true, sourceRevision: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 });
    });
    app.get('/:projectId/:id', async request => {
      const { projectId, id } = request.params as { projectId: string; id: string };
      const row = await db.projectCalculation.findFirst({ where: { id, projectId, companyId: request.user.companyId },
        include: { createdByUser: { select: { name: true } } } });
      if (!row) throw new CalculationError('Kalkylen hittades inte.', 404);
      if (row.schemaVersion !== 1) throw new CalculationError('Kalkylversionen stöds inte av denna appversion.', 409);
      return { id: row.id, createdAt: row.createdAt, importedBy: row.createdByUser.name,
        ...inspectCalculationV1({ format: 'andersson-kalkyl-v1', document: row.snapshot }) };
    });
    app.post('/:projectId/preview', { bodyLimit: 2 * 1024 * 1024 }, async request => {
      await project((request.params as { projectId: string }).projectId, request.user.companyId, true);
      return inspectCalculationV1(request.body);
    });
    app.post('/:projectId/import', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const companyId = request.user.companyId;
      const body = importBody.parse(request.body);
      const preview = inspectCalculationV1(body.calculation);
      if (preview.document.id.startsWith('tidapp-')) throw new CalculationError('TidApps kalkyler sparas via kalkyleditorn.');
      if (body.expectedFingerprint !== preview.fingerprint) throw new CalculationError('Filen ändrades efter granskningen. Granska den igen.', 409);
      const identity = { companyId, sourceId: preview.document.id, sourceRevision: preview.document.revision };
      const existing = async (client: Pick<typeof db, 'projectCalculation'>) => {
        const row = await client.projectCalculation.findUnique({ where: { companyId_sourceId_sourceRevision: identity } });
        if (!row) return null;
        if (row.fingerprint !== preview.fingerprint) throw new CalculationError('Denna källversion finns redan med annat innehåll. Skapa en ny revision i kalkylprogrammet.', 409);
        if (row.projectId !== projectId) throw new CalculationError('Denna kalkylversion är redan kopplad till ett annat projekt.', 409);
        return { id: row.id, duplicate: true };
      };
      try {
        const result = await db.$transaction(async tx => {
          await project(projectId, companyId, true, tx);
          const replay = await existing(tx);
          if (replay) return replay;
          const row = await tx.projectCalculation.create({ data: {
            ...identity, projectId, schemaVersion: 1, createdByUserId: request.user.id,
            name: preview.document.name, fingerprint: preview.fingerprint,
            snapshot: preview.document as Prisma.InputJsonValue,
          } });
          await tx.auditLog.create({ data: { userId: request.user.id, action: 'CREATE', entityType: 'ProjectCalculation', entityId: row.id,
            newValue: JSON.stringify({ projectId, ...identity, fingerprint: preview.fingerprint }) } });
          return { id: row.id, duplicate: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return reply.code(result.duplicate ? 200 : 201).send(result);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          const replay = await existing(db);
          if (replay) return replay;
          throw new CalculationError('Projektet ändrades samtidigt. Granska och försök igen.', 409);
        }
        throw error;
      }
    });
  };
}
export default createProjectCalculationRoutes();
