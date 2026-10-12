import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { enqueueMaterialChanged } from './obsidianSync.js';
import { getDateOnlyInTimeZone } from './dateOnly.js';

export type InventoryActor = { id: string; companyId: string; role: string };
export class InventoryError extends Error {
  constructor(message: string, public statusCode = 409) { super(message); }
}
const quantity = z.number().finite().min(0).max(1_000_000)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, 'Använd högst tre decimaler');
const positiveQuantity = quantity.refine((value) => value > 0, 'Mängden måste vara större än noll');
const base = { requestKey: z.string().uuid(), revision: z.number().int().positive(), note: z.string().trim().max(500).default('') };
export const movementSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('RECEIPT'), quantity: positiveQuantity }).strict(),
  z.object({ ...base, kind: z.literal('ISSUE'), quantity: positiveQuantity, projectId: z.string().uuid() }).strict(),
  z.object({ ...base, kind: z.literal('RETURN'), quantity: positiveQuantity, sourceIssueId: z.string().uuid() }).strict(),
  z.object({ ...base, kind: z.literal('COUNT'), quantity, note: z.string().trim().min(2, 'Ange orsak till inventeringen').max(500) }).strict(),
]);
export type MovementInput = z.infer<typeof movementSchema>;
export const inventoryItemSchema = z.object({ articleId: z.string().uuid(), shelf: z.string().trim().max(80).default('') }).strict();
export const inventoryShelfSchema = z.object({ revision: z.number().int().positive(), shelf: z.string().trim().max(80) }).strict();
const manager = (actor: InventoryActor) => ['ADMIN', 'SUPERVISOR'].includes(actor.role);
function access(actor: InventoryActor, manage = false) {
  if (!(manager(actor) || (!manage && actor.role === 'EMPLOYEE'))) throw new InventoryError('Åtkomst nekad', 403);
}
const visibleArticle = (actor: InventoryActor) => actor.role === 'EMPLOYEE' ? { employeeVisible: true } : {};
const articleSelect = { id: true, name: true, articleNumber: true, category: true, active: true, employeeVisible: true, unit: true, pipeDimensionMm: true, insulationThicknessMm: true } as const;
const conflict = () => new InventoryError('Lagret har ändrats. Uppdatera saldot och kontrollera mängden innan du försöker igen.');
const movementResult = (row: { id: string; itemId: string; kind: string; deltaMilli: number; balanceAfterMilli: number }) => ({ id: row.id, itemId: row.itemId, kind: row.kind, quantityDelta: row.deltaMilli / 1000, balanceAfter: row.balanceAfterMilli / 1000 });

export function createInventoryService(db: PrismaClient) {
  async function itemFor(actor: InventoryActor, id: string) {
    access(actor);
    const item = await db.inventoryItem.findFirst({ where: { id, companyId: actor.companyId, article: visibleArticle(actor) }, include: { article: { select: articleSelect } } });
    if (!item) throw new InventoryError('Lagerartikeln hittades inte', 404);
    return item;
  }
  async function replay(actor: InventoryActor, key: string, hash: string) {
    const previous = await db.inventoryMovement.findUnique({ where: { companyId_requestKey: { companyId: actor.companyId, requestKey: key } } });
    if (!previous) return null;
    if (previous.requestHash !== hash || previous.createdByUserId !== actor.id) throw new InventoryError('Registreringsnyckeln har redan använts för en annan registrering.');
    return movementResult(previous);
  }
  return {
    async list(actor: InventoryActor) {
      access(actor);
      // A consistent snapshot keeps displayed revision and calculated balance together.
      return db.$transaction(async (tx) => {
        const items = await tx.inventoryItem.findMany({ where: { companyId: actor.companyId, article: visibleArticle(actor) }, include: { article: { select: articleSelect } }, orderBy: { article: { name: 'asc' } } });
        const totals = await tx.inventoryMovement.groupBy({ by: ['itemId'], where: { companyId: actor.companyId }, _sum: { deltaMilli: true } });
        return items.map(({ companyId: _, ...item }) => ({ ...item, balance: (totals.find((total) => total.itemId === item.id)?._sum.deltaMilli || 0) / 1000 }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    },
    async history(actor: InventoryActor, id: string, page: number) {
      await itemFor(actor, id);
      const where = { itemId: id, companyId: actor.companyId };
      const [rows, total] = await Promise.all([
        db.inventoryMovement.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, skip: (page - 1) * 30,
          include: { createdByUser: { select: { id: true, name: true } }, project: { select: { id: true, code: true, name: true, active: true } },
            projectMaterial: { select: { invoiceStatus: true } }, returns: { select: { deltaMilli: true } } } }),
        db.inventoryMovement.count({ where }),
      ]);
      return { page, total, items: rows.map((row) => ({ ...movementResult(row), articleName: row.articleName, unit: row.unit, note: row.note,
        createdAt: row.createdAt, createdByUser: row.createdByUser, project: row.project, sourceIssueId: row.sourceIssueId,
        returnableQuantity: row.kind === 'ISSUE' && row.project?.active && row.projectMaterial?.invoiceStatus !== 'INVOICED' && (manager(actor) || row.createdByUserId === actor.id)
          ? Math.max(0, -row.deltaMilli - row.returns.reduce((sum, ret) => sum + ret.deltaMilli, 0)) / 1000 : 0,
      })) };
    },
    async addItem(actor: InventoryActor, input: z.infer<typeof inventoryItemSchema>) {
      access(actor, true);
      try {
        return await db.$transaction(async (tx) => {
          const article = await tx.materialArticle.findFirst({ where: { id: input.articleId, companyId: actor.companyId, active: true } });
          if (!article) throw new InventoryError('Välj en aktiv materialartikel i ditt företag', 400);
          const item = await tx.inventoryItem.create({ data: { companyId: actor.companyId, articleId: article.id, unit: article.unit, shelf: input.shelf } });
          await tx.auditLog.create({ data: { userId: actor.id, action: 'CREATE', entityType: 'InventoryItem', entityId: item.id, newValue: JSON.stringify({ articleId: article.id, unit: item.unit, shelf: item.shelf }) } });
          return { id: item.id };
        });
      } catch (error: any) {
        if (error.code === 'P2002') throw new InventoryError('Artikeln finns redan i lagret.');
        throw error;
      }
    },
    async setShelf(actor: InventoryActor, id: string, input: z.infer<typeof inventoryShelfSchema>) {
      access(actor, true);
      await itemFor(actor, id);
      await db.$transaction(async (tx) => {
        const updated = await tx.inventoryItem.updateMany({ where: { id, companyId: actor.companyId, revision: input.revision }, data: { shelf: input.shelf, revision: { increment: 1 } } });
        if (!updated.count) throw conflict();
        await tx.auditLog.create({ data: { userId: actor.id, action: 'UPDATE', entityType: 'InventoryItem', entityId: id, newValue: JSON.stringify({ shelf: input.shelf }) } });
      });
      return { id };
    },
    async move(actor: InventoryActor, id: string, input: MovementInput) {
      access(actor, input.kind === 'RECEIPT' || input.kind === 'COUNT');
      const hash = createHash('sha256').update(JSON.stringify({ actorId: actor.id, itemId: id, ...input })).digest('hex');
      const previous = await replay(actor, input.requestKey, hash);
      if (previous) return previous;
      try {
        return await db.$transaction(async (tx) => {
          const item = await tx.inventoryItem.findFirst({ where: { id, companyId: actor.companyId, article: visibleArticle(actor) }, include: { article: true } });
          if (!item) throw new InventoryError('Lagerartikeln hittades inte', 404);
          const changed = await tx.inventoryItem.updateMany({ where: { id, companyId: actor.companyId, revision: input.revision }, data: { revision: { increment: 1 } } });
          if (!changed.count) throw conflict();
          const aggregate = await tx.inventoryMovement.aggregate({ where: { itemId: id, companyId: actor.companyId }, _sum: { deltaMilli: true } });
          const current = aggregate._sum.deltaMilli || 0;
          const milli = Math.round(input.quantity * 1000);
          let delta = input.kind === 'COUNT' ? milli - current : input.kind === 'ISSUE' ? -milli : milli;
          let projectId = input.kind === 'ISSUE' ? input.projectId : null;
          let source: Awaited<ReturnType<typeof tx.inventoryMovement.findFirst>> | null = null;
          let originalMaterial: Awaited<ReturnType<typeof tx.projectMaterial.findFirst>> | null = null;
          if (input.kind === 'RETURN') {
            source = await tx.inventoryMovement.findFirst({ where: { id: input.sourceIssueId, companyId: actor.companyId, itemId: id, kind: 'ISSUE', ...(manager(actor) ? {} : { createdByUserId: actor.id }) } });
            if (!source) throw new InventoryError('Uttaget hittades inte eller får inte returneras av dig', 404);
            const returned = await tx.inventoryMovement.aggregate({ where: { sourceIssueId: source.id, companyId: actor.companyId }, _sum: { deltaMilli: true } });
            if (milli > -source.deltaMilli - (returned._sum.deltaMilli || 0)) throw new InventoryError('Returen är större än kvarvarande mängd på uttaget.');
            originalMaterial = await tx.projectMaterial.findUnique({ where: { inventoryMovementId: source.id } });
            if (!originalMaterial || originalMaterial.invoiceStatus === 'INVOICED') throw new InventoryError('Fakturerat material får inte returneras. Kontakta arbetsledaren.');
            projectId = source.projectId;
          }
          if (projectId) {
            const project = await tx.project.findFirst({ where: { id: projectId, companyId: actor.companyId, active: true } });
            if (!project) throw new InventoryError('Projektet är inte aktivt eller tillhör inte ditt företag.', 400);
          }
          if (input.kind === 'ISSUE' || input.kind === 'RECEIPT') {
            if (!item.article.active) throw new InventoryError('Artikeln är inaktiv. Aktivera den i materialregistret först.');
            if (item.unit !== item.article.unit) throw new InventoryError(`Artikelns enhet har ändrats. Lagret använder ${item.unit}. Kontakta arbetsledaren innan registrering.`);
          }
          const next = current + delta;
          if (next < 0) throw new InventoryError('Det finns inte tillräckligt i lagret. Uppdatera saldot eller kontakta arbetsledaren.');
          if (next > 1_000_000_000) throw new InventoryError('Lagersaldot skulle bli för stort.', 400);
          const movement = await tx.inventoryMovement.create({ data: { companyId: actor.companyId, itemId: id, kind: input.kind, deltaMilli: delta, balanceAfterMilli: next,
            articleName: source?.articleName || item.article.name, unit: item.unit, note: input.note, createdByUserId: actor.id, projectId,
            sourceIssueId: input.kind === 'RETURN' ? input.sourceIssueId : null, requestKey: input.requestKey, requestHash: hash } });
          let materialId: string | null = null;
          if (input.kind === 'ISSUE') {
            const material = await tx.projectMaterial.create({ data: { projectId: projectId!, articleId: item.articleId, inventoryMovementId: movement.id, createdByUserId: actor.id,
              articleName: item.article.name, articleNumber: item.article.articleNumber, unit: item.unit, purchasePrice: item.article.purchasePrice, unitPrice: item.article.defaultUnitPrice,
              quantity: input.quantity, date: getDateOnlyInTimeZone(movement.createdAt), note: input.note || 'Uttag från lagret' } });
            materialId = material.id;
          } else if (originalMaterial) {
            // Keep the original price snapshot and row. The immutable ledger retains each return.
            await tx.projectMaterial.update({ where: { id: originalMaterial.id }, data: { quantity: (Math.round(originalMaterial.quantity * 1000) - milli) / 1000 } });
            materialId = originalMaterial.id;
          }
          await tx.auditLog.create({ data: { userId: actor.id, action: input.kind, entityType: 'InventoryMovement', entityId: movement.id,
            newValue: JSON.stringify({ itemId: id, projectId, projectMaterialId: materialId, deltaMilli: delta, balanceAfterMilli: next, sourceIssueId: movement.sourceIssueId, note: input.note }) } });
          if (materialId) await enqueueMaterialChanged(tx, { companyId: actor.companyId, projectId, entityId: materialId, action: input.kind === 'ISSUE' ? 'CREATE' : 'UPDATE', payload: { inventoryMovementId: movement.id } });
          return movementResult(movement);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: any) {
        if (['P2002', 'P2034'].includes(error.code)) {
          const completed = await replay(actor, input.requestKey, hash);
          if (completed) return completed;
          throw conflict();
        }
        throw error;
      }
    },
  };
}
