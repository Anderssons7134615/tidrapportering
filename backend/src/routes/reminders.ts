import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../index.js';
import { isPushConfigured, sendPushNotification } from '../lib/push.js';
import { getDateOnlyInTimeZone, getWeekStartUtc, toDateKey } from '../lib/dateOnly.js';

const reminderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/weekly-attestation', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;
    const jobToken = process.env.REMINDER_JOB_TOKEN;

    const isJobTokenAuth = Boolean(jobToken && bearerToken === jobToken);

    if (!isJobTokenAuth) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;

      if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
        return reply.status(403).send({ error: 'Åtkomst nekad' });
      }
    }

    if (!isPushConfigured()) {
      return reply.status(503).send({ error: 'Push-notiser är inte konfigurerade (VAPID saknas)' });
    }

    const weekStart = getWeekStartUtc(getDateOnlyInTimeZone());

    const employeeWhere = {
      active: true,
      role: 'EMPLOYEE',
      ...(isJobTokenAuth ? {} : { companyId: request.user.companyId }),
    };

    const employees = await prisma.user.findMany({
      where: employeeWhere,
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
              title: 'Påminnelse: attestera veckan',
              body: `Hej ${user.name}! Du har inte skickat in din vecka ännu.`,
              url: '/week',
              tag: `week-attestation-${toDateKey(weekStart)}`,
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

          // 404/410 betyder död subscription -> städa bort
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
      authMode: isJobTokenAuth ? 'job-token' : 'jwt',
      scope: isJobTokenAuth ? 'all-companies' : request.user.companyId,
    };
  });
};

export default reminderRoutes;
