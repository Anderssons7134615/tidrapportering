import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { addUtcDays, dateOnlySchema, getWeekEndUtc, getWeekStartUtc, toDateKey } from '../lib/dateOnly.js';
import { canApproveWeek } from '../lib/safety.js';
import { captureFinancialSnapshot } from '../lib/projectMetrics.js';

const getWeekStart = getWeekStartUtc;
const requireTimeWriter = requireRoles(['ADMIN', 'SUPERVISOR', 'EMPLOYEE']);

const getRequiredWeekdayKeys = (weekStartDate: Date) => {
  return Array.from({ length: 5 }, (_, index) => {
    return toDateKey(addUtcDays(weekStartDate, index));
  });
};

const getMissingRequiredWeekdays = (weekStartDate: Date, entries: Array<{ date: Date; hours: number }>) => {
  const hoursByDate = new Map<string, number>();

  for (const entry of entries) {
    const key = toDateKey(entry.date);
    hoursByDate.set(key, (hoursByDate.get(key) || 0) + entry.hours);
  }

  return getRequiredWeekdayKeys(weekStartDate).filter((key) => (hoursByDate.get(key) || 0) <= 0);
};

async function changeEntry(tx: Prisma.TransactionClient, entry: { id: string; revision: number; status: string }, data: Prisma.TimeEntryUncheckedUpdateManyInput) {
  const result = await tx.timeEntry.updateMany({ where: { id: entry.id, revision: entry.revision, status: entry.status }, data: { ...data, revision: { increment: 1 } } });
  if (result.count !== 1) throw Object.assign(new Error('Tidraden ändrades under granskningen. Hämta veckan igen.'), { statusCode: 409 });
}

const weekLockRoutes: FastifyPluginAsync = async (fastify) => {
  // List week locks (pending approval for admin/supervisor)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (request.user.role === 'ACCOUNTANT') return [];
    const { status, userId } = request.query as { status?: string; userId?: string };

    const where: any = { user: { companyId: request.user.companyId } };

    if (request.user.role === 'EMPLOYEE') {
      where.userId = request.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (status) where.status = status;

    const locks = await prisma.weekLock.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, allowIncompleteWeekApproval: true } },
      },
      orderBy: [{ status: 'asc' }, { weekStartDate: 'desc' }],
    });

    // Lägg till summering av timmar för varje vecka
    const locksWithSummary = await Promise.all(
      locks.map(async (lock) => {
        const weekEnd = getWeekEndUtc(lock.weekStartDate);

        const [stats, billableStats, weekEntries] = await Promise.all([
          prisma.timeEntry.aggregate({
            where: {
              userId: lock.userId,
              date: {
                gte: lock.weekStartDate,
                lte: weekEnd,
              },
            },
            _sum: { hours: true },
            _count: true,
          }),
          prisma.timeEntry.aggregate({
            where: {
              userId: lock.userId,
              date: {
                gte: lock.weekStartDate,
                lte: weekEnd,
              },
              billable: true,
            },
            _sum: { hours: true },
          }),
          prisma.timeEntry.findMany({
            where: {
              userId: lock.userId,
              date: {
                gte: lock.weekStartDate,
                lte: weekEnd,
              },
            },
            select: { date: true, hours: true },
          }),
        ]);
        const missingRequiredWeekdays = getMissingRequiredWeekdays(lock.weekStartDate, weekEntries);

        return {
          ...lock,
          totalHours: stats._sum.hours || 0,
          billableHours: billableStats._sum.hours || 0,
          entryCount: stats._count,
          missingRequiredWeekdays,
          allowIncompleteWeekApproval: lock.user.allowIncompleteWeekApproval,
          isCompleteForApproval: weekEntries.length > 0 && (missingRequiredWeekdays.length === 0 || lock.user.allowIncompleteWeekApproval),
        };
      })
    );

    return locksWithSummary;
  });

  // Get pending approvals count
  fastify.get('/pending-count', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const count = await prisma.weekLock.count({
      where: { status: 'SUBMITTED', user: { companyId: request.user.companyId } },
    });

    return { count };
  });

  // Submit week for approval
  fastify.post('/submit', {
    preHandler: [requireTimeWriter],
  }, async (request, reply) => {
    const schema = z.object({
      weekStartDate: dateOnlySchema,
    });

    try {
      const body = schema.parse(request.body);
      const weekStartDate = getWeekStart(body.weekStartDate);

      const weekEnd = getWeekEndUtc(weekStartDate);
      const weekLock = await prisma.$transaction(async (tx) => {
        const existing = await tx.weekLock.findUnique({ where: { userId_weekStartDate: { userId: request.user.id, weekStartDate } } });
        if (existing?.status === 'APPROVED') throw Object.assign(new Error('Veckan är redan godkänd'), { statusCode: 409 });
        if (existing?.status === 'SUBMITTED') throw Object.assign(new Error('Veckan är redan inskickad'), { statusCode: 409 });
        const entries = await tx.timeEntry.findMany({ where: { userId: request.user.id, date: { gte: weekStartDate, lte: weekEnd } }, select: { id: true, revision: true, status: true } });
        if (!entries.length) throw Object.assign(new Error('Inga tidrader finns för veckan'), { statusCode: 400 });
        if (entries.some(entry => entry.status === 'APPROVED')) throw Object.assign(new Error('Godkända tidrader måste låsas upp före ändring'), { statusCode: 409 });
        for (const entry of entries.filter(entry => ['DRAFT', 'REJECTED'].includes(entry.status))) await changeEntry(tx, entry, {
          status: 'SUBMITTED', submittedAt: new Date(), approvedAt: null, approverId: null, rejectNote: null,
        });

        const lock = await tx.weekLock.upsert({
          where: {
            userId_weekStartDate: {
              userId: request.user.id,
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
            userId: request.user.id,
            weekStartDate,
            status: 'SUBMITTED',
          },
        });

        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'SUBMIT',
            entityType: 'WeekLock',
            entityId: lock.id,
            newValue: JSON.stringify({ weekStartDate }),
          },
        });

        return lock;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return weekLock;
    } catch (error: any) {
      if (error?.code === 'P2034') return reply.status(409).send({ error: 'Veckan ändrades samtidigt. Hämta veckan igen.' });
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Approve week
  fastify.post('/:id/approve', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const { id } = request.params as { id: string };

    const weekLock = await prisma.weekLock.findFirst({
      where: { id, user: { companyId: request.user.companyId } },
    });
    if (!weekLock) {
      return reply.status(404).send({ error: 'Veckolås hittades inte' });
    }

    if (!canApproveWeek(request.user.role, request.user.id, weekLock.userId)) {
      return reply.status(403).send({ error: 'Endast admin kan godkänna sin egen vecka. Arbetsledare behöver en annan attestant.' });
    }

    if (weekLock.status !== 'SUBMITTED') {
      return reply.status(400).send({ error: 'Veckan kan inte godkännas' });
    }

    const weekEnd = getWeekEndUtc(weekLock.weekStartDate);

    try {
      const updatedLock = await prisma.$transaction(async (tx) => {
        const entries = await tx.timeEntry.findMany({
          where: {
            userId: weekLock.userId,
            date: { gte: weekLock.weekStartDate, lte: weekEnd },
          },
          include: {
            user: { select: { hourlyCost: true, allowIncompleteWeekApproval: true } },
            activity: { select: { rateOverride: true } },
            project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
          },
        });
        const missingRequiredWeekdays = getMissingRequiredWeekdays(weekLock.weekStartDate, entries);
        if (entries.length === 0) throw Object.assign(new Error('Inga tidrader finns för veckan'), { statusCode: 400 });
        const allowIncompleteWeekApproval = entries[0].user.allowIncompleteWeekApproval;
        if (missingRequiredWeekdays.length > 0 && !allowIncompleteWeekApproval) {
          throw Object.assign(
            new Error(`Veckan kan inte låsas innan hela veckan är rapporterad. Saknar tid: ${missingRequiredWeekdays.join(', ')}`),
            { statusCode: 400 }
          );
        }
        if (entries.some((entry) => entry.status !== 'SUBMITTED')) {
          throw Object.assign(new Error('Alla tidrader måste vara inskickade före attest'), { statusCode: 409 });
        }

        const transition = await tx.weekLock.updateMany({
          where: { id, status: 'SUBMITTED' },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewerId: request.user.id,
          },
        });
        if (transition.count !== 1) {
          throw Object.assign(new Error('Veckan har redan ändrats av någon annan'), { statusCode: 409 });
        }

        const approvedAt = new Date();
        for (const entry of entries) await changeEntry(tx, entry, {
          status: 'APPROVED', approvedAt, approverId: request.user.id,
          ...captureFinancialSnapshot(entry, approvedAt),
        });

        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'APPROVE',
            entityType: 'WeekLock',
            entityId: id,
            newValue: JSON.stringify({
              status: 'APPROVED',
              selfApproval: request.user.id === weekLock.userId,
              ...(missingRequiredWeekdays.length > 0 ? { incompleteWeekException: true, missingRequiredWeekdays } : {}),
            }),
          },
        });

        return tx.weekLock.findUniqueOrThrow({ where: { id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return updatedLock;
    } catch (error: any) {
      if (error?.code === 'P2034') {
        return reply.status(409).send({ error: 'Veckan ändrades samtidigt. Försök igen.' });
      }
      throw error;
    }
  });

  // Reject week
  fastify.post('/:id/reject', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const { id } = request.params as { id: string };
    const schema = z.object({
      comment: z.string().trim().min(1, 'Ange en anledning till nekandet'),
    });

    try {
      const body = schema.parse(request.body);

      const weekLock = await prisma.weekLock.findFirst({
        where: { id, user: { companyId: request.user.companyId } },
      });
      if (!weekLock) {
        return reply.status(404).send({ error: 'Veckolås hittades inte' });
      }

      if (weekLock.status !== 'SUBMITTED') {
        return reply.status(400).send({ error: 'Veckan kan inte nekas' });
      }

      const weekEnd = getWeekEndUtc(weekLock.weekStartDate);

      const updatedLock = await prisma.$transaction(async (tx) => {
        const entries = await tx.timeEntry.findMany({
          where: { userId: weekLock.userId, date: { gte: weekLock.weekStartDate, lte: weekEnd } },
          select: { id: true, revision: true, status: true },
        });
        if (!entries.length || entries.some(entry => entry.status !== 'SUBMITTED')) {
          throw Object.assign(new Error('Veckans tidrader är inte i ett attesterbart läge'), { statusCode: 409 });
        }

        const transition = await tx.weekLock.updateMany({
          where: { id, status: 'SUBMITTED' },
          data: {
            status: 'REJECTED',
            comment: body.comment,
            reviewedAt: new Date(),
            reviewerId: request.user.id,
          },
        });
        if (transition.count !== 1) {
          throw Object.assign(new Error('Veckan har redan ändrats av någon annan'), { statusCode: 409 });
        }

        for (const entry of entries) await changeEntry(tx, entry, {
          status: 'REJECTED', rejectNote: body.comment,
        });

        await tx.auditLog.create({
          data: {
            userId: request.user.id,
            action: 'REJECT',
            entityType: 'WeekLock',
            entityId: id,
            newValue: JSON.stringify({ status: 'REJECTED', comment: body.comment }),
          },
        });

        return tx.weekLock.findUniqueOrThrow({ where: { id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return updatedLock;
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      if (error?.code === 'P2034') {
        return reply.status(409).send({ error: 'Veckan ändrades samtidigt. Försök igen.' });
      }
      throw error;
    }
  });

  // Unlock week (reopen for editing)
  fastify.post('/:id/unlock', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const { id } = request.params as { id: string };

    const weekLock = await prisma.weekLock.findFirst({
      where: { id, user: { companyId: request.user.companyId } },
    });
    if (!weekLock) {
      return reply.status(404).send({ error: 'Veckolås hittades inte' });
    }
    if (weekLock.status === 'DRAFT') return reply.status(409).send({ error: 'Veckan är redan upplåst' });

    const weekEnd = getWeekEndUtc(weekLock.weekStartDate);

    try {
      await prisma.$transaction(async (tx) => {
        const transition = await tx.weekLock.updateMany({ where: { id, status: weekLock.status }, data: {
          status: 'DRAFT', comment: null, reviewedAt: null, reviewerId: null,
        } });
        if (transition.count !== 1) throw Object.assign(new Error('Veckan har redan ändrats av någon annan'), { statusCode: 409 });
        const entries = await tx.timeEntry.findMany({
          where: { userId: weekLock.userId, date: { gte: weekLock.weekStartDate, lte: weekEnd } },
          select: { id: true, revision: true, status: true },
        });
        for (const entry of entries) await changeEntry(tx, entry, {
          status: 'DRAFT', submittedAt: null, approvedAt: null, approverId: null, rejectNote: null,
          approvedHourlyCostSnapshot: null, approvedBillingRateSnapshot: null, financialSnapshotCapturedAt: null,
        });
        await tx.auditLog.create({ data: { userId: request.user.id, action: 'UNLOCK', entityType: 'WeekLock', entityId: id, oldValue: JSON.stringify({ status: weekLock.status }) } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code === 'P2034') return reply.status(409).send({ error: 'Veckan ändrades samtidigt. Hämta veckan igen.' });
      throw error;
    }

    return { message: 'Veckan upplåst' };
  });
};

export default weekLockRoutes;
