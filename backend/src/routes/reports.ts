import { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { prisma } from '../index.js';
import { requireRoles } from '../lib/authorization.js';
import { createCsvRow } from '../lib/csv.js';
import { endOfUtcDay, getWeekStartUtc, parseDateOnly } from '../lib/dateOnly.js';

const requireReportViewer = requireRoles(['ADMIN', 'SUPERVISOR', 'ACCOUNTANT']);

const reportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/time-backup.xlsx', {
    preHandler: [requireReportViewer],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };

    const range = parseReportRange(from, to);
    if (!range) return reply.status(400).send({ error: 'Ange en giltig period som YYYY-MM-DD där from inte är efter to' });

    const entries = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: range.from,
          lte: range.to,
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
      const weekStart = getWeekStartUtc(entry.date);
      const key = weekStart.toISOString();
      if (!entriesByWeek.has(key)) entriesByWeek.set(key, []);
      entriesByWeek.get(key)!.push(entry);
    }

    if (entriesByWeek.size === 0) {
      addBackupWorksheet(workbook, `Tom ${from}`, []);
    } else {
      for (const [weekKey, weekEntries] of Array.from(entriesByWeek.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        const weekStart = new Date(weekKey);
        addBackupWorksheet(workbook, `v${getISOWeek(weekStart)} ${weekStart.getUTCFullYear()}`, weekEntries);
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

    const range = parseReportRange(from, to);
    if (!range) return reply.status(400).send({ error: 'Ange en giltig period som YYYY-MM-DD där from inte är efter to' });

    const entries = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: range.from,
          lte: range.to,
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
    const byActivity = new Map<string, { code: string; activity: string; activityCode: string; activityName: string; hours: number }>();

    for (const entry of entries) {
      const userSummary = byUser.get(entry.userId) || {
        userName: entry.user.name,
        email: entry.user.email,
        activityCode: entry.activity.code,
        activityName: entry.activity.name,
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
        activityCode: entry.activity.code,
        activityName: entry.activity.name,
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
        { header: 'Arbetsmoment', key: 'activity', width: 24 },
        { header: 'Intern kod', key: 'code', width: 12 },
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

      const activitySheet = workbook.addWorksheet('Summering arbetsmoment');
      activitySheet.columns = [
        { header: 'Arbetsmoment', key: 'activity', width: 28 },
        { header: 'Intern kod', key: 'code', width: 12 },
        { header: 'Timmar', key: 'hours', width: 12 },
      ];
      styleHeader(activitySheet);
      for (const item of Array.from(byActivity.values()).sort((a, b) => a.activity.localeCompare(b.activity, 'sv'))) {
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

    const range = parseReportRange(from, to);
    if (!range) return reply.status(400).send({ error: 'Ange en giltig period som YYYY-MM-DD där from inte är efter to' });

    const where: any = {
      date: {
        gte: range.from,
        lte: range.to,
      },
      status: 'APPROVED', // Endast attesterade
      user: { companyId: request.user.companyId },
    };

    if (userId) where.userId = userId;

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        activity: { select: { id: true, name: true, code: true, category: true } },
      },
      orderBy: [{ user: { name: 'asc' } }, { date: 'asc' }],
    });

    // Gruppera per användare och aktivitetskod
    const grouped: Record<string, Record<string, { hours: number; activityName: string; activityCode: string; category: string; entries: typeof entries }>> = {};

    entries.forEach((entry) => {
      const userName = entry.user.name;
      const activityCode = entry.activity.code;

      if (!grouped[userName]) grouped[userName] = {};
      if (!grouped[userName][activityCode]) {
        grouped[userName][activityCode] = {
          hours: 0,
          activityName: entry.activity.name,
          activityCode: entry.activity.code,
          category: entry.activity.category,
          entries: [],
        };
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
        { header: 'Arbetsmoment', key: 'activity', width: 24 },
        { header: 'Intern kod', key: 'code', width: 12 },
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
      const headers = ['Person', 'Datum', 'Arbetsmoment', 'Intern kod', 'Timmar', 'Projekt', 'Kommentar'];
      const rows = entries.map((e) => [
        e.user.name,
        e.date.toISOString().split('T')[0],
        e.activity.name,
        e.activity.code,
        e.hours.toString().replace('.', ','),
        e.project?.code || 'Intern',
        e.note || '',
      ]);

      const csv = BOM + createCsvRow(headers, delimiter) + '\n' +
        rows.map((row) => createCsvRow(row, delimiter)).join('\n');

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
    const summaryRows = Object.entries(grouped).map(([userName, activities]) => ({
      userName,
      activities: Object.values(activities).sort((a, b) => a.activityName.localeCompare(b.activityName, 'sv')),
    }));

    return {
      period: { from, to },
      entries,
      summary: grouped,
      summaryRows,
      totals: {
        totalHours: entries.reduce((sum, e) => sum + e.hours, 0),
        uniqueUsers: new Set(entries.map((e) => e.userId)).size,
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
    const parsedFrom = from ? parseDateOnly(from) : null;
    const parsedTo = to ? parseDateOnly(to) : null;
    if ((from && !parsedFrom) || (to && !parsedTo) || (parsedFrom && parsedTo && parsedFrom > parsedTo)) {
      return reply.status(400).send({ error: 'Ange giltiga datum som YYYY-MM-DD där from inte är efter to' });
    }
    if (parsedFrom) where.date = { ...where.date, gte: parsedFrom };
    if (parsedTo) where.date = { ...where.date, lte: endOfUtcDay(parsedTo) };

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
      project: request.user.role === 'EMPLOYEE'
        ? { ...project, customer: project.customer ? { id: project.customer.id, name: project.customer.name } : null }
        : project,
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

function parseReportRange(from?: string, to?: string) {
  if (!from || !to) return null;
  const parsedFrom = parseDateOnly(from);
  const parsedTo = parseDateOnly(to);
  if (!parsedFrom || !parsedTo || parsedFrom > parsedTo) return null;
  return { from: parsedFrom, to: endOfUtcDay(parsedTo) };
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
      status: entry.status,
      note: entry.note || '',
    });
  }

  worksheet.getColumn('hours').numFmt = '0.00';
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(entries.length + 1, 1), column: 8 },
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
