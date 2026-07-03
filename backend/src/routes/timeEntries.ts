import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { enqueueTimeEntryChanged } from '../lib/obsidianSync.js';
import { ensureUploadDir } from '../lib/uploads.js';
import { deleteAttachmentFiles } from '../lib/attachments.js';

const timeEntrySchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  date: z.string().transform((d) => new Date(d)),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  hours: z.number().min(0).max(24),
  billable: z.boolean().optional(),
  note: z.string().optional().nullable(),
  gpsLat: z.number().optional().nullable(),
  gpsLng: z.number().optional().nullable(),
});

const bulkSyncSchema = z.array(
  timeEntrySchema.extend({
    localId: z.string().optional(),
    id: z.string().uuid().optional(),
  })
);

const timeEntryRoutes: FastifyPluginAsync = async (fastify) => {
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

    // Medarbetare ser bara sina egna
    if (request.user.role === 'EMPLOYEE') {
      where.userId = request.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: getDayEnd(to) };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true, customer: { select: { id: true, name: true } } } },
        activity: { select: { id: true, name: true, code: true } },
        attachments: true,
        approver: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return entries;
  });

  // Get team week summary (admin/supervisor)
  fastify.get('/week-summary/:weekStart', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const { weekStart } = request.params as { weekStart: string };
    const startDate = new Date(weekStart);
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

    const startDate = new Date(weekStart);
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
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        project: { select: { id: true, name: true, code: true, site: true } },
        activity: { select: { id: true, name: true, code: true } },
        attachments: true,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    // Hämta veckolås
    const weekLock = await prisma.weekLock.findUnique({
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
      const dateKey = entry.date.toISOString().split('T')[0];
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + entry.hours;
      totalHours += entry.hours;
      if (entry.billable) billableHours += entry.hours;
    });

    return {
      entries,
      weekLock,
      summary: {
        totalHours,
        billableHours,
        dailyTotals,
      },
    };
  });

  // Get single entry
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const entry = await prisma.timeEntry.findFirst({
      where: { id, user: { companyId: request.user.companyId } },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true, customer: { select: { id: true, name: true } } } },
        activity: { select: { id: true, name: true, code: true } },
        attachments: true,
        approver: { select: { id: true, name: true } },
      },
    });

    if (!entry) {
      return reply.status(404).send({ error: 'Tidrad hittades inte' });
    }

    // Kontrollera behörighet
    if (request.user.role === 'EMPLOYEE' && entry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    return entry;
  });

  // Create time entry
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = timeEntrySchema.parse(request.body);

      const targetUserId = body.userId && ['ADMIN', 'SUPERVISOR'].includes(request.user.role)
        ? body.userId
        : request.user.id;

      const validation = await validateEntryReferences({
        companyId: request.user.companyId,
        targetUserId,
        activityId: body.activityId,
        projectId: body.projectId,
      });

      if (validation.error) {
        return reply.status(400).send({ error: validation.error });
      }

      // Kontrollera om veckan är låst
      const weekStart = getWeekStart(body.date);
      const weekLock = await prisma.weekLock.findUnique({
        where: {
          userId_weekStartDate: {
            userId: targetUserId,
            weekStartDate: weekStart,
          },
        },
      });

      if (weekLock && weekLock.status === 'APPROVED' && request.user.role === 'EMPLOYEE') {
        return reply.status(400).send({ error: 'Veckan är låst för redigering' });
      }

      const entry = await prisma.$transaction(async (tx) => {
        const created = await tx.timeEntry.create({
          data: {
            ...body,
            userId: targetUserId,
            billable: body.billable ?? validation.activity?.billableDefault ?? true,
            status: 'SUBMITTED',
            submittedAt: new Date(),
            rejectNote: null,
          },
          include: {
            project: { select: { id: true, name: true, code: true, site: true } },
            activity: { select: { id: true, name: true, code: true } },
          },
        });

        await upsertSubmittedWeekLock(tx, targetUserId, weekStart);

        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'CREATE',
            entityType: 'TimeEntry',
            entityId: created.id,
            newValue: JSON.stringify({ date: created.date, hours: created.hours, projectId: created.projectId }),
          },
        });

        if (created.projectId) {
          await enqueueTimeEntryChanged(tx, {
            companyId: request.user.companyId,
            projectId: created.projectId,
            entityId: created.id,
            action: 'CREATE',
            payload: {
              date: created.date.toISOString(),
              hours: created.hours,
              userId: created.userId,
            },
          });
        }

        return created;
      });

      return reply.status(201).send(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Bulk sync (for offline support)
  fastify.post('/sync', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const entries = bulkSyncSchema.parse(request.body);
      const results: any[] = [];

      for (const entry of entries) {
        const { localId, id, ...data } = entry;

        const validation = await validateEntryReferences({
          companyId: request.user.companyId,
          targetUserId: request.user.id,
          activityId: data.activityId,
          projectId: data.projectId,
        });

        if (validation.error) {
          results.push({ localId, error: validation.error });
          continue;
        }

        // Kontrollera om veckan är låst
        const weekStart = getWeekStart(data.date);
        const weekLock = await prisma.weekLock.findUnique({
          where: {
            userId_weekStartDate: {
              userId: request.user.id,
              weekStartDate: weekStart,
            },
          },
        });

        if (weekLock && ['APPROVED'].includes(weekLock.status)) {
          results.push({ localId, error: 'Veckan är låst' });
          continue;
        }

        if (id) {
          // Uppdatera befintlig
          const existing = await prisma.timeEntry.findUnique({ where: { id } });
          if (existing && existing.userId === request.user.id && existing.status !== 'APPROVED') {
            const updated = await prisma.$transaction(async (tx) => {
              const row = await tx.timeEntry.update({
                where: { id },
                data: {
                  ...data,
                  billable: data.billable ?? validation.activity?.billableDefault ?? true,
                  status: 'SUBMITTED',
                  submittedAt: new Date(),
                  approvedAt: null,
                  approverId: null,
                  rejectNote: null,
                },
              });

              await upsertSubmittedWeekLock(tx, request.user.id, weekStart);

              const affectedProjectIds = new Set<string>();
              if (existing.projectId) affectedProjectIds.add(existing.projectId);
              if (row.projectId) affectedProjectIds.add(row.projectId);

              for (const projectId of affectedProjectIds) {
                await enqueueTimeEntryChanged(tx, {
                  companyId: request.user.companyId,
                  projectId,
                  entityId: row.id,
                  action: 'SYNC',
                  payload: {
                    oldProjectId: existing.projectId,
                    newProjectId: row.projectId,
                    hours: row.hours,
                  },
                });
              }

              return row;
            });

            results.push({ localId, id: updated.id, synced: true });
          } else {
            results.push({ localId, id, error: 'Kan inte uppdatera' });
          }
        } else {
          // Skapa ny
          const created = await prisma.$transaction(async (tx) => {
            const row = await tx.timeEntry.create({
              data: {
                ...data,
                userId: request.user.id,
                billable: data.billable ?? validation.activity?.billableDefault ?? true,
                status: 'SUBMITTED',
                submittedAt: new Date(),
                rejectNote: null,
              },
            });

            await upsertSubmittedWeekLock(tx, request.user.id, weekStart);

            if (row.projectId) {
              await enqueueTimeEntryChanged(tx, {
                companyId: request.user.companyId,
                projectId: row.projectId,
                entityId: row.id,
                action: 'SYNC',
                payload: {
                  hours: row.hours,
                  date: row.date.toISOString(),
                },
              });
            }

            return row;
          });

          results.push({ localId, id: created.id, synced: true });
        }
      }

      return { results };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update time entry
  fastify.put('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = timeEntrySchema.partial().parse(request.body);

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

      // Kontrollera status
      if (entry.status === 'APPROVED' && request.user.role === 'EMPLOYEE') {
        return reply.status(400).send({ error: 'Kan inte redigera godkänd tidrad' });
      }

      const targetUserId = body.userId && ['ADMIN', 'SUPERVISOR'].includes(request.user.role)
        ? body.userId
        : entry.userId;
      const effectiveActivityId = body.activityId ?? entry.activityId;
      const effectiveProjectId = body.projectId !== undefined ? body.projectId : entry.projectId;
      const validation = await validateEntryReferences({
        companyId: request.user.companyId,
        targetUserId,
        activityId: effectiveActivityId,
        projectId: effectiveProjectId,
      });

      if (validation.error) {
        return reply.status(400).send({ error: validation.error });
      }

      const updateBody = {
        ...body,
        userId: targetUserId,
      };
      const oldValue = { date: entry.date, hours: entry.hours, note: entry.note };

      const updatedEntry = await prisma.$transaction(async (tx) => {
        const updated = await tx.timeEntry.update({
          where: { id },
          data: {
            ...updateBody,
            status: 'SUBMITTED',
            submittedAt: new Date(),
            approvedAt: null,
            approverId: null,
            rejectNote: null,
          },
          include: {
            project: { select: { id: true, name: true, code: true, site: true } },
            activity: { select: { id: true, name: true, code: true } },
          },
        });

        await upsertSubmittedWeekLock(tx, updated.userId, getWeekStart(updated.date));

        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'UPDATE',
            entityType: 'TimeEntry',
            entityId: id,
            oldValue: JSON.stringify(oldValue),
            newValue: JSON.stringify(updateBody),
          },
        });

        const affectedProjectIds = new Set<string>();
        if (entry.projectId) affectedProjectIds.add(entry.projectId);
        if (updated.projectId) affectedProjectIds.add(updated.projectId);

        for (const projectId of affectedProjectIds) {
          await enqueueTimeEntryChanged(tx, {
            companyId: request.user.companyId,
            projectId,
            entityId: id,
            action: 'UPDATE',
            payload: {
              oldProjectId: entry.projectId,
              newProjectId: updated.projectId,
              hours: updated.hours,
              date: updated.date.toISOString(),
            },
          });
        }

        return updated;
      });

      return updatedEntry;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete time entry
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const entry = await prisma.timeEntry.findFirst({
      where: { id, user: { companyId: request.user.companyId } },
      include: { attachments: { select: { path: true } } },
    });
    if (!entry) {
      return reply.status(404).send({ error: 'Tidrad hittades inte' });
    }

    // Kontrollera behörighet
    if (request.user.role === 'EMPLOYEE' && entry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    // Kontrollera status
    if (entry.status === 'APPROVED' && request.user.role === 'EMPLOYEE') {
      return reply.status(400).send({ error: 'Kan inte ta bort godkänd tidrad' });
    }

    await prisma.timeEntry.delete({ where: { id } });
    deleteAttachmentFiles(entry.attachments, fastify.log);

    const weekStart = getWeekStart(entry.date);
    const weekEnd = getWeekEnd(weekStart);

    const remainingCount = await prisma.timeEntry.count({
      where: {
        userId: entry.userId,
        date: { gte: weekStart, lte: weekEnd },
      },
    });

    if (remainingCount === 0) {
      await prisma.weekLock.deleteMany({
        where: {
          userId: entry.userId,
          weekStartDate: weekStart,
        },
      });
    } else {
      await prisma.weekLock.upsert({
        where: {
          userId_weekStartDate: {
            userId: entry.userId,
            weekStartDate: weekStart,
          },
        },
        update: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          comment: null,
          reviewedAt: null,
          reviewerId: null,
        },
        create: {
          userId: entry.userId,
          weekStartDate: weekStart,
          status: 'SUBMITTED',
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'TimeEntry',
        entityId: id,
        oldValue: JSON.stringify({ date: entry.date, hours: entry.hours }),
      },
    });

    if (entry.projectId) {
      await enqueueTimeEntryChanged(prisma, {
        companyId: request.user.companyId,
        projectId: entry.projectId,
        entityId: id,
        action: 'DELETE',
        payload: {
          date: entry.date.toISOString(),
          hours: entry.hours,
          userId: entry.userId,
        },
      });
    }

    return { message: 'Tidrad borttagen' };
  });

  // Upload attachment
  fastify.post('/:id/attachments', {
    preHandler: [fastify.authenticate],
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

    // Spara fil och räkna verklig storlek under streamingen
    await pipeline(data.file, countBytes, fs.createWriteStream(filepath));

    const attachment = await prisma.attachment.create({
      data: {
        timeEntryId: id,
        filename,
        originalName,
        mimeType: data.mimetype,
        size,
        path: filepath,
      },
    });

    return reply.status(201).send(attachment);
  });

  // Download attachment via authenticated API instead of public /uploads URL
  fastify.get('/:id/attachments/:attachmentId/download', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };

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
    preHandler: [fastify.authenticate],
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

    await prisma.attachment.delete({ where: { id: attachmentId } });
    deleteAttachmentFiles([{ path: attachment.path }], fastify.log);

    return { message: 'Bilaga borttagen' };
  });
};

// Hjälpfunktion för att få veckans startdatum (måndag)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDayEnd(date: string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function upsertSubmittedWeekLock(tx: any, userId: string, weekStartDate: Date) {
  return tx.weekLock.upsert({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate,
      },
    },
    update: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      comment: null,
      reviewedAt: null,
      reviewerId: null,
    },
    create: {
      userId,
      weekStartDate,
      status: 'SUBMITTED',
    },
  });
}

async function validateEntryReferences({
  companyId,
  targetUserId,
  activityId,
  projectId,
}: {
  companyId: string;
  targetUserId: string;
  activityId?: string;
  projectId?: string | null;
}) {
  const [targetUser, activity, project] = await Promise.all([
    prisma.user.findFirst({
      where: { id: targetUserId, companyId, active: true },
      select: { id: true },
    }),
    activityId
      ? prisma.activity.findFirst({
          where: { id: activityId, companyId },
          select: { id: true, billableDefault: true, category: true },
        })
      : Promise.resolve(null),
    projectId
      ? prisma.project.findFirst({
          where: { id: projectId, companyId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!targetUser) {
    return { error: 'Användaren tillhör inte företaget eller är inaktiv', activity: null };
  }

  if (activityId && !activity) {
    return { error: 'Aktiviteten tillhör inte företaget', activity: null };
  }

  if (projectId && !project) {
    return { error: 'Projektet tillhör inte företaget', activity: null };
  }

  if (activity && !projectId && !['ABSENCE', 'INTERNAL'].includes(activity.category)) {
    return { error: 'Projekt krävs för vald aktivitet', activity: null };
  }

  return { error: null, activity };
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
