import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const weekLockRoutes: FastifyPluginAsync = async (fastify) => {
  // List week locks (pending approval for admin/supervisor)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { status, userId } = request.query as { status?: string; userId?: string };

    const where: any = {};

    if (request.user.role === 'EMPLOYEE') {
      where.userId = request.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (status) where.status = status;

    const locks = await prisma.weekLock.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ status: 'asc' }, { weekStartDate: 'desc' }],
    });

    // Lägg till summering av timmar för varje vecka
    const locksWithSummary = await Promise.all(
      locks.map(async (lock) => {
        const weekEnd = new Date(lock.weekStartDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const stats = await prisma.timeEntry.aggregate({
          where: {
            userId: lock.userId,
            date: {
              gte: lock.weekStartDate,
              lte: weekEnd,
            },
          },
          _sum: { hours: true },
          _count: true,
        });

        const billableStats = await prisma.timeEntry.aggregate({
          where: {
            userId: lock.userId,
            date: {
              gte: lock.weekStartDate,
              lte: weekEnd,
            },
            billable: true,
          },
          _sum: { hours: true },
        });

        return {
          ...lock,
          totalHours: stats._sum.hours || 0,
          billableHours: billableStats._sum.hours || 0,
          entryCount: stats._count,
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
      where: { status: 'SUBMITTED' },
    });

    return { count };
  });

  // Submit week for approval
  fastify.post('/submit', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const schema = z.object({
      weekStartDate: z.string().transform((d) => new Date(d)),
    });

    try {
      const body = schema.parse(request.body);

      // Kontrollera att det finns tidrader för veckan
      const weekEnd = new Date(body.weekStartDate);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const entryCount = await prisma.timeEntry.count({
        where: {
          userId: request.user.id,
          date: {
            gte: body.weekStartDate,
            lte: weekEnd,
          },
        },
      });

      if (entryCount === 0) {
        return reply.status(400).send({ error: 'Inga tidrader finns för veckan' });
      }

      // Kontrollera om det redan finns ett lås
      const existing = await prisma.weekLock.findUnique({
        where: {
          userId_weekStartDate: {
            userId: request.user.id,
            weekStartDate: body.weekStartDate,
          },
        },
      });

      if (existing) {
        if (existing.status === 'APPROVED') {
          return reply.status(400).send({ error: 'Veckan är redan godkänd' });
        }
        if (existing.status === 'SUBMITTED') {
          return reply.status(400).send({ error: 'Veckan är redan inskickad' });
        }
      }

      // Uppdatera alla tidrader till SUBMITTED
      await prisma.timeEntry.updateMany({
        where: {
          userId: request.user.id,
          date: {
            gte: body.weekStartDate,
            lte: weekEnd,
          },
          status: 'DRAFT',
        },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });

      // Skapa eller uppdatera veckolås
      const weekLock = await prisma.weekLock.upsert({
        where: {
          userId_weekStartDate: {
            userId: request.user.id,
            weekStartDate: body.weekStartDate,
          },
        },
        update: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          comment: null,
        },
        create: {
          userId: request.user.id,
          weekStartDate: body.weekStartDate,
          status: 'SUBMITTED',
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'SUBMIT',
          entityType: 'WeekLock',
          entityId: weekLock.id,
          newValue: JSON.stringify({ weekStartDate: body.weekStartDate }),
        },
      });

      return weekLock;
    } catch (error) {
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

    const weekLock = await prisma.weekLock.findUnique({ where: { id } });
    if (!weekLock) {
      return reply.status(404).send({ error: 'Veckolås hittades inte' });
    }

    if (weekLock.status !== 'SUBMITTED') {
      return reply.status(400).send({ error: 'Veckan kan inte godkännas' });
    }

    // Uppdatera veckolås
    const updatedLock = await prisma.weekLock.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewerId: request.user.id,
      },
    });

    // Uppdatera tidrader
    const weekEnd = new Date(weekLock.weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 6);

    await prisma.timeEntry.updateMany({
      where: {
        userId: weekLock.userId,
        date: {
          gte: weekLock.weekStartDate,
          lte: weekEnd,
        },
        status: 'SUBMITTED',
      },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approverId: request.user.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'APPROVE',
        entityType: 'WeekLock',
        entityId: id,
        newValue: JSON.stringify({ status: 'APPROVED' }),
      },
    });

    return updatedLock;
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
      comment: z.string().min(1),
    });

    try {
      const body = schema.parse(request.body);

      const weekLock = await prisma.weekLock.findUnique({ where: { id } });
      if (!weekLock) {
        return reply.status(404).send({ error: 'Veckolås hittades inte' });
      }

      if (weekLock.status !== 'SUBMITTED') {
        return reply.status(400).send({ error: 'Veckan kan inte nekas' });
      }

      // Uppdatera veckolås
      const updatedLock = await prisma.weekLock.update({
        where: { id },
        data: {
          status: 'REJECTED',
          comment: body.comment,
          reviewedAt: new Date(),
          reviewerId: request.user.id,
        },
      });

      // Uppdatera tidrader tillbaka till DRAFT
      const weekEnd = new Date(weekLock.weekStartDate);
      weekEnd.setDate(weekEnd.getDate() + 6);

      await prisma.timeEntry.updateMany({
        where: {
          userId: weekLock.userId,
          date: {
            gte: weekLock.weekStartDate,
            lte: weekEnd,
          },
          status: 'SUBMITTED',
        },
        data: {
          status: 'REJECTED',
          rejectNote: body.comment,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'REJECT',
          entityType: 'WeekLock',
          entityId: id,
          newValue: JSON.stringify({ status: 'REJECTED', comment: body.comment }),
        },
      });

      return updatedLock;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
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

    const weekLock = await prisma.weekLock.findUnique({ where: { id } });
    if (!weekLock) {
      return reply.status(404).send({ error: 'Veckolås hittades inte' });
    }

    // Uppdatera tidrader tillbaka till DRAFT
    const weekEnd = new Date(weekLock.weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 6);

    await prisma.timeEntry.updateMany({
      where: {
        userId: weekLock.userId,
        date: {
          gte: weekLock.weekStartDate,
          lte: weekEnd,
        },
      },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        approvedAt: null,
        approverId: null,
        rejectNote: null,
      },
    });

    // Ta bort veckolås
    await prisma.weekLock.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'UNLOCK',
        entityType: 'WeekLock',
        entityId: id,
        oldValue: JSON.stringify({ status: weekLock.status }),
      },
    });

    return { message: 'Veckan upplåst' };
  });
};

export default weekLockRoutes;
