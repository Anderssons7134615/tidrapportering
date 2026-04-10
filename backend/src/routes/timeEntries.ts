import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

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

    const users = await prisma.user.findMany({
      where: { companyId: request.user.companyId, active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });

    const [entries, weekLocks] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          userId: true,
          date: true,
          createdAt: true,
          hours: true,
          billable: true,
          projectId: true,
          activity: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.weekLock.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          weekStartDate: startDate,
        },
        select: { userId: true, status: true },
      }),
    ]);

    const weekLockByUser = new Map(weekLocks.map((lock) => [lock.userId, lock.status]));
    const entriesByUser = new Map<string, typeof entries>();

    for (const entry of entries) {
      if (!entriesByUser.has(entry.userId)) {
        entriesByUser.set(entry.userId, []);
      }
      entriesByUser.get(entry.userId)!.push(entry);
    }

    const summaries = users.map((u) => {
      const userEntries = entriesByUser.get(u.id) || [];

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

      return {
        userId: u.id,
        userName: u.name,
        role: u.role,
        totalHours,
        billableHours,
        entryCount: userEntries.length,
        status: weekLockByUser.get(u.id) || 'DRAFT',
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

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
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

      if (weekLock && ['APPROVED'].includes(weekLock.status)) {
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

      const entry = await prisma.timeEntry.findUnique({ where: { id } });
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
      const validation = await validateEntryReferences({
        companyId: request.user.companyId,
        targetUserId,
        activityId: body.activityId,
        projectId: body.projectId,
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
          data: entry.status === 'APPROVED'
            ? updateBody
            : {
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

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
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

    return { message: 'Tidrad borttagen' };
  });

  // Upload attachment
  fastify.post('/:id/attachments', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
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

    const uploadDir = process.env.UPLOAD_DIR || '../uploads';
    const filename = `${Date.now()}-${data.filename}`;
    const filepath = path.join(uploadDir, filename);

    // Skapa mapp om den inte finns
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Spara fil
    await pipeline(data.file, fs.createWriteStream(filepath));

    const attachment = await prisma.attachment.create({
      data: {
        timeEntryId: id,
        filename,
        originalName: data.filename,
        mimeType: data.mimetype,
        size: 0, // TODO: beräkna storlek
        path: filepath,
      },
    });

    return reply.status(201).send(attachment);
  });

  // Delete attachment
  fastify.delete('/:id/attachments/:attachmentId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { timeEntry: true },
    });

    if (!attachment || attachment.timeEntryId !== id) {
      return reply.status(404).send({ error: 'Bilaga hittades inte' });
    }

    // Kontrollera behörighet
    if (request.user.role === 'EMPLOYEE' && attachment.timeEntry.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    // Ta bort fil
    if (fs.existsSync(attachment.path)) {
      fs.unlinkSync(attachment.path);
    }

    await prisma.attachment.delete({ where: { id: attachmentId } });

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
          select: { id: true, billableDefault: true },
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

  return { error: null, activity };
}

export default timeEntryRoutes;
