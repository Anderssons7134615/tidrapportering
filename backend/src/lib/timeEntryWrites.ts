import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type TimeEntryWriteRequest } from '@prisma/client';
import { z } from 'zod';
import { dateOnlySchema, getWeekEndUtc, getWeekStartUtc, toDateKey } from './dateOnly.js';
import { createOfflineTimeEntryPayloadHash } from './offlineSync.js';
import { enqueueTimeEntryChanged } from './obsidianSync.js';
import { buildWeekVacationRows } from './weekVacation.js';
import { getTimeEntryDeletionError } from './timeEntrySafety.js';

export const timeEntryInputSchema = z.object({
  projectId: z.string().uuid().optional().nullable(), activityId: z.string().uuid(),
  userId: z.string().uuid().optional(), date: dateOnlySchema,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  hours: z.number().positive().max(24), billable: z.boolean().optional(),
  note: z.string().max(2000).optional().nullable(),
  gpsLat: z.number().optional().nullable(), gpsLng: z.number().optional().nullable(),
});
export const writeMetadataSchema = z.object({
  requestKey: z.string().uuid().optional(), revision: z.number().int().positive().optional(),
});
export const vacationInputSchema = z.object({
  weekStart: dateOnlySchema, userId: z.string().uuid().optional(),
  hoursPerDay: z.number().positive().max(24).default(8), requestKey: z.string().uuid().optional(),
});
type Input = z.infer<typeof timeEntryInputSchema>;
type Actor = { id: string; companyId: string; role: string };
type Tx = Prisma.TransactionClient;
type Operation = 'CREATE' | 'UPDATE' | 'DELETE' | 'WEEK_VACATION';
const relations = {
  project: { select: { id: true, name: true, code: true, site: true } },
  activity: { select: { id: true, name: true, code: true, category: true } },
} satisfies Prisma.TimeEntryInclude;

export class TimeWriteError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
const conflict = () => new TimeWriteError(409, 'REVISION_CONFLICT', 'Tidraden har ändrats. Dina uppgifter finns kvar. Hämta den senaste versionen innan du gör en ny ändring.');
function requireRevision(revision?: number): asserts revision is number {
  if (!revision) throw new TimeWriteError(428, 'CLIENT_UPDATE_REQUIRED', 'Uppdatera appen och hämta tidraden igen innan du ändrar eller tar bort den.');
}
function assertWriter(actor: Actor) {
  if (!['ADMIN', 'SUPERVISOR', 'EMPLOYEE'].includes(actor.role)) throw new TimeWriteError(403, 'FORBIDDEN', 'Åtkomst nekad');
}
function targetUser(actor: Actor, userId?: string, currentUserId?: string) {
  return actor.role === 'EMPLOYEE' ? actor.id : (userId || currentUserId || actor.id);
}
function intentHash(operation: Operation, id: string | null, revision: number | undefined, payload: object) {
  // Hash the request, never mutable database defaults. Omitted patch fields must
  // remain distinct from explicit nulls. Zod has already removed unknown fields.
  const normalized = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify({ operation, id, revision: revision ?? null, payload: normalized })).digest('hex');
}

export async function assertTimeWeekEditable(tx: Tx, userId: string, date: Date) {
  const lock = await tx.weekLock.findUnique({ where: { userId_weekStartDate: { userId, weekStartDate: getWeekStartUtc(date) } } });
  if (lock?.status === 'APPROVED') throw new TimeWriteError(409, 'WEEK_APPROVED', 'Veckan är godkänd. Lås upp veckan innan den ändras.');
}

export async function upsertSubmittedWeekLock(tx: Tx, userId: string, weekStartDate: Date) {
  await assertTimeWeekEditable(tx, userId, weekStartDate);
  const pending = await tx.timeEntry.findMany({
    where: { userId, date: { gte: weekStartDate, lte: getWeekEndUtc(weekStartDate) }, status: { in: ['DRAFT', 'REJECTED'] } },
    select: { id: true, revision: true, status: true },
  });
  for (const entry of pending) {
    const changed = await tx.timeEntry.updateMany({ where: entry,
      data: { revision: { increment: 1 }, status: 'SUBMITTED', submittedAt: new Date(), approvedAt: null, approverId: null, rejectNote: null } });
    if (changed.count !== 1) throw conflict();
  }
  return tx.weekLock.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate } },
    update: { status: 'SUBMITTED', submittedAt: new Date(), comment: null, reviewedAt: null, reviewerId: null },
    create: { userId, weekStartDate, status: 'SUBMITTED' },
  });
}

export async function reconcileWeekLock(tx: Tx, userId: string, weekStartDate: Date) {
  await assertTimeWeekEditable(tx, userId, weekStartDate);
  const count = await tx.timeEntry.count({ where: { userId, date: { gte: weekStartDate, lte: getWeekEndUtc(weekStartDate) } } });
  if (count === 0) await tx.weekLock.deleteMany({ where: { userId, weekStartDate } });
  else await upsertSubmittedWeekLock(tx, userId, weekStartDate);
}

async function validateReferences(tx: Tx, actor: Actor, input: Input, previous?: { userId: string; activityId: string; projectId: string | null }) {
  const [user, activity, project] = await Promise.all([
    tx.user.findFirst({ where: { id: input.userId, companyId: actor.companyId }, select: { id: true, active: true } }),
    tx.activity.findFirst({ where: { id: input.activityId, companyId: actor.companyId }, select: { id: true, active: true, category: true, billableDefault: true } }),
    input.projectId ? tx.project.findFirst({ where: { id: input.projectId, companyId: actor.companyId }, select: { id: true, active: true } }) : null,
  ]);
  if (!user || (!user.active && previous?.userId !== user.id)) throw new TimeWriteError(400, 'INVALID_REFERENCE', 'Användaren tillhör inte företaget eller är inaktiv');
  if (!activity || (!activity.active && previous?.activityId !== activity.id)) throw new TimeWriteError(400, 'INVALID_REFERENCE', 'Aktiviteten tillhör inte företaget eller är inaktiv');
  if (input.projectId && (!project || (!project.active && previous?.projectId !== project.id))) throw new TimeWriteError(400, 'INVALID_REFERENCE', 'Projektet tillhör inte företaget eller är inaktivt');
  if (!input.projectId && !['ABSENCE', 'INTERNAL'].includes(activity.category)) throw new TimeWriteError(400, 'PROJECT_REQUIRED', 'Projekt krävs för vald aktivitet');
  return activity;
}

export function createTimeEntryWriteService(db: PrismaClient) {
  const receiptWhere = (actor: Actor, key: string) => ({ companyId_actorUserId_requestKey: { companyId: actor.companyId, actorUserId: actor.id, requestKey: key } });

  async function replay(actor: Actor, record: TimeEntryWriteRequest, operation: Operation, hash: string) {
    if (record.operation !== operation || record.payloadHash !== hash) throw new TimeWriteError(409, 'WRITE_KEY_CONFLICT', 'Sparnyckeln har redan använts för andra uppgifter. Det tidigare sparandet ändrades inte.');
    const entries = await db.timeEntry.findMany({
      where: { id: { in: record.resultIds }, user: { companyId: actor.companyId }, ...(actor.role === 'EMPLOYEE' ? { userId: actor.id } : {}) },
      include: relations,
    });
    return { entries, id: record.resultIds[0], resultIds: record.resultIds, revision: record.revision, resourceExists: entries.length > 0, outcome: 'REPLAYED' as const, replayed: true, attachments: [] as Array<{ path: string }> };
  }

  async function execute(actor: Actor, operation: Operation, key: string | undefined, hash: string, ids: string[], revision: number | undefined,
    change: (tx: Tx) => Promise<{ entries: any[]; attachments?: Array<{ path: string }> }>) {
    assertWriter(actor);
    if (key) {
      const existing = await db.timeEntryWriteRequest.findUnique({ where: receiptWhere(actor, key) });
      if (existing) return replay(actor, existing, operation, hash);
    }
    try {
      return await db.$transaction(async (tx) => {
        // First write reserves the identity; it cannot commit unless the entire
        // operation, audit and outbox succeed. No separately committed PENDING.
        if (key) await tx.timeEntryWriteRequest.create({ data: {
          companyId: actor.companyId, actorUserId: actor.id, requestKey: key,
          operation, payloadHash: hash, resultIds: ids, revision,
        } });
        const result = await change(tx);
        return { ...result, attachments: result.attachments ?? [], id: ids[0], resultIds: ids, revision: revision ?? null,
          resourceExists: operation !== 'DELETE', outcome: operation === 'UPDATE' ? 'UPDATED' as const : operation === 'DELETE' ? 'DELETED' as const : 'CREATED' as const, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (key && ['P2002', 'P2034'].includes(error?.code)) {
        const existing = await db.timeEntryWriteRequest.findUnique({ where: receiptWhere(actor, key) });
        if (existing) return replay(actor, existing, operation, hash);
      }
      if (['P2034', 'P2025'].includes(error?.code)) throw conflict();
      throw error;
    }
  }

  async function emit(tx: Tx, actor: Actor, action: string, entry: { id: string; projectId: string | null; date: Date; hours: number; userId: string }, oldProjectId?: string | null) {
    for (const projectId of new Set([oldProjectId, entry.projectId].filter((id): id is string => Boolean(id)))) {
      await enqueueTimeEntryChanged(tx, { companyId: actor.companyId, projectId, entityId: entry.id, action,
        payload: { date: entry.date.toISOString(), hours: entry.hours, userId: entry.userId, oldProjectId: oldProjectId ?? null, newProjectId: entry.projectId } });
    }
  }

  return {
    async create(actor: Actor, input: Input, key?: string) {
      assertWriter(actor);
      const data = { ...input, userId: targetUser(actor, input.userId) };
      // This exact hash also covers pre-existing v2 offline rows.
      if (key && input.billable === undefined) throw new TimeWriteError(400, 'BILLABLE_REQUIRED', 'Ange om tiden är debiterbar innan den sparas.');
      const hash = createOfflineTimeEntryPayloadHash({ ...data, billable: input.billable as boolean });
      // Existing offline records created during a backend-first rollout are
      // recognized even if they were written after the SQL backfill ran.
      if (key && !await db.timeEntryWriteRequest.findUnique({ where: receiptWhere(actor, key) })) {
        const legacy = await db.timeEntry.findFirst({ where: { offlineActorUserId: actor.id, offlineLocalId: key, user: { companyId: actor.companyId } } });
        if (legacy) {
          if (legacy.offlinePayloadHash !== hash) throw new TimeWriteError(409, 'WRITE_KEY_CONFLICT', 'Offline-id:t har redan använts för en annan tidrad');
          try {
            await db.timeEntryWriteRequest.create({ data: { companyId: actor.companyId, actorUserId: actor.id, requestKey: key, operation: 'CREATE', payloadHash: hash, resultIds: [legacy.id], revision: legacy.revision } });
          } catch (error: any) { if (error?.code !== 'P2002') throw error; }
        }
      }
      const id = randomUUID();
      return execute(actor, 'CREATE', key, hash, [id], 1, async (tx) => {
        const activity = await validateReferences(tx, actor, data);
        await assertTimeWeekEditable(tx, data.userId, data.date);
        const row = await tx.timeEntry.create({ data: {
          ...data, id, billable: input.billable ?? activity.billableDefault, status: 'SUBMITTED', submittedAt: new Date(),
          ...(key ? { offlineActorUserId: actor.id, offlineLocalId: key, offlinePayloadHash: hash } : {}),
        }, include: relations });
        await upsertSubmittedWeekLock(tx, row.userId, getWeekStartUtc(row.date));
        await tx.auditLog.create({ data: { userId: actor.id, action: 'CREATE', entityType: 'TimeEntry', entityId: id, newValue: JSON.stringify({ date: row.date, hours: row.hours, projectId: row.projectId }) } });
        await emit(tx, actor, 'CREATE', row);
        return { entries: [row] };
      });
    },

    async update(actor: Actor, id: string, patch: Partial<Input>, revision?: number, key?: string) {
      requireRevision(revision);
      if (actor.role === 'EMPLOYEE') { const { userId: ignored, ...effective } = patch; patch = effective; }
      const hash = intentHash('UPDATE', id, revision, patch);
      return execute(actor, 'UPDATE', key, hash, [id], revision + 1, async (tx) => {
        const current = await tx.timeEntry.findFirst({ where: { id, user: { companyId: actor.companyId } } });
        if (!current) throw new TimeWriteError(404, 'NOT_FOUND', 'Tidrad hittades inte');
        if (actor.role === 'EMPLOYEE' && current.userId !== actor.id) throw new TimeWriteError(403, 'FORBIDDEN', 'Åtkomst nekad');
        if (current.revision !== revision) throw conflict();
        if (current.status === 'APPROVED') throw new TimeWriteError(409, 'WEEK_APPROVED', 'Veckan måste låsas upp innan raden ändras');
        const next = { ...current, ...patch, userId: targetUser(actor, patch.userId, current.userId) };
        await validateReferences(tx, actor, next, current);
        await assertTimeWeekEditable(tx, current.userId, current.date);
        await assertTimeWeekEditable(tx, next.userId, next.date);
        const changed = await tx.timeEntry.updateMany({
          where: { id, revision, status: current.status },
          data: { ...patch, userId: next.userId, revision: { increment: 1 }, status: 'SUBMITTED', submittedAt: new Date(), approvedAt: null, approverId: null, rejectNote: null,
            approvedHourlyCostSnapshot: null, approvedBillingRateSnapshot: null, financialSnapshotCapturedAt: null },
        });
        if (changed.count !== 1) throw conflict();
        const row = await tx.timeEntry.findUniqueOrThrow({ where: { id }, include: relations });
        await upsertSubmittedWeekLock(tx, row.userId, getWeekStartUtc(row.date));
        if (current.userId !== row.userId || getWeekStartUtc(current.date).getTime() !== getWeekStartUtc(row.date).getTime()) await reconcileWeekLock(tx, current.userId, getWeekStartUtc(current.date));
        await tx.auditLog.create({ data: { userId: actor.id, action: 'UPDATE', entityType: 'TimeEntry', entityId: id,
          oldValue: JSON.stringify({ date: current.date, hours: current.hours, note: current.note, revision: current.revision }), newValue: JSON.stringify({ ...patch, revision: row.revision }) } });
        await emit(tx, actor, 'UPDATE', row, current.projectId);
        return { entries: [row] };
      });
    },

    async remove(actor: Actor, id: string, revision?: number, key?: string) {
      requireRevision(revision);
      return execute(actor, 'DELETE', key, intentHash('DELETE', id, revision, {}), [id], revision, async (tx) => {
        const current = await tx.timeEntry.findFirst({ where: { id, user: { companyId: actor.companyId } }, include: { attachments: { select: { path: true } } } });
        if (!current) throw new TimeWriteError(404, 'NOT_FOUND', 'Tidrad hittades inte');
        if (actor.role === 'EMPLOYEE' && current.userId !== actor.id) throw new TimeWriteError(403, 'FORBIDDEN', 'Åtkomst nekad');
        if (current.revision !== revision) throw conflict();
        const error = getTimeEntryDeletionError(current.status);
        if (error) throw new TimeWriteError(409, 'WEEK_APPROVED', error);
        await assertTimeWeekEditable(tx, current.userId, current.date);
        // Backfill before physical deletion, including legacy creates that were
        // written after the migration. Keeps the create tombstone durable.
        if (current.offlineActorUserId && current.offlineLocalId && current.offlinePayloadHash) {
          const owner = await tx.user.findFirst({ where: { id: current.offlineActorUserId, companyId: actor.companyId } });
          if (owner) await tx.timeEntryWriteRequest.createMany({ data: [{ companyId: actor.companyId, actorUserId: owner.id, requestKey: current.offlineLocalId, operation: 'CREATE', payloadHash: current.offlinePayloadHash, resultIds: [id], revision: current.revision }], skipDuplicates: true });
        }
        const removed = await tx.timeEntry.deleteMany({ where: { id, revision, status: current.status } });
        if (removed.count !== 1) throw conflict();
        await reconcileWeekLock(tx, current.userId, getWeekStartUtc(current.date));
        await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE', entityType: 'TimeEntry', entityId: id, oldValue: JSON.stringify({ date: current.date, hours: current.hours, revision }) } });
        await emit(tx, actor, 'DELETE', current);
        return { entries: [], attachments: current.attachments };
      });
    },

    async vacation(actor: Actor, input: z.infer<typeof vacationInputSchema>) {
      const { requestKey, ...data } = input;
      const userId = targetUser(actor, data.userId);
      const rows = buildWeekVacationRows(data.weekStart, data.hoursPerDay);
      const ids = rows.map(() => randomUUID());
      return execute(actor, 'WEEK_VACATION', requestKey, intentHash('WEEK_VACATION', null, undefined, { ...data, userId }), ids, 1, async (tx) => {
        const user = await tx.user.findFirst({ where: { id: userId, companyId: actor.companyId, active: true }, select: { id: true } });
        const activity = await tx.activity.findFirst({ where: { companyId: actor.companyId, code: 'SEM', category: 'ABSENCE', active: true }, select: { id: true } });
        if (!user) throw new TimeWriteError(400, 'INVALID_REFERENCE', 'Användaren tillhör inte företaget eller är inaktiv');
        if (!activity) throw new TimeWriteError(409, 'INVALID_REFERENCE', 'Aktiviteten Semester (SEM) måste vara aktiv innan hela veckan kan rapporteras');
        await assertTimeWeekEditable(tx, userId, rows[0].date);
        const existing = await tx.timeEntry.findMany({ where: { userId, date: { gte: rows[0].date, lte: rows[rows.length - 1].date } }, select: { date: true } });
        if (existing.length) throw new TimeWriteError(409, 'WEEK_NOT_EMPTY', `Veckan har redan rapporterad vardagstid: ${[...new Set(existing.map((entry) => toDateKey(entry.date)))].join(', ')}. Befintliga rader ändrades inte.`);
        const entries = [];
        for (const [index, row] of rows.entries()) entries.push(await tx.timeEntry.create({ data: { ...row, id: ids[index], userId, activityId: activity.id, billable: false, status: 'SUBMITTED', submittedAt: new Date() }, include: relations }));
        await upsertSubmittedWeekLock(tx, userId, rows[0].date);
        await tx.auditLog.create({ data: { userId: actor.id, action: 'CREATE_WEEK_VACATION', entityType: 'TimeEntry', entityId: ids[0], newValue: JSON.stringify({ targetUserId: userId, weekStart: toDateKey(rows[0].date), hoursPerDay: data.hoursPerDay, days: rows.length }) } });
        return { entries };
      });
    },
  };
}
