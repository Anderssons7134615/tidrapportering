import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../index.js';

const requireAdminOrSupervisor = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const reportRoutes: FastifyPluginAsync = async (fastify) => {
  // Löneunderlag
  fastify.get('/salary', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { from, to, userId, format } = request.query as {
      from: string;
      to: string;
      userId?: string;
      format?: string;
    };

    if (!from || !to) {
      return reply.status(400).send({ error: 'from och to krävs' });
    }

    const where: any = {
      date: {
        gte: new Date(from),
        lte: new Date(to),
      },
      status: 'APPROVED', // Endast attesterade
    };

    if (userId) where.userId = userId;

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, hourlyCost: true } },
        project: { select: { id: true, name: true, code: true } },
        activity: { select: { id: true, name: true, code: true, category: true } },
      },
      orderBy: [{ user: { name: 'asc' } }, { date: 'asc' }],
    });

    // Gruppera per användare och aktivitetskod
    const grouped: Record<string, Record<string, { hours: number; entries: typeof entries }>> = {};

    entries.forEach((entry) => {
      const userName = entry.user.name;
      const activityCode = entry.activity.code;

      if (!grouped[userName]) grouped[userName] = {};
      if (!grouped[userName][activityCode]) {
        grouped[userName][activityCode] = { hours: 0, entries: [] };
      }

      grouped[userName][activityCode].hours += entry.hours;
      grouped[userName][activityCode].entries.push(entry);
    });

    // Om CSV-format
    if (format === 'csv') {
      const settings = await prisma.settings.findFirst();
      const delimiter = settings?.csvDelimiter || ';';

      // BOM för UTF-8
      const BOM = '\uFEFF';
      const headers = ['Person', 'Datum', 'Kod', 'Aktivitet', 'Timmar', 'Projekt', 'Kommentar'];
      const rows = entries.map((e) => [
        e.user.name,
        e.date.toISOString().split('T')[0],
        e.activity.code,
        e.activity.name,
        e.hours.toString().replace('.', ','),
        e.project?.code || 'Intern',
        (e.note || '').replace(/"/g, '""'),
      ]);

      const csv = BOM + headers.join(delimiter) + '\n' +
        rows.map((row) => row.map((cell) => `"${cell}"`).join(delimiter)).join('\n');

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'EXPORT',
          entityType: 'SalaryReport',
          newValue: JSON.stringify({ from, to, userId, rowCount: entries.length }),
        },
      });

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="loneunderlag_${from}_${to}.csv"`);
      return csv;
    }

    // JSON-format
    return {
      period: { from, to },
      entries,
      summary: grouped,
      totals: {
        totalHours: entries.reduce((sum, e) => sum + e.hours, 0),
        uniqueUsers: new Set(entries.map((e) => e.userId)).size,
      },
    };
  });

  // Fakturaunderlag
  fastify.get('/invoice', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { from, to, customerId, projectId, format } = request.query as {
      from: string;
      to: string;
      customerId?: string;
      projectId?: string;
      format?: string;
    };

    if (!from || !to) {
      return reply.status(400).send({ error: 'from och to krävs' });
    }

    const where: any = {
      date: {
        gte: new Date(from),
        lte: new Date(to),
      },
      billable: true, // Endast fakturerbar tid
      status: 'APPROVED', // Endast attesterad
      projectId: { not: null }, // Inte intern tid
    };

    if (projectId) {
      where.projectId = projectId;
    } else if (customerId) {
      where.project = { customerId };
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            defaultRate: true,
            customer: { select: { id: true, name: true, defaultRate: true } },
          },
        },
        activity: { select: { id: true, name: true, code: true, rateOverride: true } },
      },
      orderBy: [{ project: { code: 'asc' } }, { date: 'asc' }],
    });

    // Beräkna priser och belopp
    const entriesWithAmount = entries.map((entry) => {
      // Prisordning: Aktivitet > Projekt > Kund > 0
      const rate =
        entry.activity.rateOverride ||
        entry.project?.defaultRate ||
        entry.project?.customer?.defaultRate ||
        0;

      return {
        ...entry,
        rate,
        amount: entry.hours * rate,
      };
    });

    // Om CSV-format
    if (format === 'csv') {
      const settings = await prisma.settings.findFirst();
      const delimiter = settings?.csvDelimiter || ';';
      const vatRate = settings?.vatRate || 25;

      // BOM för UTF-8
      const BOM = '\uFEFF';
      const headers = [
        'Kund', 'Projekt', 'Projektkod', 'Datum', 'Aktivitet',
        'Person', 'Timmar', 'á-pris', 'Belopp', 'Kommentar'
      ];

      const rows = entriesWithAmount.map((e) => [
        e.project?.customer?.name || '',
        e.project?.name || '',
        e.project?.code || '',
        e.date.toISOString().split('T')[0],
        e.activity.name,
        e.user.name,
        e.hours.toString().replace('.', ','),
        e.rate.toString().replace('.', ','),
        e.amount.toString().replace('.', ','),
        (e.note || '').replace(/"/g, '""'),
      ]);

      // Lägg till summeringsrad
      const totalAmount = entriesWithAmount.reduce((sum, e) => sum + e.amount, 0);
      const totalHours = entriesWithAmount.reduce((sum, e) => sum + e.hours, 0);
      rows.push(['', '', '', '', '', 'SUMMA', totalHours.toString().replace('.', ','), '', totalAmount.toString().replace('.', ','), '']);
      rows.push(['', '', '', '', '', `Moms ${vatRate}%`, '', '', (totalAmount * vatRate / 100).toString().replace('.', ','), '']);
      rows.push(['', '', '', '', '', 'ATT BETALA', '', '', (totalAmount * (1 + vatRate / 100)).toString().replace('.', ','), '']);

      const csv = BOM + headers.join(delimiter) + '\n' +
        rows.map((row) => row.map((cell) => `"${cell}"`).join(delimiter)).join('\n');

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'EXPORT',
          entityType: 'InvoiceReport',
          newValue: JSON.stringify({ from, to, customerId, projectId, rowCount: entries.length }),
        },
      });

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="fakturaunderlag_${from}_${to}.csv"`);
      return csv;
    }

    // Gruppera per projekt
    const byProject: Record<string, {
      project: typeof entriesWithAmount[0]['project'];
      entries: typeof entriesWithAmount;
      totalHours: number;
      totalAmount: number;
    }> = {};

    entriesWithAmount.forEach((entry) => {
      const projectId = entry.projectId || 'INTERN';
      if (!byProject[projectId]) {
        byProject[projectId] = {
          project: entry.project,
          entries: [],
          totalHours: 0,
          totalAmount: 0,
        };
      }
      byProject[projectId].entries.push(entry);
      byProject[projectId].totalHours += entry.hours;
      byProject[projectId].totalAmount += entry.amount;
    });

    return {
      period: { from, to },
      entries: entriesWithAmount,
      byProject,
      totals: {
        totalHours: entriesWithAmount.reduce((sum, e) => sum + e.hours, 0),
        totalAmount: entriesWithAmount.reduce((sum, e) => sum + e.amount, 0),
      },
    };
  });

  // Projektrapport
  fastify.get('/project/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const where: any = { projectId: id };
    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: new Date(to) };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        activity: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
    });

    // Statistik
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const billableHours = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.hours, 0);

    // Per användare
    const byUser: Record<string, number> = {};
    entries.forEach((e) => {
      byUser[e.user.name] = (byUser[e.user.name] || 0) + e.hours;
    });

    // Per aktivitet
    const byActivity: Record<string, number> = {};
    entries.forEach((e) => {
      byActivity[e.activity.name] = (byActivity[e.activity.name] || 0) + e.hours;
    });

    return {
      project,
      entries,
      summary: {
        totalHours,
        billableHours,
        budgetHours: project.budgetHours,
        budgetRemaining: project.budgetHours ? project.budgetHours - totalHours : null,
        byUser,
        byActivity,
      },
    };
  });
};

export default reportRoutes;
