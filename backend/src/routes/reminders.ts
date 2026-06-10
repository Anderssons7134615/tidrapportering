import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../index.js';
import { isPushConfigured, sendPushNotification } from '../lib/push.js';

async function authenticateReminderRequest(fastify: any, request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  const jobToken = process.env.REMINDER_JOB_TOKEN;

  const isJobTokenAuth = Boolean(jobToken && bearerToken === jobToken);
  if (isJobTokenAuth) return 'job-token';

  await fastify.authenticate(request, reply);
  if (reply.sent) return null;

  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    reply.status(403).send({ error: 'Åtkomst nekad' });
    return null;
  }

  return 'jwt';
}

function getDayStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayEnd(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const reminderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/daily-time', async (request, reply) => {
    const authMode = await authenticateReminderRequest(fastify, request, reply);
    if (!authMode) return;

    if (!isPushConfigured()) {
      return reply.status(503).send({ error: 'Push-notiser är inte konfigurerade (VAPID saknas)' });
    }

    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) {
      return {
        skipped: true,
        reason: 'Helg',
        authMode,
      };
    }

    const dayStart = getDayStart(now);
    const dayEnd = getDayEnd(now);
    const dateKey = dayStart.toISOString().slice(0, 10);

    const employees = await prisma.user.findMany({
      where: {
        active: true,
        role: 'EMPLOYEE',
      },
      include: {
        company: {
          include: {
            settings: true,
          },
        },
        timeEntries: {
          where: {
            date: { gte: dayStart, lte: dayEnd },
          },
          select: { id: true },
        },
        pushSubscriptions: true,
      },
    });

    let sent = 0;
    let failed = 0;
    let skippedBySettings = 0;
    const usersWithoutTime: string[] = [];

    for (const user of employees) {
      const settings = user.company.settings[0];
      if (settings && !settings.reminderEnabled) {
        skippedBySettings += 1;
        continue;
      }

      if (user.timeEntries.length > 0) continue;
      usersWithoutTime.push(user.id);

      for (const subscription of user.pushSubscriptions) {
        try {
          await sendPushNotification(
            {
              endpoint: subscription.endpoint,
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
            {
              title: 'Påminnelse: rapportera dagens tid',
              body: `Hej ${user.name}! Du saknar tidrapportering för idag.`,
              url: '/time-entry',
              tag: `daily-time-${dateKey}`,
            }
          );

          sent += 1;
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { lastSuccessAt: new Date(), failureReason: null },
          });
        } catch (error: any) {
          failed += 1;
          const statusCode = Number(error?.statusCode || 0);

          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: {
              lastFailureAt: new Date(),
              failureReason: String(error?.message || 'Okänt push-fel').slice(0, 300),
            },
          });

          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: subscription.id } });
          }
        }
      }
    }

    return {
      date: dateKey,
      usersScanned: employees.length,
      usersWithoutTime: usersWithoutTime.length,
      skippedBySettings,
      sent,
      failed,
      authMode,
    };
  });

  fastify.post('/weekly-attestation', async (request, reply) => {
    const authMode = await authenticateReminderRequest(fastify, request, reply);
    if (!authMode) return;

    if (!isPushConfigured()) {
      return reply.status(503).send({ error: 'Push-notiser är inte konfigurerade (VAPID saknas)' });
    }

    const weekStart = getWeekStart();

    const employees = await prisma.user.findMany({
      where: {
        active: true,
        role: 'EMPLOYEE',
      },
      include: {
        weekLocks: {
          where: {
            weekStartDate: weekStart,
            status: { in: ['SUBMITTED', 'APPROVED'] },
          },
          select: { id: true },
        },
        pushSubscriptions: true,
      },
    });

    let sent = 0;
    let failed = 0;
    const usersWithoutSubmission: string[] = [];

    for (const user of employees) {
      if (user.weekLocks.length > 0) continue;
      usersWithoutSubmission.push(user.id);

      for (const subscription of user.pushSubscriptions) {
        try {
          await sendPushNotification(
            {
              endpoint: subscription.endpoint,
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
            {
              title: 'Påminnelse: skicka in veckan',
              body: `Hej ${user.name}! Du har inte skickat in din vecka ännu.`,
              url: '/week',
              tag: `week-attestation-${weekStart.toISOString().slice(0, 10)}`,
            }
          );

          sent += 1;
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { lastSuccessAt: new Date(), failureReason: null },
          });
        } catch (error: any) {
          failed += 1;
          const statusCode = Number(error?.statusCode || 0);

          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: {
              lastFailureAt: new Date(),
              failureReason: String(error?.message || 'Okänt push-fel').slice(0, 300),
            },
          });

          // 404/410 betyder död subscription -> städa bort.
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: subscription.id } });
          }
        }
      }
    }

    return {
      weekStart,
      usersScanned: employees.length,
      usersWithoutSubmission: usersWithoutSubmission.length,
      sent,
      failed,
      authMode,
    };
  });
};

export default reminderRoutes;
