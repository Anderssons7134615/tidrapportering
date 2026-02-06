import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../index.js';

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // Dashboard overview
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(request.user.role);

    // Nuvarande månad
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Denna vecka (måndag-söndag)
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Basfilter för tidrader (alltid filtrera på företag)
    const userFilter = isAdminOrSupervisor
      ? { user: { companyId: request.user.companyId } }
      : { userId: request.user.id };

    // Månadens timmar
    const monthStats = await prisma.timeEntry.aggregate({
      where: {
        ...userFilter,
        date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { hours: true },
    });

    const billableMonthStats = await prisma.timeEntry.aggregate({
      where: {
        ...userFilter,
        date: { gte: monthStart, lte: monthEnd },
        billable: true,
      },
      _sum: { hours: true },
    });

    // Veckans timmar
    const weekStats = await prisma.timeEntry.aggregate({
      where: {
        ...userFilter,
        date: { gte: weekStart, lte: weekEnd },
      },
      _sum: { hours: true },
    });

    // Pågående projekt med timmar och budget
    const ongoingProjects = await prisma.project.findMany({
      where: { status: 'ONGOING', active: true, companyId: request.user.companyId },
      include: {
        customer: { select: { name: true } },
      },
    });

    const projectsWithStats = await Promise.all(
      ongoingProjects.map(async (project) => {
        const stats = await prisma.timeEntry.aggregate({
          where: { projectId: project.id },
          _sum: { hours: true },
        });

        const monthlyStats = await prisma.timeEntry.aggregate({
          where: {
            projectId: project.id,
            date: { gte: monthStart, lte: monthEnd },
          },
          _sum: { hours: true },
        });

        return {
          id: project.id,
          name: project.name,
          code: project.code,
          customerName: project.customer?.name || 'Intern',
          budgetHours: project.budgetHours,
          totalHours: stats._sum.hours || 0,
          monthlyHours: monthlyStats._sum.hours || 0,
          budgetUsedPercent: project.budgetHours
            ? Math.round(((stats._sum.hours || 0) / project.budgetHours) * 100)
            : null,
        };
      })
    );

    // Ej attesterade veckor
    let pendingApprovals: any[] = [];
    if (isAdminOrSupervisor) {
      pendingApprovals = await prisma.weekLock.findMany({
        where: { status: 'SUBMITTED', user: { companyId: request.user.companyId } },
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: 'asc' },
        take: 10,
      });
    }

    // Mina ej inskickade veckor
    const myPendingWeeks: Date[] = [];
    if (request.user.role === 'EMPLOYEE') {
      // Hitta veckor med draft-tidrader
      const draftEntries = await prisma.timeEntry.findMany({
        where: {
          userId: request.user.id,
          status: 'DRAFT',
          date: {
            gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), // Senaste 2 månaderna
          },
        },
        select: { date: true },
      });

      // Gruppera per vecka
      const weeks = new Set<string>();
      draftEntries.forEach((entry) => {
        const weekStart = getWeekStart(entry.date);
        weeks.add(weekStart.toISOString());
      });

      weeks.forEach((w) => {
        if (new Date(w) < weekStart) {
          // Endast tidigare veckor
          myPendingWeeks.push(new Date(w));
        }
      });
    }

    // Senaste aktivitet
    const recentEntries = await prisma.timeEntry.findMany({
      where: userFilter,
      include: {
        project: { select: { name: true, code: true } },
        activity: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Timmar per dag denna vecka
    const weeklyEntries = await prisma.timeEntry.findMany({
      where: {
        ...userFilter,
        date: { gte: weekStart, lte: weekEnd },
      },
      select: { date: true, hours: true },
    });

    const dailyHours: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      dailyHours[d.toISOString().split('T')[0]] = 0;
    }
    weeklyEntries.forEach((entry) => {
      const dateKey = entry.date.toISOString().split('T')[0];
      dailyHours[dateKey] = (dailyHours[dateKey] || 0) + entry.hours;
    });

    return {
      summary: {
        monthlyHours: monthStats._sum.hours || 0,
        monthlyBillableHours: billableMonthStats._sum.hours || 0,
        weeklyHours: weekStats._sum.hours || 0,
        pendingApprovalCount: pendingApprovals.length,
      },
      projects: projectsWithStats.sort((a, b) =>
        (b.budgetUsedPercent || 0) - (a.budgetUsedPercent || 0)
      ),
      pendingApprovals,
      myPendingWeeks: myPendingWeeks.sort((a, b) => b.getTime() - a.getTime()),
      recentEntries,
      dailyHours,
      period: {
        monthStart,
        monthEnd,
        weekStart,
        weekEnd,
      },
    };
  });

  // Quick stats for mobile header
  fastify.get('/quick-stats', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const now = new Date();

    // Idag
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayStats = await prisma.timeEntry.aggregate({
      where: {
        userId: request.user.id,
        date: { gte: todayStart, lt: todayEnd },
      },
      _sum: { hours: true },
    });

    // Denna vecka
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStats = await prisma.timeEntry.aggregate({
      where: {
        userId: request.user.id,
        date: { gte: weekStart, lte: weekEnd },
      },
      _sum: { hours: true },
    });

    return {
      todayHours: todayStats._sum.hours || 0,
      weekHours: weekStats._sum.hours || 0,
    };
  });
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default dashboardRoutes;
