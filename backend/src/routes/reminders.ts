import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../index.js';
import { isPushConfigured } from '../lib/push.js';
import { getDateOnlyInTimeZone, getWeekStartUtc, toDateKey } from '../lib/dateOnly.js';
import { isWeeklyReminderDue } from '../lib/weeklyReminder.js';
import { deliverPushNotification } from '../services/pushDelivery.js';

const REMINDER_DELIVERY_AUDIT_TYPE = 'WeeklyAttestationReminderDelivery';
const DELIVERY_CONCURRENCY = 5;

type CompanyReminderResult = {
  usersScanned: number;
  usersWithoutSubmission: number;
  usersWithoutSubscription: number;
  subscriptionsSkippedAlreadySent: number;
  sent: number;
  failed: number;
};

async function sendWeeklyReminderForCompany(
  companyId: string,
  weekStart: Date,
  trackDeliveries = false
): Promise<CompanyReminderResult> {
  const employees = await prisma.user.findMany({
    where: {
      active: true,
      role: 'EMPLOYEE',
      companyId,
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
  let usersWithoutSubmission = 0;
  let usersWithoutSubscription = 0;
  let subscriptionsSkippedAlreadySent = 0;
  const candidates = employees
    .filter((user) => user.weekLocks.length === 0)
    .flatMap((user) => user.pushSubscriptions.map((subscription) => ({ user, subscription })));
  const deliveredSubscriptionIds = new Set<string>();

  if (trackDeliveries && candidates.length > 0) {
    const audits = await prisma.auditLog.findMany({
      where: {
        action: 'SEND',
        entityType: REMINDER_DELIVERY_AUDIT_TYPE,
        entityId: { in: candidates.map(({ subscription }) => subscription.id) },
        createdAt: { gte: weekStart },
      },
      select: { entityId: true },
    });

    for (const audit of audits) {
      if (audit.entityId) deliveredSubscriptionIds.add(audit.entityId);
    }
  }

  const pendingDeliveries: typeof candidates = [];

  for (const user of employees) {
    if (user.weekLocks.length > 0) continue;

    usersWithoutSubmission += 1;
    if (user.pushSubscriptions.length === 0) usersWithoutSubscription += 1;

    for (const subscription of user.pushSubscriptions) {
      if (deliveredSubscriptionIds.has(subscription.id)) {
        subscriptionsSkippedAlreadySent += 1;
      } else {
        pendingDeliveries.push({ user, subscription });
      }
    }
  }

  for (let index = 0; index < pendingDeliveries.length; index += DELIVERY_CONCURRENCY) {
    const batch = pendingDeliveries.slice(index, index + DELIVERY_CONCURRENCY);
    const results = await Promise.all(batch.map(async ({ user, subscription }) => {
      const result = await deliverPushNotification(prisma, subscription, {
        title: 'Påminnelse: skicka in veckan',
        body: `Hej ${user.name}! Din vecka är inte inskickad ännu.`,
        url: '/week',
        tag: `week-attestation-${toDateKey(weekStart)}`,
      });

      if (result.sent && trackDeliveries) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'SEND',
            entityType: REMINDER_DELIVERY_AUDIT_TYPE,
            entityId: subscription.id,
            newValue: JSON.stringify({ weekStart: toDateKey(weekStart) }),
          },
        });
      }

      return result;
    }));

    for (const result of results) {
      if (result.sent) sent += 1;
      else failed += 1;
    }
  }

  return {
    usersScanned: employees.length,
    usersWithoutSubmission,
    usersWithoutSubscription,
    subscriptionsSkippedAlreadySent,
    sent,
    failed,
  };
}

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

    const now = new Date();
    const weekStart = getWeekStartUtc(getDateOnlyInTimeZone(now));

    if (!isJobTokenAuth) {
      const result = await sendWeeklyReminderForCompany(request.user.companyId, weekStart);
      return {
        weekStart,
        ...result,
        authMode: 'jwt',
        scope: request.user.companyId,
      };
    }

    const companies = await prisma.company.findMany({
      where: { active: true },
      select: {
        id: true,
        settings: {
          select: {
            reminderEnabled: true,
            reminderTime: true,
          },
        },
      },
    });

    let companiesDue = 0;
    let companiesProcessed = 0;
    const totals: CompanyReminderResult = {
      usersScanned: 0,
      usersWithoutSubmission: 0,
      usersWithoutSubscription: 0,
      subscriptionsSkippedAlreadySent: 0,
      sent: 0,
      failed: 0,
    };

    for (const company of companies) {
      const settings = company.settings[0];
      const reminderEnabled = settings?.reminderEnabled ?? true;
      const reminderTime = settings?.reminderTime ?? '15:30';

      if (!reminderEnabled || !isWeeklyReminderDue(now, reminderTime)) continue;
      companiesDue += 1;

      const result = await sendWeeklyReminderForCompany(company.id, weekStart, true);
      companiesProcessed += 1;

      totals.usersScanned += result.usersScanned;
      totals.usersWithoutSubmission += result.usersWithoutSubmission;
      totals.usersWithoutSubscription += result.usersWithoutSubscription;
      totals.subscriptionsSkippedAlreadySent += result.subscriptionsSkippedAlreadySent;
      totals.sent += result.sent;
      totals.failed += result.failed;
    }

    return {
      weekStart,
      companiesScanned: companies.length,
      companiesDue,
      companiesProcessed,
      ...totals,
      authMode: 'job-token',
      scope: 'all-companies',
    };
  });
};

export default reminderRoutes;
