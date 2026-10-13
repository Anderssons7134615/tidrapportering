import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { enqueueTimeEntryChanged } from '../lib/obsidianSync.js';
import { ensureUploadDir } from '../lib/uploads.js';
import { deleteAttachmentFiles } from '../lib/attachments.js';
import { requireRoles } from '../lib/authorization.js';
import { isAccountant } from '../lib/safety.js';
import { toEmployeeTimeEntry } from '../lib/timeEntrySafety.js';
import { createTimeEntryWriteService, timeEntryInputSchema, writeMetadataSchema, vacationInputSchema, TimeWriteError } from '../lib/timeEntryWrites.js';
import {
  dateOnlySchema,
  endOfUtcDay,
  getWeekEndUtc,
  getWeekStartUtc,
  parseDateOnly,
  toDateKey,
} from '../lib/dateOnly.js';

const timeEntrySchema = timeEntryInputSchema;

const bulkSyncSchema = z.array(
  timeEntrySchema.extend({
    localId: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
    requestKey: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
  })
).max(100).superRefine((entries, ctx) => {
  entries.forEach((entry, index) => {
    if (!entry.id && !entry.localId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'localId'],
        message: 'localId krävs för en ny offline-tidrad',
      });
    }
    if (!entry.id && entry.billable === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'billable'],
        message: 'billable krävs för en ny offline-tidrad',
      });
    }
  });
});

const requireTimeWriter = requireRoles(
  ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'],
  'Revisorsrollen har endast läsbehörighet'
);

const timeEntryRoutes: FastifyPluginAsync = async (fastify) => {
  const writes = createTimeEntryWriteService(prisma);
  const publicEntry = (entry: any, role: string) => role === 'ADMIN' ? entry : toEmployeeTimeEntry(entry);
  const sendError = (error: unknown, reply: any) => {
    if (error instanceof z.ZodError) return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
    if (error instanceof TimeWriteError) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    throw error;
  };
  const acknowledgement = (result: any, role: string, requestKey?: string) => ({
    ...(result.entries[0] ? publicEntry(result.entries[0], role) : { id: result.id }),
    requestKey, outcome: result.outcome, replayed: result.replayed,
    resourceExists: result.resourceExists, revision: result.entries[0]?.revision ?? result.revision,
    resultRevision: result.revision, resultIds: result.resultIds,
  });
  // List time entries (for current user or all if admin/supervisor)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { from, to, userId, projectId, status } = request.query as {
      from?: string;
      to?: string;
      userId?: string;
      projectId?: string;
      status?: string;
    };

    const where: any = { user: { companyId: request.user.companyId } };

    const accountant = isAccountant(request.user.role);

    // Medarbetare ser bara sina egna
    if (request.user.role === 'EMPLOYEE') {
      where.userId = request.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (from) {
      const parsedFrom = parseDateOnly(from);
      if (!parsedFrom) return reply.status(400).send({ error: 'Ogiltigt från-datum' });
      where.date = { ...where.date, gte: parsedFrom };
    }
    if (to) {
      const parsedTo = parseDateOnly(to);
      if (!parsedTo) return reply.status(400).send({ error: 'Ogiltigt till-datum' });
      where.date = { ...where.date, lte: endOfUtcDay(parsedTo) };
    }
    if (projectId) where.projectId = projectId;
    if (accountant) {
      if (status && status !== 'APPROVED') {
        return reply.status(403).send({ error: 'Lön och ekonomi kan bara se attesterad tid', code: 'APPROVED_TIME_ONLY' });
      }
      where.status = 'APPROVED';
    } else if (status) {
      where.status = status;
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      ...(accountant
        ? {
            select: {
              id: true,
              revision: true,
              userId: true,
              projectId: true,
              activityId: true,
              date: true,
              startTime: true,
              endTime: true,
              hours: true,
              billable: true,
              note: true,
              status: true,
              submittedAt: true,
              approvedAt: true,
              approverId: true,
              rejectNote: true,
              createdAt: true,
              updatedAt: true,
              user: { select: { id: true, name: true } },
              project: { select: { id: true, name: true, code: true, customer: { select: { id: true, name: true } } } },
              activity: { select: { id: true, name: true, code: true, category: true } },
              approver: { select: { id: true, name: true } },
            },
          }
        : {
            include: {
              user: { select: { id: true, name: true } },
              project: { select: { id: true, name: true, code: true, customer: { select: { id: true, name: true } } } },
              activity: { select: { id: true, name: true, code: true, category: true } },
              attachments: true,
              approver: { select: { id: true, name: true } },
            },
          }),
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    } as any);

    return request.user.role !== 'ADMIN' ? entries.map(toEmployeeTimeEntry) : entries;
  });

  // Get team week summary (admin/supervisor)
  fastify.get('/week-summary/:weekStart', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const { weekStart } = request.params as { weekStart: string };
    const startDate = parseDateOnly(weekStart);
    if (!startDate) return reply.status(400).send({ error: 'Ogiltigt veckodatum' });
    const endDate = getWeekEnd(startDate);

    const [activeUsers, entries, weekLocks] = await Promise.all([
      prisma.user.findMany({
        where: { companyId: request.user.companyId, active: true, role: { not: 'ACCOUNTANT' } },
        select: { id: true, name: true, role: true },
      }),
      prisma.timeEntry.findMany({
        where: {
          user: { companyId: request.user.companyId },
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, name: true, role: true } },
          date: true,
          createdAt: true,
          hours: true,
          billable: true,
          status: true,
          note: true,
          projectId: true,
          activity: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.weekLock.findMany({
        where: {
          user: { companyId: request.user.companyId },
          weekStartDate: startDate,
        },
        select: {
          userId: true,
          status: true,
          user: { select: { id: true, name: true, role: true } },
        },
      }),
    ]);

    const usersById = new Map<string, { id: string; name: string; role: string }>();
    for (const user of activeUsers) {
      usersById.set(user.id, user);
    }
    for (const entry of entries) {
      usersById.set(entry.user.id, entry.user);
    }
    for (const lock of weekLocks) {
      usersById.set(lock.user.id, lock.user);
    }
    const users = Array.from(usersById.values())
      .filter((user) => user.role !== 'ACCOUNTANT')
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

    const weekLockByUser = new Map(weekLocks.map((lock) => [lock.userId, lock.status]));
    const entriesByUser = new Map<string, typeof entries>();

    for (const entry of entries) {
      if (!entriesByUser.has(entry.userId)) {
        entriesByUser.set(entry.userId, []);
      }
      entriesByUser.get(entry.userId)!.push(entry);
    }

    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      date.setHours(0, 0, 0, 0);
      return date;
    });
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const summaries = users.map((u) => {
      const userEntries = entriesByUser.get(u.id) || [];
      const lockStatus = weekLockByUser.get(u.id) || 'DRAFT';

      const projectMap = new Map<string, {
        projectId: string | null;
        projectName: string;
        projectCode: string;
        hours: number;
        billableHours: number;
      }>();

      for (const entry of userEntries) {
        const isInternal = !entry.projectId;
        const projectKey = isInternal ? 'INTERNAL' : entry.projectId!;

        if (!projectMap.has(projectKey)) {
          projectMap.set(projectKey, {
            projectId: isInternal ? null : entry.project?.id || entry.projectId,
            projectName: isInternal ? 'Intern' : (entry.project?.name || 'Okänt projekt'),
            projectCode: isInternal ? 'INTERN' : (entry.project?.code || '-'),
            hours: 0,
            billableHours: 0,
          });
        }

        const projectSummary = projectMap.get(projectKey)!;
        projectSummary.hours += entry.hours;
        if (entry.billable) {
          projectSummary.billableHours += entry.hours;
        }
      }

      const totalHours = userEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const billableHours = userEntries.reduce((sum, entry) => sum + (entry.billable ? entry.hours : 0), 0);
      const internalHours = userEntries.reduce((sum, entry) => sum + (!entry.projectId ? entry.hours : 0), 0);
      const entriesByDate = new Map<string, typeof userEntries>();

      for (const entry of userEntries) {
        const dateKey = toDateKey(entry.date);
        if (!entriesByDate.has(dateKey)) {
          entriesByDate.set(dateKey, []);
        }
        entriesByDate.get(dateKey)!.push(entry);
      }

      const days = weekDays.map((date, index) => {
        const dateKey = toDateKey(date);
        const dayEntries = entriesByDate.get(dateKey) || [];
        const hours = dayEntries.reduce((sum, entry) => sum + entry.hours, 0);
        const billableDayHours = dayEntries.reduce((sum, entry) => sum + (entry.billable ? entry.hours : 0), 0);
        const isWeekday = index < 5;
        const isExpected = isWeekday && date <= today;
        const isFuture = date > today;
        const hasMissingActivity = dayEntries.some((entry) => !entry.activity);
        const warnings: string[] = [];

        if (isExpected && hours === 0 && lockStatus !== 'APPROVED') {
          warnings.push('Saknar tid');
        }
        if (hours > 10) {
          warnings.push('Mer än 10 h');
        }
        if (hasMissingActivity) {
          warnings.push('Saknar aktivitet');
        }

        let status = 'EMPTY';
        if (isFuture) status = 'FUTURE';
        else if (!isWeekday && hours === 0) status = 'OFF';
        else if (lockStatus === 'APPROVED' && hours > 0) status = 'APPROVED';
        else if (warnings.length > 0) status = hours === 0 ? 'MISSING' : 'DEVIATION';
        else if (hours > 0) status = 'REPORTED';

        return {
          date: dateKey,
          dayName: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'][index],
          hours,
          billableHours: billableDayHours,
          entryCount: dayEntries.length,
          expected: isExpected,
          status,
          warnings,
        };
      });

      const missingDays = days.filter((day) => day.status === 'MISSING').map((day) => day.date);
      const deviations = [
        ...days.flatMap((day) => day.warnings.map((warning) => ({ date: day.date, type: warning }))),
        ...(internalHours > Math.max(8, totalHours * 0.4) && internalHours > 0
          ? [{ date: null, type: 'Mycket intern tid' }]
          : []),
      ];
      const hasSubmittedWeek = lockStatus === 'SUBMITTED';
      const hasRejectedWeek = lockStatus === 'REJECTED';
      const hasMissingTime = missingDays.length > 0;
      const hasDeviation = deviations.some((deviation) => deviation.type !== 'Intern tid');
      const needsAction = lockStatus !== 'APPROVED' && (hasSubmittedWeek || hasRejectedWeek || hasMissingTime || hasDeviation);

      let attentionStatus = 'OK';
      if (lockStatus === 'APPROVED') attentionStatus = 'APPROVED';
      else if (hasRejectedWeek) attentionStatus = 'REJECTED';
      else if (hasMissingTime) attentionStatus = 'MISSING';
      else if (hasDeviation) attentionStatus = 'DEVIATION';
      else if (hasSubmittedWeek) attentionStatus = 'PENDING';

      return {
        userId: u.id,
        userName: u.name,
        role: u.role,
        totalHours,
        billableHours,
        entryCount: userEntries.length,
        status: lockStatus,
        attentionStatus,
        needsAction,
        missingDays,
        deviations,
        days,
        projects: Array.from(projectMap.values()).sort((a, b) => b.hours - a.hours),
        entries: userEntries
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, 8),
      };
    });

    return {
      weekStart: startDate,
      weekEnd: endDate,
      totals: {
        totalHours: summaries.reduce((s, x) => s + x.totalHours, 0),
        billableHours: summaries.reduce((s, x) => s + x.billableHours, 0),
        missingUsers: summaries.filter((x) => x.attentionStatus === 'MISSING').length,
        pendingUsers: summaries.filter((x) => x.attentionStatus === 'PENDING').length,
        deviationUsers: summaries.filter((x) => x.attentionStatus === 'DEVIATION').length,
        approvedUsers: summaries.filter((x) => x.attentionStatus === 'APPROVED').length,
        needsActionUsers: summaries.filter((x) => x.needsAction).length,
      },
      users: summaries,
    };
  });

  // Get entries for a specific week
  fastify.get('/week/:weekStart', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { weekStart } = request.params as { weekStart: string };
    const { userId } = request.query as { userId?: string };
    const accountant = isAccountant(request.user.role);

    const startDate = parseDateOnly(weekStart);
    if (!startDate) return reply.status(400).send({ error: 'Ogiltigt veckodatum' });
    const endDate = getWeekEnd(startDate);

    const targetUserId = request.user.role === 'EMPLOYEE'
      ? request.user.id
      : (userId || request.user.id);

    if (targetUserId !== request.user.id) {
      const targetUser = await prisma.user.findFirst({
        where: { id: targetUserId, companyId: request.user.companyId },
        select: { id: true },
      });

      if (!targetUser) return reply.status(404).send({ error: 'Användare hittades inte' });
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId: targetUserId,
        ...(accountant ? { status: 'APPROVED' } : {}),
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      ...(accountant
        ? {
            select: {
              id: true,
              revision: true,
              userId: true,
              projectId: true,
              activityId: true,
              date: true,
              startTime: true,
              endTime: true,
              hours: true,
              billable: true,
              note: true,
              status: true,
              submittedAt: true,
              approvedAt: true,
              approverId: true,
              rejectNote: true,
              createdAt: true,
              updatedAt: true,
              project: { select: { id: true, name: true, code: true, site: true } },
              activity: { select: { id: true, name: true, code: true, category: true } },
            },
          }
        : {
            include: {
              project: { select: { id: true, name: true, code: true, site: true } },
              activity: { select: { id: true, name: true, code: true, category: true } },
              attachments: true,
            },
          }),
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    } as any);

    // Hämta veckolås
    const weekLock = accountant
      ? await prisma.weekLock.findFirst({
          where: { userId: targetUserId, weekStartDate: startDate, status: 'APPROVED' },
        })
      : await prisma.weekLock.findUnique({
          where: {
            userId_weekStartDate: {
              userId: targetUserId,
              weekStartDate: startDate,
            },
          },
        });

    // Summera timmar per dag
    const dailyTotals: Record<string, number> = {};
    let totalHours = 0;
    let billableHours = 0;

    entries.forEach((entry) => {
      const dateKey = toDateKey(entry.date);
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + entry.hours;
      totalHours += entry.hours;
      if (entry.billable) billableHours += entry.hours;
    });

    return {
      entries: request.user.role !== 'ADMIN' ? entries.map(toEmployeeTimeEntry) : entries,
      weekLock,
      summary: {
        totalHours,
        billableHours,
        dailyTotals,
      },
    };
  });

  fastify.post('/week-vacation', { preHandler: [requireTimeWriter] }, async (request, reply) => {
    try {
      const body = vacationInputSchema.parse(request.body);
      const result = await writes.vacation(request.user, body);
      return reply.status(201).send({ ...acknowledgement(result, request.user.role, body.requestKey),
        entries: result.entries.map((entry: any) => publicEntry(entry, request.user.role)),
        days: 5, hoursPerDay: body.hoursPerDay, totalHours: 5 * body.hoursPerDay });
    } catch (error) { return sendError(error, reply); }
  });

  // The v3 client uses a new endpoint so an older backend cannot silently
  // ignore request keys and create duplicate time. Legacy v2 sync stays below.
  fastify.post('/operations', { preHandler: [requireTimeWriter] }, async (request, reply) => {
    const schema = z.discriminatedUnion('operation', [
      z.object({ operation: z.literal('CREATE'), requestKey: z.string().uuid(), payload: timeEntryInputSchema }),
      z.object({ operation: z.literal('UPDATE'), requestKey: z.string().uuid(), id: z.string().uuid(), revision: z.number().int().positive(), payload: timeEntryInputSchema.partial() }),
      z.object({ operation: z.literal('DELETE'), requestKey: z.string().uuid(), id: z.string().uuid(), revision: z.number().int().positive() }),
      z.object({ operation: z.literal('WEEK_VACATION'), requestKey: z.string().uuid(), payload: vacationInputSchema.omit({ requestKey: true }) }),
    ]);
    try {
      const body = schema.parse(request.body);
      const result = body.operation === 'CREATE' ? await writes.create(request.user, body.payload, body.requestKey)
        : body.operation === 'UPDATE' ? await writes.update(request.user, body.id, body.payload, body.revision, body.requestKey)
        : body.operation === 'DELETE' ? await writes.remove(request.user, body.id, body.revision, body.requestKey)
        : await writes.vacation(request.user, { ...body.payload, requestKey: body.requestKey });
      deleteAttachmentFiles(result.attachments, fastify.log);
      return { ...acknowledgement(result, request.user.role, body.requestKey), operation: body.operation,
        ...(body.operation === 'WEEK_VACATION' ? { days: 5, totalHours: body.payload.hoursPerDay * 5 } : {}) };
    } catch (error) { return sendError(error, reply); }
  });

  // Get single entry
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountant = isAccountant(request.user.role);

    const entry = await prisma.timeEntry.findFirst({
      where: { id, user: { companyId: request.user.companyId }, ...(accountant ? { status: 'APPROVED' } : {}) },
      ...(accountant
        ? {
            select: {
              id: true,
              revision: true,
              userId: true,
              projectId: true,
              activityId: true,
              date: true,
              startTime: true,
              endTime: true,
              hours: true,
              billable: true,
              note: true,
              status: true,
              submittedAt: true,
              approvedAt: true,
              approverId: true,
              rejectNote: true,
              createdAt: true,
              updatedAt: true,
              user: { select: { id: true, name: true } },
              project: { select: { id: true, name: true, code: true, customer: { select: { id: true, name: true } } } },
              activity: { select: { id: true, name: true, code: true } },
              approver: { select: { id: true, name: true } },
            },
          }
        : {
            include: {
              user: { select: { id: true, name: true } },
              project: { select: { id: true, name: true, code: true, customer: { select: { id: true, name: true } } } },
              activity: { select: { id: true, name: true, code: true } },
              attachments: true,
              approver: { select: { id: true, name: true } },
          },
          }),
    } as any);

    if (!entry) {
      return reply.status(404).send({ error: 'Tidrad hittades inte' });
    }

    // Kontrollera behörighet
    if (request.user.role === 'EMPLOYEE' && entry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    return request.user.role !== 'ADMIN' ? toEmployeeTimeEntry(entry) : entry;
  });

  // Legacy HTTP endpoints share the same transactional service as v3.
  fastify.post('/', { preHandler: [requireTimeWriter] }, async (request, reply) => {
    try {
      const { requestKey, revision: _revision, ...body } = timeEntryInputSchema.merge(writeMetadataSchema).parse(request.body);
      const result = await writes.create(request.user, body, requestKey);
      return reply.status(201).send(acknowledgement(result, request.user.role, requestKey));
    } catch (error) { return sendError(error, reply); }
  });

  fastify.post('/sync', { preHandler: [requireTimeWriter] }, async (request, reply) => {
    try {
      const entries = bulkSyncSchema.parse(request.body);
      const results = [];
      for (const entry of entries) {
        const { localId, id, revision, requestKey, ...data } = entry;
        try {
          const result = id ? await writes.update(request.user, id, data, revision, requestKey || localId)
            : await writes.create(request.user, data, requestKey || localId);
          results.push({ localId, id: result.id, revision: result.revision, outcome: result.outcome, replayed: result.replayed, resourceExists: result.resourceExists });
        } catch (error) {
          if (!(error instanceof TimeWriteError)) throw error;
          results.push({ localId, id, outcome: 'REJECTED', code: error.code, error: error.message });
        }
      }
      return { results };
    } catch (error) { return sendError(error, reply); }
  });

  fastify.put('/:id', { preHandler: [requireTimeWriter] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { requestKey, revision, ...body } = timeEntryInputSchema.partial().merge(writeMetadataSchema).parse(request.body);
      const result = await writes.update(request.user, id, body, revision, requestKey);
      return acknowledgement(result, request.user.role, requestKey);
    } catch (error) { return sendError(error, reply); }
  });

  fastify.delete('/:id', { preHandler: [requireTimeWriter] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { requestKey, revision } = writeMetadataSchema.parse(request.body ?? {});
      const result = await writes.remove(request.user, id, revision, requestKey);
      deleteAttachmentFiles(result.attachments, fastify.log);
      return { ...acknowledgement(result, request.user.role, requestKey), message: 'Tidrad borttagen' };
    } catch (error) { return sendError(error, reply); }
  });

  // Upload attachment
  fastify.post('/:id/attachments', {
    preHandler: [requireTimeWriter],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const entry = await prisma.timeEntry.findFirst({
      where: { id, user: { companyId: request.user.companyId } },
    });
    if (!entry) {
      return reply.status(404).send({ error: 'Tidrad hittades inte' });
    }

    // Kontrollera behörighet
    if (request.user.role === 'EMPLOYEE' && entry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }
    if (entry.status === 'APPROVED') {
      return reply.status(409).send({ error: 'Veckan måste låsas upp innan bilagor ändras' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'Ingen fil bifogad' });
    }

    const uploadDir = ensureUploadDir();
    const originalName = path.basename(data.filename || 'bilaga');
    const safeExt = getSafeExtension(originalName, data.mimetype);
    if (!safeExt) {
      return reply.status(400).send({ error: 'Filtypen är inte tillåten' });
    }

    const filename = `${randomUUID()}${safeExt}`;
    const filepath = path.join(uploadDir, filename);

    let size = 0;
    const countBytes = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        callback(null, chunk);
      },
    });

    try {
      await pipeline(data.file, countBytes, fs.createWriteStream(filepath));
      if (data.file.truncated) {
        fs.rmSync(filepath, { force: true });
        return reply.status(413).send({ error: 'Filen är större än 10 MB' });
      }

      const attachment = await prisma.$transaction(async (tx) => {
        await assertEntryEditable(tx, id);
        return tx.attachment.create({
          data: {
            timeEntryId: id,
            filename,
            originalName,
            mimeType: data.mimetype,
            size,
            path: filepath,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return reply.status(201).send(attachment);
    } catch (error) {
      fs.rmSync(filepath, { force: true });
      throw error;
    }
  });

  // Download attachment via authenticated API instead of public /uploads URL
  fastify.get('/:id/attachments/:attachmentId/download', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };

    if (isAccountant(request.user.role)) {
      return reply.status(404).send({ error: 'Bilaga hittades inte' });
    }

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        timeEntryId: id,
        timeEntry: { user: { companyId: request.user.companyId } },
      },
      include: { timeEntry: true },
    });

    if (!attachment) {
      return reply.status(404).send({ error: 'Bilaga hittades inte' });
    }

    if (request.user.role === 'EMPLOYEE' && attachment.timeEntry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    if (!fs.existsSync(attachment.path)) {
      return reply.status(404).send({ error: 'Filen hittades inte i lagringen' });
    }

    const fileSize = attachment.size > 0 ? attachment.size : fs.statSync(attachment.path).size;

    reply.header('Content-Type', attachment.mimeType || 'application/octet-stream');
    reply.header('Content-Length', String(fileSize));
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
    return reply.send(fs.createReadStream(attachment.path));
  });

  // Delete attachment
  fastify.delete('/:id/attachments/:attachmentId', {
    preHandler: [requireTimeWriter],
  }, async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        timeEntry: { user: { companyId: request.user.companyId } },
      },
      include: { timeEntry: true },
    });

    if (!attachment || attachment.timeEntryId !== id) {
      return reply.status(404).send({ error: 'Bilaga hittades inte' });
    }

    // Kontrollera behörighet
    if (request.user.role === 'EMPLOYEE' && attachment.timeEntry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }
    if (attachment.timeEntry.status === 'APPROVED') {
      return reply.status(409).send({ error: 'Veckan måste låsas upp innan bilagor ändras' });
    }

    await prisma.$transaction(async (tx) => {
      await assertEntryEditable(tx, id);
      await tx.attachment.delete({ where: { id: attachmentId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    deleteAttachmentFiles([{ path: attachment.path }], fastify.log);

    return { message: 'Bilaga borttagen' };
  });
};

// Hjälpfunktion för att få veckans startdatum (måndag)
function getWeekStart(date: Date): Date {
  return getWeekStartUtc(date);
}

function getWeekEnd(date: Date): Date {
  return getWeekEndUtc(date);
}

async function assertEntryEditable(tx: any, id: string) {
  const current = await tx.timeEntry.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw Object.assign(new Error('Tidrad hittades inte'), { statusCode: 404 });
  if (current.status === 'APPROVED') {
    throw Object.assign(new Error('Veckan måste låsas upp innan bilagor ändras'), { statusCode: 409 });
  }
}

function getSafeExtension(originalName: string, mimeType: string): string | null {
  const ext = path.extname(originalName).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.txt', '.csv', '.xlsx']);
  if (allowed.has(ext)) return ext;

  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'text/plain') return '.txt';
  if (mimeType === 'text/csv') return '.csv';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
  return null;
}

export default timeEntryRoutes;
