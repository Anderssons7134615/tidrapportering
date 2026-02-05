import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const timeEntrySchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid(),
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
  }, async (request) => {
    const { from, to, userId, projectId, status } = request.query as {
      from?: string;
      to?: string;
      userId?: string;
      projectId?: string;
      status?: string;
    };

    const where: any = {};

    // Medarbetare ser bara sina egna
    if (request.user.role === 'EMPLOYEE') {
      where.userId = request.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: new Date(to) };
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

  // Get entries for a specific week
  fastify.get('/week/:weekStart', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { weekStart } = request.params as { weekStart: string };
    const { userId } = request.query as { userId?: string };

    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const targetUserId = request.user.role === 'EMPLOYEE'
      ? request.user.id
      : (userId || request.user.id);

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId: targetUserId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
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

      // Kontrollera om veckan är låst
      const weekStart = getWeekStart(body.date);
      const weekLock = await prisma.weekLock.findUnique({
        where: {
          userId_weekStartDate: {
            userId: request.user.id,
            weekStartDate: weekStart,
          },
        },
      });

      if (weekLock && ['SUBMITTED', 'APPROVED'].includes(weekLock.status)) {
        return reply.status(400).send({ error: 'Veckan är låst för redigering' });
      }

      // Hämta aktivitet för att sätta billable default
      const activity = await prisma.activity.findUnique({
        where: { id: body.activityId },
      });

      const entry = await prisma.timeEntry.create({
        data: {
          ...body,
          userId: request.user.id,
          billable: body.billable ?? activity?.billableDefault ?? true,
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          activity: { select: { id: true, name: true, code: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'TimeEntry',
          entityId: entry.id,
          newValue: JSON.stringify({ date: entry.date, hours: entry.hours, projectId: entry.projectId }),
        },
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

        if (weekLock && ['SUBMITTED', 'APPROVED'].includes(weekLock.status)) {
          results.push({ localId, error: 'Veckan är låst' });
          continue;
        }

        // Hämta aktivitet för billable default
        const activity = await prisma.activity.findUnique({
          where: { id: data.activityId },
        });

        if (id) {
          // Uppdatera befintlig
          const existing = await prisma.timeEntry.findUnique({ where: { id } });
          if (existing && existing.userId === request.user.id && existing.status === 'DRAFT') {
            const updated = await prisma.timeEntry.update({
              where: { id },
              data: {
                ...data,
                billable: data.billable ?? activity?.billableDefault ?? true,
              },
            });
            results.push({ localId, id: updated.id, synced: true });
          } else {
            results.push({ localId, id, error: 'Kan inte uppdatera' });
          }
        } else {
          // Skapa ny
          const created = await prisma.timeEntry.create({
            data: {
              ...data,
              userId: request.user.id,
              billable: data.billable ?? activity?.billableDefault ?? true,
            },
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
      if (entry.status !== 'DRAFT' && request.user.role === 'EMPLOYEE') {
        return reply.status(400).send({ error: 'Kan inte redigera inskickad tidrad' });
      }

      const oldValue = { date: entry.date, hours: entry.hours, note: entry.note };

      const updatedEntry = await prisma.timeEntry.update({
        where: { id },
        data: body,
        include: {
          project: { select: { id: true, name: true, code: true } },
          activity: { select: { id: true, name: true, code: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'TimeEntry',
          entityId: id,
          oldValue: JSON.stringify(oldValue),
          newValue: JSON.stringify(body),
        },
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
    if (entry.status !== 'DRAFT' && request.user.role === 'EMPLOYEE') {
      return reply.status(400).send({ error: 'Kan inte ta bort inskickad tidrad' });
    }

    await prisma.timeEntry.delete({ where: { id } });

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

export default timeEntryRoutes;
