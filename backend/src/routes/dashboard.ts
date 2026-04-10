import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const drilldownQuerySchema = z.object({
  metric: z.enum(['weekly-hours', 'monthly-hours', 'billable-hours', 'pending-approval']),
  date: z.string().optional(),
});

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(request.user.role);
      const period = getPeriodBounds(new Date());
      const userFilter = getUserFilter(request.user.id, request.user.companyId, isAdminOrSupervisor);

      if (isAdminOrSupervisor) {
        await backfillDraftWeeksToSubmitted(request.user.companyId);
      }

      const [monthStats, billableMonthStats, weekStats, pendingApprovals, myPendingWeeks, recentEntries, weeklyEntries] =
        await Promise.all([
          prisma.timeEntry.aggregate({
            where: {
              ...userFilter,
              date: { gte: period.monthStart, lte: period.monthEnd },
            },
            _sum: { hours: true },
          }),
          prisma.timeEntry.aggregate({
            where: {
              ...userFilter,
              date: { gte: period.monthStart, lte: period.monthEnd },
              billable: true,
            },
            _sum: { hours: true },
          }),
          prisma.timeEntry.aggregate({
            where: {
              ...userFilter,
              date: { gte: period.weekStart, lte: period.weekEnd },
            },
            _sum: { hours: true },
          }),
          isAdminOrSupervisor
            ? getPendingApprovals(request.user.companyId, 10)
            : Promise.resolve([]),
          request.user.role === 'EMPLOYEE'
            ? getMyPendingWeeks(request.user.id, period.weekStart)
            : Promise.resolve([]),
          prisma.timeEntry.findMany({
            where: userFilter,
            include: {
              project: { select: { name: true, code: true } },
              activity: { select: { name: true } },
              user: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
          prisma.timeEntry.findMany({
            where: {
              ...userFilter,
              date: { gte: period.weekStart, lte: period.weekEnd },
            },
            select: { date: true, hours: true },
          }),
        ]);

      const dailyHours = createDailyHoursMap(period.weekStart, weeklyEntries);

      return {
        summary: {
          monthlyHours: monthStats._sum.hours || 0,
          monthlyBillableHours: billableMonthStats._sum.hours || 0,
          weeklyHours: weekStats._sum.hours || 0,
          pendingApprovalCount: pendingApprovals.length,
        },
        pendingApprovals,
        myPendingWeeks,
        recentEntries,
        dailyHours,
        period: {
          monthStart: period.monthStart,
          monthEnd: period.monthEnd,
          weekStart: period.weekStart,
          weekEnd: period.weekEnd,
        },
      };
    }
  );

  fastify.get(
    '/drilldown',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { metric, date } = drilldownQuerySchema.parse(request.query);
      const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(request.user.role);
      const referenceDate = date ? new Date(date) : new Date();

      if (Number.isNaN(referenceDate.getTime())) {
        return reply.status(400).send({ error: 'Ogiltigt datum' });
      }

      const period = getPeriodBounds(referenceDate);
      const userFilter = getUserFilter(request.user.id, request.user.companyId, isAdminOrSupervisor);

      if (metric === 'weekly-hours' && isAdminOrSupervisor) {
        const entries = await prisma.timeEntry.findMany({
          where: {
            user: { companyId: request.user.companyId },
            date: { gte: period.weekStart, lte: period.weekEnd },
          },
          include: {
            user: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, code: true } },
            activity: { select: { id: true, name: true, code: true } },
          },
          orderBy: [{ user: { name: 'asc' } }, { date: 'asc' }, { createdAt: 'asc' }],
        });

        return {
          kind: 'weekly-user-summary',
          metric,
          title: 'Denna vecka',
          description: 'Kompakt veckovy per anställd.',
          totalHours: entries.reduce((sum, entry) => sum + entry.hours, 0),
          period: {
            start: period.weekStart,
            end: period.weekEnd,
          },
          users: buildWeeklyUserSummary(period.weekStart, entries),
        };
      }

      if (metric === 'pending-approval') {
        if (!isAdminOrSupervisor) {
          return reply.status(403).send({ error: 'Åtkomst nekad' });
        }

        const approvals = await getPendingApprovals(request.user.companyId);

        return {
          kind: 'pending-approvals',
          metric,
          title: 'Att attestera',
          description: 'Veckor som väntar på godkännande.',
          totalCount: approvals.length,
          period: {
            start: period.weekStart,
            end: period.weekEnd,
          },
          approvals,
        };
      }

      const filterByMetric =
        metric === 'weekly-hours'
          ? {
              date: { gte: period.weekStart, lte: period.weekEnd },
            }
          : metric === 'monthly-hours'
            ? {
                date: { gte: period.monthStart, lte: period.monthEnd },
              }
            : {
                date: { gte: period.monthStart, lte: period.monthEnd },
                billable: true,
              };

      const entries = await prisma.timeEntry.findMany({
        where: {
          ...userFilter,
          ...filterByMetric,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              site: true,
              customer: { select: { id: true, name: true } },
            },
          },
          activity: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });

      const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);

      return {
        kind: 'time-entries',
        metric,
        title: getMetricTitle(metric),
        description: getMetricDescription(metric, isAdminOrSupervisor),
        totalHours,
        period: {
          start: metric === 'weekly-hours' ? period.weekStart : period.monthStart,
          end: metric === 'weekly-hours' ? period.weekEnd : period.monthEnd,
        },
        entries,
      };
    }
  );

  fastify.get(
    '/quick-stats',
    {
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const weekStart = getWeekStart(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const [todayStats, weekStats] = await Promise.all([
        prisma.timeEntry.aggregate({
          where: {
            userId: request.user.id,
            date: { gte: todayStart, lt: todayEnd },
          },
          _sum: { hours: true },
        }),
        prisma.timeEntry.aggregate({
          where: {
            userId: request.user.id,
            date: { gte: weekStart, lte: weekEnd },
          },
          _sum: { hours: true },
        }),
      ]);

      return {
        todayHours: todayStats._sum.hours || 0,
        weekHours: weekStats._sum.hours || 0,
      };
    }
  );
};

function getUserFilter(userId: string, companyId: string, isAdminOrSupervisor: boolean) {
  return isAdminOrSupervisor
    ? { user: { companyId } }
    : { userId };
}

function getPeriodBounds(referenceDate: Date) {
  const now = new Date(referenceDate);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const weekStart = getWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { monthStart, monthEnd, weekStart, weekEnd };
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMetricTitle(metric: z.infer<typeof drilldownQuerySchema>['metric']) {
  switch (metric) {
    case 'weekly-hours':
      return 'Denna vecka';
    case 'monthly-hours':
      return 'Denna månad';
    case 'billable-hours':
      return 'Fakturerbara timmar';
    default:
      return 'Översikt';
  }
}

function getMetricDescription(metric: z.infer<typeof drilldownQuerySchema>['metric'], isAdminOrSupervisor: boolean) {
  switch (metric) {
    case 'weekly-hours':
      return isAdminOrSupervisor
        ? 'Alla rapporterade timmar för företaget den här veckan.'
        : 'Dina rapporterade timmar den här veckan.';
    case 'monthly-hours':
      return isAdminOrSupervisor
        ? 'Alla rapporterade timmar för företaget den här månaden.'
        : 'Dina rapporterade timmar den här månaden.';
    case 'billable-hours':
      return isAdminOrSupervisor
        ? 'Fakturerbara timmar för företaget den här månaden.'
        : 'Dina fakturerbara timmar den här månaden.';
    default:
      return '';
  }
}

function createDailyHoursMap(weekStart: Date, entries: { date: Date; hours: number }[]) {
  const dailyHours: Record<string, number> = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dailyHours[d.toISOString().split('T')[0]] = 0;
  }

  entries.forEach((entry) => {
    const dateKey = entry.date.toISOString().split('T')[0];
    dailyHours[dateKey] = (dailyHours[dateKey] || 0) + entry.hours;
  });

  return dailyHours;
}

function buildWeeklyUserSummary(weekStart: Date, entries: any[]) {
  const users = new Map<string, {
    userId: string;
    userName: string;
    totalHours: number;
    days: Array<{
      date: string;
      hours: number;
      projectCodes: string[];
      projectNames: string[];
    }>;
  }>();

  for (const entry of entries) {
    if (!users.has(entry.userId)) {
      users.set(entry.userId, {
        userId: entry.userId,
        userName: entry.user.name,
        totalHours: 0,
        days: Array.from({ length: 7 }, (_, index) => {
          const day = new Date(weekStart);
          day.setDate(day.getDate() + index);
          return {
            date: day.toISOString().split('T')[0],
            hours: 0,
            projectCodes: [],
            projectNames: [],
          };
        }),
      });
    }

    const summary = users.get(entry.userId)!;
    const entryDate = new Date(entry.date);
    entryDate.setHours(0, 0, 0, 0);
    const weekStartDate = new Date(weekStart);
    weekStartDate.setHours(0, 0, 0, 0);
    const dayIndex = Math.round((entryDate.getTime() - weekStartDate.getTime()) / 86400000);
    const safeDayIndex = Math.max(0, Math.min(6, dayIndex));
    const day = summary.days[safeDayIndex];
    const projectCode = entry.project?.code || 'INTERN';
    const projectName = entry.project?.name || 'Intern';

    summary.totalHours += entry.hours;
    day.hours += entry.hours;
    if (!day.projectCodes.includes(projectCode)) day.projectCodes.push(projectCode);
    if (!day.projectNames.includes(projectName)) day.projectNames.push(projectName);
  }

  return Array.from(users.values()).sort((a, b) => a.userName.localeCompare(b.userName, 'sv'));
}

async function getPendingApprovals(companyId: string, take?: number) {
  const locks = await prisma.weekLock.findMany({
    where: { status: 'SUBMITTED', user: { companyId } },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { submittedAt: 'asc' },
    ...(take ? { take } : {}),
  });

  return Promise.all(
    locks.map(async (lock) => {
      const weekEnd = new Date(lock.weekStartDate);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const [stats, billableStats] = await Promise.all([
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
      ]);

      return {
        ...lock,
        totalHours: stats._sum.hours || 0,
        billableHours: billableStats._sum.hours || 0,
        entryCount: stats._count,
      };
    })
  );
}

async function getMyPendingWeeks(userId: string, currentWeekStart: Date) {
  const draftEntries = await prisma.timeEntry.findMany({
    where: {
      userId,
      status: 'DRAFT',
      date: {
        gte: new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth() - 1, 1),
      },
    },
    select: { date: true },
  });

  const weeks = new Set<string>();
  draftEntries.forEach((entry) => {
    const weekStart = getWeekStart(entry.date);
    weeks.add(weekStart.toISOString());
  });

  return Array.from(weeks)
    .map((week) => new Date(week))
    .filter((week) => week < currentWeekStart)
    .sort((a, b) => b.getTime() - a.getTime());
}

async function backfillDraftWeeksToSubmitted(companyId: string) {
  const draftEntries = await prisma.timeEntry.findMany({
    where: {
      status: 'DRAFT',
      user: { companyId },
    },
    select: { id: true, userId: true, date: true },
  });

  if (!draftEntries.length) return;

  const weekPairs = new Map<string, { userId: string; weekStartDate: Date }>();
  const weekKeyByEntryId = new Map<string, string>();
  for (const entry of draftEntries) {
    const weekStartDate = getWeekStart(entry.date);
    const key = `${entry.userId}_${weekStartDate.toISOString()}`;
    weekKeyByEntryId.set(entry.id, key);
    weekPairs.set(key, {
      userId: entry.userId,
      weekStartDate,
    });
  }

  const existingLocks = await prisma.weekLock.findMany({
    where: {
      OR: Array.from(weekPairs.values()).map((pair) => ({
        userId: pair.userId,
        weekStartDate: pair.weekStartDate,
      })),
    },
    select: { userId: true, weekStartDate: true, status: true },
  });
  const protectedWeeks = new Set(
    existingLocks
      .filter((lock) => ['APPROVED', 'REJECTED'].includes(lock.status))
      .map((lock) => `${lock.userId}_${lock.weekStartDate.toISOString()}`)
  );
  const eligibleEntryIds = draftEntries
    .filter((entry) => !protectedWeeks.has(weekKeyByEntryId.get(entry.id) || ''))
    .map((entry) => entry.id);
  const eligibleWeekPairs = Array.from(weekPairs.entries())
    .filter(([key]) => !protectedWeeks.has(key))
    .map(([, pair]) => pair);

  if (!eligibleEntryIds.length) return;

  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.updateMany({
      where: {
        id: { in: eligibleEntryIds },
        status: 'DRAFT',
      },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    for (const pair of eligibleWeekPairs) {
      await tx.weekLock.upsert({
        where: {
          userId_weekStartDate: {
            userId: pair.userId,
            weekStartDate: pair.weekStartDate,
          },
        },
        update: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          reviewedAt: null,
          reviewerId: null,
          comment: null,
        },
        create: {
          userId: pair.userId,
          weekStartDate: pair.weekStartDate,
          status: 'SUBMITTED',
        },
      });
    }
  });
}

export default dashboardRoutes;
