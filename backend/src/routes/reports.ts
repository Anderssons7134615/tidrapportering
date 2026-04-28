import { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { prisma } from '../index.js';

const requireReportViewer = async (request: any, reply: any) => {
  await request.jwtVerify();
  const user = await prisma.user.findUnique({
    where: { id: request.user.id },
    select: { active: true, companyId: true },
  });
  if (!user || !user.active || user.companyId !== request.user.companyId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (!['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const reportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/time-backup.xlsx', {
    preHandler: [requireReportViewer],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };

    if (!from || !to) {
      return reply.status(400).send({ error: 'from och to krävs' });
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: new Date(from),
          lte: getDayEnd(to),
        },
        status: 'APPROVED',
        user: { companyId: request.user.companyId },
      },
      include: {
        user: { select: { name: true } },
        project: { select: { name: true, code: true } },
        activity: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { user: { name: 'asc' } }, { createdAt: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TidApp';
    workbook.created = new Date();

    const entriesByWeek = new Map<string, typeof entries>();
    for (const entry of entries) {
      const weekStart = getWeekStart(entry.date);
      const key = weekStart.toISOString();
      if (!entriesByWeek.has(key)) entriesByWeek.set(key, []);
      entriesByWeek.get(key)!.push(entry);
    }

    if (entriesByWeek.size === 0) {
      addBackupWorksheet(workbook, `Tom ${from}`, []);
    } else {
      for (const [weekKey, weekEntries] of Array.from(entriesByWeek.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        const weekStart = new Date(weekKey);
        addBackupWorksheet(workbook, `v${getISOWeek(weekStart)} ${weekStart.getFullYear()}`, weekEntries);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'EXPORT',
        entityType: 'TimeBackupExcel',
        newValue: JSON.stringify({ from, to, rowCount: entries.length }),
      },
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="tidbackup_${from}_${to}.xlsx"`);
    return reply.send(Buffer.from(buffer));
  });

  fastify.get('/accountant', {
    preHandler: [requireReportViewer],
  }, async (request, reply) => {
    const { from, to, userId, format } = request.query as {
      from?: string;
      to?: string;
      userId?: string;
      format?: string;
    };

    if (!from || !to) {
      return reply.status(400).send({ error: 'from och to krävs' });
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: new Date(from),
          lte: getDayEnd(to),
        },
        status: 'APPROVED',
        ...(userId ? { userId } : {}),
        user: { companyId: request.user.companyId },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            customer: { select: { id: true, name: true } },
          },
        },
        activity: { select: { id: true, name: true, code: true, category: true } },
      },
      orderBy: [{ user: { name: 'asc' } }, { date: 'asc' }, { createdAt: 'asc' }],
    });

    const byUser = new Map<string, { userName: string; email: string; hours: number; days: Set<string> }>();
    const byActivity = new Map<string, { code: string; activity: string; hours: number }>();

    for (const entry of entries) {
      const userSummary = byUser.get(entry.userId) || {
        userName: entry.user.name,
        email: entry.user.email,
        hours: 0,
        days: new Set<string>(),
      };
      userSummary.hours += entry.hours;
      userSummary.days.add(entry.date.toISOString().split('T')[0]);
      byUser.set(entry.userId, userSummary);

      const activityKey = entry.activity.code || entry.activity.id;
      const activitySummary = byActivity.get(activityKey) || {
        code: entry.activity.code,
        activity: entry.activity.name,
        hours: 0,
      };
      activitySummary.hours += entry.hours;
      byActivity.set(activityKey, activitySummary);
    }

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TidApp';
      workbook.created = new Date();

      const importSheet = workbook.addWorksheet('Import');
      importSheet.columns = [
        { header: 'Anställd', key: 'employee', width: 26 },
        { header: 'E-post', key: 'email', width: 30 },
        { header: 'Lönekod', key: 'code', width: 12 },
        { header: 'Aktivitet', key: 'activity', width: 24 },
        { header: 'Datum', key: 'date', width: 14 },
        { header: 'Timmar', key: 'hours', width: 12 },
        { header: 'Projekt', key: 'project', width: 28 },
        { header: 'Kund', key: 'customer', width: 24 },
        { header: 'Kommentar', key: 'note', width: 40 },
      ];
      styleHeader(importSheet);

      for (const entry of entries) {
        importSheet.addRow({
          employee: entry.user.name,
          email: entry.user.email,
          code: entry.activity.code,
          activity: entry.activity.name,
          date: entry.date.toISOString().split('T')[0],
          hours: entry.hours,
          project: entry.project ? `${entry.project.code} ${entry.project.name}` : 'Intern',
          customer: entry.project?.customer?.name || '',
          note: entry.note || '',
        });
      }
      importSheet.getColumn('hours').numFmt = '0.00';
      importSheet.views = [{ state: 'frozen', ySplit: 1 }];
      importSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(entries.length + 1, 1), column: 9 } };

      const userSheet = workbook.addWorksheet('Summering person');
      userSheet.columns = [
        { header: 'Anställd', key: 'employee', width: 26 },
        { header: 'E-post', key: 'email', width: 30 },
        { header: 'Timmar', key: 'hours', width: 12 },
        { header: 'Rapporterade dagar', key: 'days', width: 18 },
      ];
      styleHeader(userSheet);
      for (const item of Array.from(byUser.values()).sort((a, b) => a.userName.localeCompare(b.userName, 'sv'))) {
        userSheet.addRow({ employee: item.userName, email: item.email, hours: item.hours, days: item.days.size });
      }
      userSheet.getColumn('hours').numFmt = '0.00';

      const activitySheet = workbook.addWorksheet('Summering lönekod');
      activitySheet.columns = [
        { header: 'Lönekod', key: 'code', width: 12 },
        { header: 'Aktivitet', key: 'activity', width: 28 },
        { header: 'Timmar', key: 'hours', width: 12 },
      ];
      styleHeader(activitySheet);
      for (const item of Array.from(byActivity.values()).sort((a, b) => a.code.localeCompare(b.code, 'sv'))) {
        activitySheet.addRow({ code: item.code, activity: item.activity, hours: item.hours });
      }
      activitySheet.getColumn('hours').numFmt = '0.00';

      const infoSheet = workbook.addWorksheet('Info');
      infoSheet.columns = [{ header: 'Fält', key: 'field', width: 24 }, { header: 'Värde', key: 'value', width: 42 }];
      infoSheet.addRows([
        { field: 'Period', value: `${from} till ${to}` },
        { field: 'Periodregel', value: 'Från den 21:a till den 20:e varje månad' },
        { field: 'Status', value: 'Endast attesterade tidrader' },
        { field: 'Totala timmar', value: entries.reduce((sum, entry) => sum + entry.hours, 0) },
      ]);
      styleHeader(infoSheet);

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'EXPORT',
          entityType: 'AccountantPayrollExcel',
          newValue: JSON.stringify({ from, to, userId, rowCount: entries.length }),
        },
      });

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename="revisorsunderlag_${from}_${to}.xlsx"`);
      return reply.send(Buffer.from(buffer));
    }

    return {
      period: { from, to, cutoffDay: 20, startDay: 21 },
      entries,
      totals: {
        totalHours: entries.reduce((sum, entry) => sum + entry.hours, 0),
        uniqueUsers: byUser.size,
        activityCount: byActivity.size,
      },
      byUser: Array.from(byUser.values()).map((item) => ({ ...item, days: item.days.size })),
      byActivity: Array.from(byActivity.values()),
    };
  });

  // Löneunderlag
  fastify.get('/salary', {
    preHandler: [requireReportViewer],
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
        lte: getDayEnd(to),
      },
      status: 'APPROVED', // Endast attesterade
      user: { companyId: request.user.companyId },
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

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TidApp';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('Löneunderlag');
      worksheet.columns = [
        { header: 'Person', key: 'person', width: 24 },
        { header: 'Datum', key: 'date', width: 14 },
        { header: 'Kod', key: 'code', width: 12 },
        { header: 'Aktivitet', key: 'activity', width: 24 },
        { header: 'Timmar', key: 'hours', width: 12 },
        { header: 'Projekt', key: 'project', width: 18 },
        { header: 'Kommentar', key: 'note', width: 36 },
      ];
      styleHeader(worksheet);
      for (const entry of entries) {
        worksheet.addRow({
          person: entry.user.name,
          date: entry.date.toISOString().split('T')[0],
          code: entry.activity.code,
          activity: entry.activity.name,
          hours: entry.hours,
          project: entry.project?.code || 'Intern',
          note: entry.note || '',
        });
      }
      worksheet.getColumn('hours').numFmt = '0.00';
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(entries.length + 1, 1), column: 7 } };

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'EXPORT',
          entityType: 'SalaryReportExcel',
          newValue: JSON.stringify({ from, to, userId, rowCount: entries.length }),
        },
      });

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename="loneunderlag_${from}_${to}.xlsx"`);
      return reply.send(Buffer.from(buffer));
    }

    // Om CSV-format
    if (format === 'csv') {
      const settings = await prisma.settings.findUnique({ where: { companyId: request.user.companyId } });
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
    preHandler: [requireReportViewer],
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
        lte: getDayEnd(to),
      },
      billable: true, // Endast fakturerbar tid
      status: 'APPROVED', // Endast attesterad
      projectId: { not: null }, // Inte intern tid
      user: { companyId: request.user.companyId },
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

    if (format === 'xlsx') {
      const settings = await prisma.settings.findUnique({ where: { companyId: request.user.companyId } });
      const vatRate = settings?.vatRate || 25;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TidApp';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('Fakturaunderlag');
      worksheet.columns = [
        { header: 'Kund', key: 'customer', width: 28 },
        { header: 'Projekt', key: 'project', width: 28 },
        { header: 'Projektkod', key: 'code', width: 14 },
        { header: 'Datum', key: 'date', width: 14 },
        { header: 'Aktivitet', key: 'activity', width: 24 },
        { header: 'Person', key: 'person', width: 22 },
        { header: 'Timmar', key: 'hours', width: 12 },
        { header: 'A-pris', key: 'rate', width: 12 },
        { header: 'Belopp', key: 'amount', width: 14 },
        { header: 'Kommentar', key: 'note', width: 36 },
      ];
      styleHeader(worksheet);
      for (const entry of entriesWithAmount) {
        worksheet.addRow({
          customer: entry.project?.customer?.name || '',
          project: entry.project?.name || '',
          code: entry.project?.code || '',
          date: entry.date.toISOString().split('T')[0],
          activity: entry.activity.name,
          person: entry.user.name,
          hours: entry.hours,
          rate: entry.rate,
          amount: entry.amount,
          note: entry.note || '',
        });
      }
      const totalAmount = entriesWithAmount.reduce((sum, entry) => sum + entry.amount, 0);
      const totalHours = entriesWithAmount.reduce((sum, entry) => sum + entry.hours, 0);
      worksheet.addRow({ person: 'SUMMA', hours: totalHours, amount: totalAmount });
      worksheet.addRow({ person: `Moms ${vatRate}%`, amount: totalAmount * vatRate / 100 });
      worksheet.addRow({ person: 'ATT BETALA', amount: totalAmount * (1 + vatRate / 100) });
      worksheet.getColumn('hours').numFmt = '0.00';
      worksheet.getColumn('rate').numFmt = '#,##0.00';
      worksheet.getColumn('amount').numFmt = '#,##0.00';
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(entriesWithAmount.length + 1, 1), column: 10 } };

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'EXPORT',
          entityType: 'InvoiceReportExcel',
          newValue: JSON.stringify({ from, to, customerId, projectId, rowCount: entries.length }),
        },
      });

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename="fakturaunderlag_${from}_${to}.xlsx"`);
      return reply.send(Buffer.from(buffer));
    }

    // Om CSV-format
    if (format === 'csv') {
      const settings = await prisma.settings.findUnique({ where: { companyId: request.user.companyId } });
      const delimiter = settings?.csvDelimiter || ';';
      const vatRate = settings?.vatRate || 25;

      // BOM för UTF-8
      const BOM = '\uFEFF';
      const headers = [
        'Kund', 'Projekt', 'Projektkod', 'Datum', 'Aktivitet',
        'Person', 'Timmar', 'A-pris', 'Belopp', 'Kommentar'
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

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    if (request.user.role === 'EMPLOYEE' && !project.employeeCanSeeResults) {
      return reply.status(403).send({ error: 'Projektresultat är inte synliga för anställda i detta projekt' });
    }

    const where: any = { projectId: id };
    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: getDayEnd(to) };

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

function getDayEnd(date: string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function addBackupWorksheet(workbook: ExcelJS.Workbook, name: string, entries: any[]) {
  const worksheet = workbook.addWorksheet(name.slice(0, 31));
  worksheet.columns = [
    { header: 'Datum', key: 'date', width: 14 },
    { header: 'Anställd', key: 'user', width: 24 },
    { header: 'Projektkod', key: 'projectCode', width: 14 },
    { header: 'Projekt', key: 'project', width: 28 },
    { header: 'Aktivitet', key: 'activity', width: 24 },
    { header: 'Timmar', key: 'hours', width: 12 },
    { header: 'Fakturerbar', key: 'billable', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Notering', key: 'note', width: 36 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  for (const entry of entries) {
    worksheet.addRow({
      date: entry.date.toISOString().split('T')[0],
      user: entry.user.name,
      projectCode: entry.project?.code || 'INTERN',
      project: entry.project?.name || 'Intern',
      activity: entry.activity?.name || '',
      hours: entry.hours,
      billable: entry.billable ? 'Ja' : 'Nej',
      status: entry.status,
      note: entry.note || '',
    });
  }

  worksheet.getColumn('hours').numFmt = '0.00';
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(entries.length + 1, 1), column: 9 },
  };
}

function styleHeader(worksheet: ExcelJS.Worksheet) {
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
}

export default reportRoutes;
