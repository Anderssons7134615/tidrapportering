import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import { getCompanyProjectMetrics, getRate } from '../lib/projectMetrics.js';
import { addUtcDays, dateOnlySchema, endOfUtcDay, getDateOnlyInTimeZone, getWeekEndUtc, getWeekStartUtc, startOfUtcDay, toDateKey } from '../lib/dateOnly.js';

const drilldownQuerySchema = z.object({
  metric: z.enum(['weekly-hours', 'monthly-hours', 'pending-approval']),
  date: dateOnlySchema.optional(),
});

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (request.user.role === 'ACCOUNTANT') {
        return reply.status(403).send({ error: 'Lön och ekonomi använder rapporter med attesterad tid' });
      }
      const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(request.user.role);
      const period = getPeriodBounds(getDateOnlyInTimeZone());
      const userFilter = getUserFilter(request.user.id, request.user.companyId, isAdminOrSupervisor);

      const [monthStats, billableMonthStats, weekStats, billableWeekEntries, pendingApprovals, myPendingWeeks, recentEntries, weeklyEntries, projectMetrics] =
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
          prisma.timeEntry.findMany({
            where: {
              ...userFilter,
              date: { gte: period.weekStart, lte: period.weekEnd },
              billable: true,
            },
            include: {
              project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
              activity: { select: { rateOverride: true } },
            },
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
          isAdminOrSupervisor ? getCompanyProjectMetrics(prisma, request.user.companyId) : Promise.resolve([]),
        ]);

      const dailyHours = createDailyHoursMap(period.weekStart, weeklyEntries);
      const billableWeekValue = billableWeekEntries.reduce((sum, entry) => sum + entry.hours * getRate(entry), 0);
      const riskProjects = projectMetrics.filter((project: any) => project.metrics.status.code === 'RISK');
      const runningProjects = projectMetrics.filter((project: any) => project.active && !project.budgetHours);
      const actionItems = [
        ...(pendingApprovals.length
          ? [{
              id: 'pending-approvals',
              title: `${pendingApprovals.length} veckor väntar attest`,
              description: 'Granska och godkänn rapporterad tid.',
              tone: 'yellow',
              to: '/approval',
            }]
          : []),
        ...(riskProjects.length
          ? [{
              id: 'risk-projects',
              title: `${riskProjects.length} projekt är i risk`,
              description: 'Kontrollera budget och timmar.',
              tone: 'red',
              to: '/projects?risk=true',
            }]
          : []),
      ];

      return {
        summary: {
          monthlyHours: monthStats._sum.hours || 0,
          monthlyBillableHours: billableMonthStats._sum.hours || 0,
          weeklyHours: weekStats._sum.hours || 0,
          weeklyBillableHours: billableWeekEntries.reduce((sum, entry) => sum + entry.hours, 0),
          weeklyBillableValue: billableWeekValue,
          pendingApprovalCount: pendingApprovals.length,
          riskProjectCount: riskProjects.length,
          projectsWithoutBudgetCount: runningProjects.length,
        },
        pendingApprovals,
        actionItems,
        riskProjects: riskProjects.slice(0, 6),
        projectsWithoutBudget: runningProjects.slice(0, 6),
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
      const referenceDate = date || getDateOnlyInTimeZone();

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
      const todayStart = getDateOnlyInTimeZone();
      const todayEnd = endOfUtcDay(todayStart);
      const weekStart = getWeekStartUtc(todayStart);
      const weekEnd = getWeekEndUtc(weekStart);

      const [todayStats, weekStats] = await Promise.all([
        prisma.timeEntry.aggregate({
          where: {
            userId: request.user.id,
            date: { gte: todayStart, lte: todayEnd },
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
  const now = startOfUtcDay(referenceDate);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = endOfUtcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const weekStart = getWeekStartUtc(now);
  const weekEnd = getWeekEndUtc(weekStart);

  return { monthStart, monthEnd, weekStart, weekEnd };
}

function getMetricTitle(metric: z.infer<typeof drilldownQuerySchema>['metric']) {
  switch (metric) {
    case 'weekly-hours':
      return 'Denna vecka';
    case 'monthly-hours':
      return 'Denna månad';
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
    default:
      return '';
  }
}

function createDailyHoursMap(weekStart: Date, entries: { date: Date; hours: number }[]) {
  const dailyHours: Record<string, number> = {};

  for (let i = 0; i < 7; i++) {
    const d = addUtcDays(weekStart, i);
    dailyHours[toDateKey(d)] = 0;
  }

  entries.forEach((entry) => {
    const dateKey = toDateKey(entry.date);
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
          const day = addUtcDays(weekStart, index);
          return {
            date: toDateKey(day),
            hours: 0,
            projectCodes: [],
            projectNames: [],
          };
        }),
      });
    }

    const summary = users.get(entry.userId)!;
    const entryDate = startOfUtcDay(entry.date);
    const weekStartDate = startOfUtcDay(weekStart);
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
      const weekEnd = getWeekEndUtc(lock.weekStartDate);

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
        gte: new Date(Date.UTC(currentWeekStart.getUTCFullYear(), currentWeekStart.getUTCMonth() - 1, 1)),
      },
    },
    select: { date: true },
  });

  const weeks = new Set<string>();
  draftEntries.forEach((entry) => {
    const weekStart = getWeekStartUtc(entry.date);
    weeks.add(weekStart.toISOString());
  });

  return Array.from(weeks)
    .map((week) => new Date(week))
    .filter((week) => week < currentWeekStart)
    .sort((a, b) => b.getTime() - a.getTime());
}

export default dashboardRoutes;
