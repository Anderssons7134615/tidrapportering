import { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../index.js';
import { getProjectMetrics, getRate } from '../lib/projectMetrics.js';
import { enqueueMaterialChanged, enqueueProjectChanged, enqueueTimeEntryChanged } from '../lib/obsidianSync.js';

const projectSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  code: z.string().min(1),
  site: z.string().optional().nullable(),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED']).optional(),
  budgetHours: z.number().optional().nullable(),
  fixedPrice: z.number().optional().nullable(),
  billingModel: z.enum(['HOURLY', 'FIXED']).optional(),
  defaultRate: z.number().optional().nullable(),
  employeeCanSeeResults: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const materialArticleSchema = z.object({
  name: z.string().min(2),
  articleNumber: z.string().trim().optional().nullable(),
  category: z.enum(['Rörskål', 'Lamellmatta', 'Plåt', 'Tejp', 'Brandtätning', 'Skruv/nit', 'Övrigt']).optional(),
  unit: z.string().min(1).max(20).optional(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  defaultUnitPrice: z.number().nonnegative().optional().nullable(),
  markupPercent: z.number().nonnegative().optional().nullable(),
});

const projectMaterialSchema = z.object({
  articleId: z.string().uuid(),
  quantity: z.number().positive(),
  date: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

const projectMaterialPatchSchema = z.object({
  articleId: z.string().uuid().optional(),
  quantity: z.number().positive().optional(),
  date: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional().nullable(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  unitPrice: z.number().nonnegative().optional().nullable(),
  invoiceStatus: z.enum(['UNINVOICED', 'INVOICED']).optional(),
  invoiceReference: z.string().trim().max(100).optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Inga ändringar skickades' });


const requireAdminOrSupervisor = async (request: any, reply: any) => {
  await request.jwtVerify();
  const user = await prisma.user.findUnique({ where: { id: request.user.id }, select: { active: true, companyId: true } });
  if (!user || !user.active || user.companyId !== request.user.companyId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const shouldHideResultsForEmployee = (role: string, project: { employeeCanSeeResults: boolean }) => {
  return role === 'EMPLOYEE' && !project.employeeCanSeeResults;
};

const canManageMaterials = (role: string) => ['ADMIN', 'SUPERVISOR'].includes(role);
const canViewFinancials = (role: string, project: { employeeCanSeeResults: boolean }) => {
  return ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'].includes(role) || !shouldHideResultsForEmployee(role, project);
};

function sanitizeProjectForRole<T extends Record<string, any>>(project: T, canView: boolean): T {
  if (canView) return project;
  const {
    fixedPrice: _fixedPrice,
    defaultRate: _defaultRate,
    billingModel: _billingModel,
    budgetHours: _budgetHours,
    ...safeProject
  } = project;
  return {
    ...safeProject,
    fixedPrice: null,
    defaultRate: null,
    billingModel: null,
    budgetHours: null,
  } as unknown as T;
}

function mapMaterialForRole(item: any, canView: boolean) {
  const lineTotal = item.unitPrice != null ? item.quantity * item.unitPrice : null;
  return {
    ...item,
    purchasePrice: canView ? item.purchasePrice : null,
    unitPrice: canView ? item.unitPrice : null,
    lineTotal: canView ? lineTotal : null,
  };
}

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRequiredNumber(value: unknown): number | null {
  const parsed = parseOptionalNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function normalizeHeader(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function parseImportDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const text = normalizeText(value);
  if (!text) return new Date();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseActive(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  return !['nej', 'no', 'false', '0', 'inaktiv'].includes(text);
}

function getDayEnd(date: string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function styleMaterialWorksheet(worksheet: ExcelJS.Worksheet) {
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(worksheet.rowCount, 1), column: worksheet.columnCount },
  };
}

async function sendMaterialWorkbook(reply: any, workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(Buffer.from(buffer));
}

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  // List projects (same company)
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { status, customerId, active } = request.query as {
      status?: string;
      customerId?: string;
      active?: string;
    };

    const where: any = { companyId: request.user.companyId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (active !== undefined) where.active = active === 'true';

    const projects = await prisma.project.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true },
        },
        _count: {
          select: { timeEntries: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    // Beräkna totala timmar per projekt
    const projectsWithHours = await Promise.all(
      projects.map(async (project) => {
        const metrics = await getProjectMetrics(prisma, project);
        const canView = canViewFinancials(request.user.role, project);

        return {
          ...sanitizeProjectForRole(project, canView),
          resultsVisibleToCurrentUser: canView,
          totalHours: canView ? metrics.totalHours : null,
          billableHours: canView ? metrics.billableHours : null,
          metrics: canView ? metrics : null,
        };
      })
    );

    return projectsWithHours;
  });

  fastify.get('/materials/articles', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { active } = request.query as { active?: string };

    const where: any = { companyId: request.user.companyId };
    if (active !== undefined) {
      where.active = active === 'true';
    }

    const articles = await prisma.materialArticle.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    if (canManageMaterials(request.user.role) || request.user.role === 'ACCOUNTANT') {
      return articles;
    }

    return articles.map(({ purchasePrice: _purchasePrice, defaultUnitPrice: _defaultUnitPrice, markupPercent: _markupPercent, ...article }) => article);
  });

  fastify.get('/materials/articles.xlsx', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const articles = await prisma.materialArticle.findMany({
      where: { companyId: request.user.companyId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TidApp';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Materialregister');
    worksheet.columns = [
      { header: 'Artikel', key: 'name', width: 28 },
      { header: 'Artikelnummer', key: 'articleNumber', width: 18 },
      { header: 'Kategori', key: 'category', width: 18 },
      { header: 'Enhet', key: 'unit', width: 12 },
      { header: 'Inköpspris', key: 'purchasePrice', width: 14 },
      { header: 'Försäljningspris', key: 'defaultUnitPrice', width: 16 },
      { header: 'Påslag %', key: 'markupPercent', width: 12 },
      { header: 'Aktiv', key: 'active', width: 10 },
    ];

    for (const article of articles) {
      worksheet.addRow({
        name: article.name,
        articleNumber: article.articleNumber || '',
        category: article.category || 'Övrigt',
        unit: article.unit,
        purchasePrice: article.purchasePrice ?? '',
        defaultUnitPrice: article.defaultUnitPrice ?? '',
        markupPercent: article.markupPercent ?? '',
        active: article.active ? 'Ja' : 'Nej',
      });
    }

    styleMaterialWorksheet(worksheet);

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'EXPORT',
        entityType: 'MaterialArticleExcel',
        newValue: JSON.stringify({ rowCount: articles.length }),
      },
    });

    return sendMaterialWorkbook(reply, workbook, 'materialregister.xlsx');
  });

  fastify.get('/materials/template.xlsx', {
    preHandler: [requireAdminOrSupervisor],
  }, async (_request, reply) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TidApp';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Materialmall');
    worksheet.columns = [
      { header: 'Artikel', key: 'name', width: 28 },
      { header: 'Artikelnummer', key: 'articleNumber', width: 18 },
      { header: 'Kategori', key: 'category', width: 18 },
      { header: 'Enhet', key: 'unit', width: 12 },
      { header: 'Antal', key: 'quantity', width: 12 },
      { header: 'Datum', key: 'date', width: 14 },
      { header: 'Inköpspris', key: 'purchasePrice', width: 14 },
      { header: 'Försäljningspris', key: 'unitPrice', width: 16 },
      { header: 'Kommentar', key: 'note', width: 32 },
      { header: 'Aktiv', key: 'active', width: 10 },
    ];

    [
      ['Rörskål 42 mm', 'RS-42', 'Rörskål', 'm', 'Ja'],
      ['Lamellmatta 50 mm', 'LM-50', 'Lamellmatta', 'm2', 'Ja'],
      ['Plåt aluminium', 'PL-ALU', 'Plåt', 'm2', 'Ja'],
      ['Tejp aluminium', 'TEJP-ALU', 'Tejp', 'st', 'Ja'],
      ['Brandtätningsmassa', 'BT-MASSA', 'Brandtätning', 'st', 'Ja'],
      ['Skruv/nit', 'SKRUV-NIT', 'Skruv/nit', 'st', 'Ja'],
      ['Övrigt material', '', 'Övrigt', 'st', 'Ja'],
    ].forEach(([name, articleNumber, category, unit, active]) => {
      worksheet.addRow({
        name,
        articleNumber,
        category,
        unit,
        quantity: 1,
        date: '',
        purchasePrice: '',
        unitPrice: '',
        note: '',
        active,
      });
    });

    styleMaterialWorksheet(worksheet);

    const info = workbook.addWorksheet('Instruktion');
    info.columns = [{ header: 'Fält', key: 'field', width: 24 }, { header: 'Beskrivning', key: 'description', width: 72 }];
    info.addRows([
      { field: 'Artikel', description: 'Namnet som montörer och projektledare ser i materialregistret.' },
      { field: 'Kategori', description: 'Använd en av kategorierna i mallen: Rörskål, Lamellmatta, Plåt, Tejp, Brandtätning, Skruv/nit eller Övrigt.' },
      { field: 'Aktiv', description: 'Skriv Ja för aktiva artiklar och Nej för sådant som inte ska användas framåt.' },
    ]);
    styleMaterialWorksheet(info);

    return sendMaterialWorkbook(reply, workbook, 'materialmall.xlsx');
  });

  fastify.post('/materials/articles/import.xlsx', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const file = await (request as any).file();
    if (!file) return reply.status(400).send({ error: 'Excel-fil saknas' });

    const buffer = await file.toBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet('Materialmall') || workbook.getWorksheet('Materialregister') || workbook.worksheets[0];
    if (!worksheet) return reply.status(400).send({ error: 'Excel-filen saknar blad' });

    const headers = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, colNumber) => headers.set(normalizeHeader(cell.value), colNumber));
    const col = (name: string) => headers.get(normalizeHeader(name));
    const articleCol = col('Artikel');
    if (!articleCol) {
      return reply.status(400).send({ error: 'Excel-filen måste innehålla kolumnen Artikel' });
    }

    const rows: Array<{
      row: number;
      name: string;
      articleNumber: string | null;
      category: string;
      unit: string;
      purchasePrice: number | null;
      defaultUnitPrice: number | null;
      markupPercent: number | null;
      active: boolean;
    }> = [];
    const errors: Array<{ row: number; message: string }> = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as unknown[];
      const hasAnyValue = values.some((value) => normalizeText(value));
      if (!hasAnyValue) return;

      const name = normalizeText(row.getCell(articleCol).value);
      const unit = col('Enhet') ? normalizeText(row.getCell(col('Enhet')!).value) || 'st' : 'st';
      const category = col('Kategori') ? normalizeText(row.getCell(col('Kategori')!).value) || 'Övrigt' : 'Övrigt';
      const purchasePrice = col('Inköpspris') ? parseOptionalNumber(row.getCell(col('Inköpspris')!).value) : null;
      const defaultUnitPrice = col('Försäljningspris') ? parseOptionalNumber(row.getCell(col('Försäljningspris')!).value) : null;
      const markupPercent = col('Påslag %') ? parseOptionalNumber(row.getCell(col('Påslag %')!).value) : null;

      if (!name) errors.push({ row: rowNumber, message: 'Artikel saknas' });
      if (!unit) errors.push({ row: rowNumber, message: 'Enhet saknas' });
      if (purchasePrice != null && purchasePrice < 0) errors.push({ row: rowNumber, message: 'Inköpspris får inte vara negativt' });
      if (defaultUnitPrice != null && defaultUnitPrice < 0) errors.push({ row: rowNumber, message: 'Försäljningspris får inte vara negativt' });
      if (markupPercent != null && markupPercent < 0) errors.push({ row: rowNumber, message: 'Påslag får inte vara negativt' });
      if (!name || !unit) return;

      rows.push({
        row: rowNumber,
        name,
        articleNumber: col('Artikelnummer') ? normalizeText(row.getCell(col('Artikelnummer')!).value) || null : null,
        category,
        unit,
        purchasePrice,
        defaultUnitPrice,
        markupPercent,
        active: col('Aktiv') ? parseActive(row.getCell(col('Aktiv')!).value) : true,
      });
    });

    if (errors.length) return reply.status(400).send({ error: 'Importen innehåller fel', errors });
    if (!rows.length) return reply.status(400).send({ error: 'Inga materialartiklar att importera' });

    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const existing = await tx.materialArticle.findFirst({
          where: {
            companyId: request.user.companyId,
            OR: [
              ...(row.articleNumber ? [{ articleNumber: row.articleNumber }] : []),
              { name: row.name, unit: row.unit },
            ],
          },
        });

        if (existing) {
          await tx.materialArticle.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              articleNumber: row.articleNumber,
              category: row.category,
              unit: row.unit,
              purchasePrice: row.purchasePrice,
              defaultUnitPrice: row.defaultUnitPrice,
              markupPercent: row.markupPercent,
              active: row.active,
            },
          });
          updated += 1;
        } else {
          await tx.materialArticle.create({
            data: {
              companyId: request.user.companyId,
              name: row.name,
              articleNumber: row.articleNumber,
              category: row.category,
              unit: row.unit,
              purchasePrice: row.purchasePrice,
              defaultUnitPrice: row.defaultUnitPrice,
              markupPercent: row.markupPercent,
              active: row.active,
            },
          });
          created += 1;
        }
      }

      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'IMPORT',
          entityType: 'MaterialArticleExcel',
          newValue: JSON.stringify({ rowCount: rows.length, created, updated }),
        },
      });

      return { created, updated };
    });

    return {
      imported: rows.length,
      created: result.created,
      updated: result.updated,
      skipped: 0,
      errors: [],
    };
  });

  fastify.post('/materials/articles', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const body = materialArticleSchema.parse(request.body);

      const article = await prisma.materialArticle.create({
        data: {
          companyId: request.user.companyId,
          name: body.name.trim(),
          articleNumber: body.articleNumber?.trim() || null,
          category: body.category || 'Övrigt',
          unit: body.unit?.trim() || 'st',
          purchasePrice: body.purchasePrice ?? null,
          defaultUnitPrice: body.defaultUnitPrice ?? null,
          markupPercent: body.markupPercent ?? null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'MaterialArticle',
          entityId: article.id,
          newValue: JSON.stringify({
            name: article.name,
            articleNumber: article.articleNumber,
            category: article.category,
            unit: article.unit,
            purchasePrice: article.purchasePrice,
            defaultUnitPrice: article.defaultUnitPrice,
            markupPercent: article.markupPercent,
          }),
        },
      });

      return reply.status(201).send(article);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  fastify.put('/materials/articles/:articleId', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const { articleId } = request.params as { articleId: string };
      const body = materialArticleSchema.partial().extend({ active: z.boolean().optional() }).parse(request.body);

      const existing = await prisma.materialArticle.findFirst({
        where: { id: articleId, companyId: request.user.companyId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Materialartikeln hittades inte' });
      }

      const data: any = {};
      if (body.name !== undefined) data.name = body.name.trim();
      if (body.articleNumber !== undefined) data.articleNumber = body.articleNumber?.trim() || null;
      if (body.category !== undefined) data.category = body.category;
      if (body.unit !== undefined) data.unit = body.unit.trim() || 'st';
      if (body.purchasePrice !== undefined) data.purchasePrice = body.purchasePrice;
      if (body.defaultUnitPrice !== undefined) data.defaultUnitPrice = body.defaultUnitPrice;
      if (body.markupPercent !== undefined) data.markupPercent = body.markupPercent;
      if (body.active !== undefined) data.active = body.active;

      const article = await prisma.materialArticle.update({
        where: { id: articleId },
        data,
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'MaterialArticle',
          entityId: article.id,
          oldValue: JSON.stringify({ name: existing.name, active: existing.active }),
          newValue: JSON.stringify(body),
        },
      });

      return article;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  fastify.delete('/materials/articles/:articleId', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { articleId } = request.params as { articleId: string };

    const existing = await prisma.materialArticle.findFirst({
      where: { id: articleId, companyId: request.user.companyId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Materialartikeln hittades inte' });
    }

    await prisma.materialArticle.update({
      where: { id: articleId },
      data: { active: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'MaterialArticle',
        entityId: articleId,
        oldValue: JSON.stringify({ name: existing.name, active: existing.active }),
      },
    });

    return { message: 'Materialartikeln inaktiverad' };
  });

  fastify.get('/:id/summary', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true, defaultRate: true } } },
    });

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const canView = canViewFinancials(request.user.role, project);
    if (!canView) {
      return {
        project: sanitizeProjectForRole(project, false),
        period: { from: from || null, to: to || null },
        resultsVisibleToCurrentUser: false,
        metrics: null,
        totals: {
          totalHours: null,
          billableHours: null,
          laborCost: null,
          materialCost: null,
          materialSalesValue: null,
          revenue: null,
          result: null,
          marginPercent: null,
          entryCount: null,
          materialRowCount: null,
        },
        warnings: [],
        byActivity: [],
        byUser: [],
        recentEntries: [],
        recentMaterials: [],
      };
    }

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = getDayEnd(to);
    const whereDate = Object.keys(dateFilter).length ? { date: dateFilter } : {};

    const [approvedEntries, openEntryCount, materials] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { projectId: id, status: 'APPROVED', ...whereDate },
        include: {
          user: { select: { id: true, name: true, hourlyCost: true } },
          project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
          activity: { select: { id: true, name: true, code: true, category: true, rateOverride: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.timeEntry.count({
        where: { projectId: id, status: { not: 'APPROVED' }, ...whereDate },
      }),
      prisma.projectMaterial.findMany({
        where: { projectId: id, ...whereDate },
        include: { createdByUser: { select: { id: true, name: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const totalHours = approvedEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const billableEntries = approvedEntries.filter((entry) => entry.billable);
    const billableHours = billableEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const billableValue = billableEntries.reduce((sum, entry) => sum + entry.hours * getRate(entry), 0);
    const laborCost = approvedEntries.reduce((sum, entry) => sum + entry.hours * (entry.user.hourlyCost || 0), 0);
    const materialCost = materials.reduce((sum, item) => sum + item.quantity * (item.purchasePrice ?? item.unitPrice ?? 0), 0);
    const materialSalesValue = materials.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
    const revenue = project.billingModel === 'FIXED' && project.fixedPrice != null
      ? project.fixedPrice + materialSalesValue
      : billableValue + materialSalesValue;
    const result = revenue > 0 ? revenue - laborCost - materialCost : null;
    const marginPercent = result != null && revenue > 0 ? (result / revenue) * 100 : null;
    const warnings: string[] = [];
    if (openEntryCount > 0) warnings.push(`${openEntryCount} tidrader är inte attesterade`);
    if (approvedEntries.some((entry) => entry.user.hourlyCost == null)) warnings.push('Timkostnad saknas på minst en användare');
    if (materials.some((item) => item.purchasePrice == null)) warnings.push('Inköpspris saknas på minst en materialrad');
    if (revenue === 0) warnings.push('Pris eller debiterbart värde saknas');

    const byActivity = new Map<string, { activityId: string; activityName: string; activityCode: string; hours: number }>();
    const byUser = new Map<string, { userId: string; userName: string; hours: number; billableHours: number }>();

    for (const entry of approvedEntries) {
      const activity = byActivity.get(entry.activity.id) || {
        activityId: entry.activity.id,
        activityName: entry.activity.name,
        activityCode: entry.activity.code,
        hours: 0,
      };
      activity.hours += entry.hours;
      byActivity.set(entry.activity.id, activity);

      const user = byUser.get(entry.user.id) || {
        userId: entry.user.id,
        userName: entry.user.name,
        hours: 0,
        billableHours: 0,
      };
      user.hours += entry.hours;
      if (entry.billable) user.billableHours += entry.hours;
      byUser.set(entry.user.id, user);
    }

    return {
      project: sanitizeProjectForRole(project, true),
      period: { from: from || null, to: to || null },
      resultsVisibleToCurrentUser: true,
      metrics: {
        totalHours,
        billableHours,
        billableValue,
        laborCost,
        materialCost,
        materialSalesValue,
        projectResult: result,
        marginPercent,
        budgetUsagePercent: project.budgetHours ? (totalHours / project.budgetHours) * 100 : null,
      },
      totals: {
        totalHours,
        billableHours,
        laborCost,
        materialCost,
        materialSalesValue,
        revenue,
        result,
        marginPercent,
        entryCount: approvedEntries.length,
        materialRowCount: materials.length,
      },
      warnings,
      byActivity: Array.from(byActivity.values()).sort((a, b) => b.hours - a.hours),
      byUser: Array.from(byUser.values()).sort((a, b) => b.hours - a.hours),
      recentEntries: approvedEntries.slice(0, 8),
      recentMaterials: materials.slice(0, 8).map((item) => mapMaterialForRole(item, true)),
    };
  });

  fastify.post('/:id/materials/import.xlsx', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const file = await (request as any).file();
    if (!file) return reply.status(400).send({ error: 'Excel-fil saknas' });

    const buffer = await file.toBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return reply.status(400).send({ error: 'Excel-filen saknar blad' });

    const headers = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, colNumber) => headers.set(normalizeHeader(cell.value), colNumber));
    const col = (name: string) => headers.get(normalizeHeader(name));
    const articleCol = col('Artikel');
    const quantityCol = col('Antal');
    if (!articleCol || !quantityCol) {
      return reply.status(400).send({ error: 'Excel-filen måste innehålla kolumnerna Artikel och Antal' });
    }

    const rows: Array<{
      row: number;
      articleName: string;
      articleNumber: string | null;
      category: string;
      unit: string;
      quantity: number;
      date: Date;
      purchasePrice: number | null;
      unitPrice: number | null;
      note: string | null;
    }> = [];
    const errors: Array<{ row: number; message: string }> = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const articleName = normalizeText(row.getCell(articleCol).value);
      const quantity = parseRequiredNumber(row.getCell(quantityCol).value);
      const values = row.values as unknown[];
      const hasAnyValue = values.some((value) => normalizeText(value));
      if (!hasAnyValue) return;

      if (!articleName) errors.push({ row: rowNumber, message: 'Artikel saknas' });
      if (quantity == null) errors.push({ row: rowNumber, message: 'Antal måste vara större än 0' });
      if (!articleName || quantity == null) return;

      rows.push({
        row: rowNumber,
        articleName,
        articleNumber: col('Artikelnummer') ? normalizeText(row.getCell(col('Artikelnummer')!).value) || null : null,
        category: col('Kategori') ? normalizeText(row.getCell(col('Kategori')!).value) || 'Övrigt' : 'Övrigt',
        unit: col('Enhet') ? normalizeText(row.getCell(col('Enhet')!).value) || 'st' : 'st',
        quantity,
        date: col('Datum') ? parseImportDate(row.getCell(col('Datum')!).value) : new Date(),
        purchasePrice: col('Inköpspris') ? parseOptionalNumber(row.getCell(col('Inköpspris')!).value) : null,
        unitPrice: col('Försäljningspris') ? parseOptionalNumber(row.getCell(col('Försäljningspris')!).value) : null,
        note: col('Kommentar') ? normalizeText(row.getCell(col('Kommentar')!).value) || null : null,
      });
    });

    if (errors.length) return reply.status(400).send({ error: 'Importen innehåller fel', errors });
    if (!rows.length) return reply.status(400).send({ error: 'Inga materialrader att importera' });

    const result = await prisma.$transaction(async (tx) => {
      let createdArticles = 0;
      const createdMaterials: any[] = [];

      for (const row of rows) {
        let createdArticle = false;
        let article = await tx.materialArticle.findFirst({
          where: {
            companyId: request.user.companyId,
            OR: [
              ...(row.articleNumber ? [{ articleNumber: row.articleNumber }] : []),
              { name: row.articleName, unit: row.unit },
            ],
          },
        });
        if (!article) {
          article = await tx.materialArticle.create({
            data: {
              companyId: request.user.companyId,
              name: row.articleName,
              articleNumber: row.articleNumber,
              category: row.category,
              unit: row.unit,
              purchasePrice: row.purchasePrice,
              defaultUnitPrice: row.unitPrice,
              active: true,
            },
          });
          createdArticle = true;
        }
        if (createdArticle) createdArticles += 1;

        const material = await tx.projectMaterial.create({
          data: {
            projectId: id,
            articleId: article.id,
            createdByUserId: request.user.id,
            articleName: article.name,
            articleNumber: article.articleNumber,
            unit: article.unit,
            purchasePrice: row.purchasePrice ?? article.purchasePrice,
            unitPrice: row.unitPrice ?? article.defaultUnitPrice,
            quantity: row.quantity,
            date: row.date,
            note: row.note,
          },
          include: { createdByUser: { select: { id: true, name: true } } },
        });
        createdMaterials.push(material);
      }

      await tx.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'IMPORT',
          entityType: 'ProjectMaterialExcel',
          entityId: id,
          newValue: JSON.stringify({ projectId: id, rowCount: rows.length }),
        },
      });

      return { createdArticles, createdMaterials };
    });

    await enqueueMaterialChanged(prisma, {
      companyId: request.user.companyId,
      projectId: id,
      entityId: id,
      action: 'IMPORT',
      payload: { rowCount: result.createdMaterials.length },
    });

    return {
      imported: result.createdMaterials.length,
      created: result.createdMaterials.length,
      updated: 0,
      createdArticles: result.createdArticles,
      skipped: 0,
      errors: [],
      items: result.createdMaterials.map((item) => mapMaterialForRole(item, true)),
    };
  });

  // Project by ID is registered after material registry routes so static
  // material paths can never be interpreted as project ids.
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
      },
    });

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const canView = canViewFinancials(request.user.role, project);
    const metrics = await getProjectMetrics(prisma, project);

    const stats = !canView
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id },
          _sum: { hours: true },
        });

    const billableStats = !canView
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id, billable: true },
          _sum: { hours: true },
        });

    return {
      ...sanitizeProjectForRole(project, canView),
      resultsVisibleToCurrentUser: canView,
      totalHours: canView ? (stats?._sum.hours || 0) : null,
      billableHours: canView ? (billableStats?._sum.hours || 0) : null,
      metrics: canView ? metrics : null,
    };
  });

  fastify.get('/:id/materials', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const canView = canViewFinancials(request.user.role, project);

    const items = await prisma.projectMaterial.findMany({
      where: { projectId: id },
      include: {
        createdByUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const mappedItems = items.map((item) => mapMaterialForRole(item, canView));

    return {
      costVisibleToCurrentUser: canView,
      items: mappedItems,
      totals: {
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        amount: !canView
          ? null
          : items.reduce((sum, item) => sum + (item.unitPrice != null ? item.quantity * item.unitPrice : 0), 0),
      },
    };
  });

  fastify.post('/:id/materials', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = projectMaterialSchema.parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      const article = await prisma.materialArticle.findUnique({
        where: { id: body.articleId },
      });

      if (!article || article.companyId !== request.user.companyId || !article.active) {
        return reply.status(400).send({ error: 'Materialartikeln finns inte eller ar inte aktiv' });
      }

      const material = await prisma.projectMaterial.create({
        data: {
          projectId: id,
          articleId: article.id,
          createdByUserId: request.user.id,
          articleName: article.name,
          articleNumber: article.articleNumber,
          unit: article.unit,
          purchasePrice: article.purchasePrice,
          unitPrice: article.defaultUnitPrice,
          quantity: body.quantity,
          date: body.date ? new Date(body.date) : new Date(),
          note: body.note?.trim() || null,
        },
        include: {
          createdByUser: {
            select: { id: true, name: true },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'ProjectMaterial',
          entityId: material.id,
          newValue: JSON.stringify({
            projectId: id,
            articleName: material.articleName,
            quantity: material.quantity,
            unit: material.unit,
          }),
        },
      });

      await enqueueMaterialChanged(prisma, {
        companyId: request.user.companyId,
        projectId: id,
        entityId: material.id,
        action: 'CREATE',
        payload: {
          articleName: material.articleName,
          quantity: material.quantity,
          unit: material.unit,
        },
      });

      return reply.status(201).send(mapMaterialForRole(material, canViewFinancials(request.user.role, project)));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  fastify.patch('/:id/materials/:materialId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { id, materialId } = request.params as { id: string; materialId: string };
      const body = projectMaterialPatchSchema.parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      const material = await prisma.projectMaterial.findUnique({ where: { id: materialId } });
      if (!material || material.projectId !== id) {
        return reply.status(404).send({ error: 'Materialraden hittades inte' });
      }

      const isOwner = material.createdByUserId === request.user.id;
      const isManager = canManageMaterials(request.user.role);
      if (!isOwner && !isManager) {
        return reply.status(403).send({ error: 'Atkomst nekad' });
      }

      const touchesFinancials =
        body.articleId !== undefined ||
        body.purchasePrice !== undefined ||
        body.unitPrice !== undefined ||
        body.invoiceStatus !== undefined ||
        body.invoiceReference !== undefined;
      if (touchesFinancials && !isManager) {
        return reply.status(403).send({ error: 'Endast admin eller arbetsledare kan ändra pris, artikel eller fakturastatus' });
      }

      const data: any = {};
      if (body.quantity !== undefined) data.quantity = body.quantity;
      if (body.date !== undefined) data.date = new Date(body.date);
      if (body.note !== undefined) data.note = body.note?.trim() || null;
      if (body.purchasePrice !== undefined) data.purchasePrice = body.purchasePrice;
      if (body.unitPrice !== undefined) data.unitPrice = body.unitPrice;
      if (body.invoiceStatus !== undefined) {
        data.invoiceStatus = body.invoiceStatus;
        data.invoicedAt = body.invoiceStatus === 'INVOICED' ? new Date() : null;
      }
      if (body.invoiceReference !== undefined) data.invoiceReference = body.invoiceReference?.trim() || null;

      if (body.articleId) {
        const article = await prisma.materialArticle.findFirst({
          where: { id: body.articleId, companyId: request.user.companyId, active: true },
        });
        if (!article) return reply.status(400).send({ error: 'Materialartikeln finns inte eller är inte aktiv' });
        data.articleId = article.id;
        data.articleName = article.name;
        data.articleNumber = article.articleNumber;
        data.unit = article.unit;
        if (body.purchasePrice === undefined) data.purchasePrice = article.purchasePrice;
        if (body.unitPrice === undefined) data.unitPrice = article.defaultUnitPrice;
      }

      const updated = await prisma.projectMaterial.update({
        where: { id: materialId },
        data,
        include: { createdByUser: { select: { id: true, name: true } } },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'ProjectMaterial',
          entityId: materialId,
          oldValue: JSON.stringify({
            articleName: material.articleName,
            quantity: material.quantity,
            unit: material.unit,
            date: material.date,
          }),
          newValue: JSON.stringify(body),
        },
      });

      await enqueueMaterialChanged(prisma, {
        companyId: request.user.companyId,
        projectId: id,
        entityId: materialId,
        action: 'UPDATE',
        payload: {
          articleName: updated.articleName,
          quantity: updated.quantity,
          unit: updated.unit,
        },
      });

      return mapMaterialForRole(updated, canViewFinancials(request.user.role, project));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  fastify.delete('/:id/materials/:materialId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, materialId } = request.params as { id: string; materialId: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const material = await prisma.projectMaterial.findUnique({
      where: { id: materialId },
    });

    if (!material || material.projectId !== id) {
      return reply.status(404).send({ error: 'Materialraden hittades inte' });
    }

    const isOwner = material.createdByUserId === request.user.id;
    if (!isOwner && !canManageMaterials(request.user.role)) {
      return reply.status(403).send({ error: 'Atkomst nekad' });
    }

    await prisma.projectMaterial.delete({
      where: { id: materialId },
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'ProjectMaterial',
        entityId: material.id,
        oldValue: JSON.stringify({
          projectId: id,
          articleName: material.articleName,
          quantity: material.quantity,
          unit: material.unit,
        }),
      },
    });

    await enqueueMaterialChanged(prisma, {
      companyId: request.user.companyId,
      projectId: id,
      entityId: material.id,
      action: 'DELETE',
      payload: {
        articleName: material.articleName,
        quantity: material.quantity,
        unit: material.unit,
      },
    });

    return { message: 'Materialraden borttagen' };
  });

  // Get project time entries
  fastify.get('/:id/time-entries', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    // Verify project belongs to company
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    if (shouldHideResultsForEmployee(request.user.role, project)) {
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

    return entries;
  });

  // Manager summary by employee for project
  fastify.get('/:id/manager-summary', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const where: any = {
      projectId: id,
      user: { companyId: request.user.companyId },
    };

    if (from) where.date = { ...where.date, gte: new Date(from) };
    if (to) where.date = { ...where.date, lte: getDayEnd(to) };

    const entries = await prisma.timeEntry.findMany({
      where,
      select: {
        userId: true,
        date: true,
        hours: true,
        billable: true,
        project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
        activity: { select: { rateOverride: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getIsoWeek = (date: Date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const weekdayLabels = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

    const byEmployeeWeek: Record<string, {
      userId: string;
      name: string;
      email: string;
      weekStartDate: Date;
      weekNumber: number;
      hours: number;
      billableHours: number;
      nonBillableHours: number;
      amount: number;
      entryCount: number;
      dayHours: Record<string, number>;
    }> = {};

    for (const entry of entries) {
      const weekStartDate = getWeekStart(entry.date);
      const key = `${entry.userId}_${weekStartDate.toISOString()}`;

      if (!byEmployeeWeek[key]) {
        byEmployeeWeek[key] = {
          userId: entry.user.id,
          name: entry.user.name,
          email: entry.user.email,
          weekStartDate,
          weekNumber: getIsoWeek(weekStartDate),
          hours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          amount: 0,
          entryCount: 0,
          dayHours: { Mån: 0, Tis: 0, Ons: 0, Tor: 0, Fre: 0, Lör: 0, Sön: 0 },
        };
      }

      byEmployeeWeek[key].hours += entry.hours;
      byEmployeeWeek[key].entryCount += 1;
      const dayLabel = weekdayLabels[entry.date.getDay()] || 'Okänd';
      byEmployeeWeek[key].dayHours[dayLabel] = (byEmployeeWeek[key].dayHours[dayLabel] || 0) + entry.hours;

      if (entry.billable) {
        byEmployeeWeek[key].billableHours += entry.hours;
        const rate = entry.activity.rateOverride ?? entry.project?.defaultRate ?? entry.project?.customer?.defaultRate ?? 0;
        byEmployeeWeek[key].amount += entry.hours * rate;
      } else {
        byEmployeeWeek[key].nonBillableHours += entry.hours;
      }
    }

    const employeeWeekBreakdown = Object.values(byEmployeeWeek)
      .sort((a, b) => {
        if (b.weekStartDate.getTime() !== a.weekStartDate.getTime()) {
          return b.weekStartDate.getTime() - a.weekStartDate.getTime();
        }
        return b.hours - a.hours;
      })
      .map((row) => ({
        userId: row.userId,
        userName: row.name,
        weekStartDate: row.weekStartDate,
        weekNumber: row.weekNumber,
        totalHours: row.hours,
        billableHours: row.billableHours,
        nonBillableHours: row.nonBillableHours,
        entryCount: row.entryCount,
        dayHours: row.dayHours,
        amount: row.amount,
      }));

    return {
      project,
      period: { from: from || null, to: to || null },
      employeeBreakdown: employeeWeekBreakdown,
      totals: {
        totalHours: employeeWeekBreakdown.reduce((sum, e) => sum + e.totalHours, 0),
        totalBillableHours: employeeWeekBreakdown.reduce((sum, e) => sum + e.billableHours, 0),
        totalAmount: employeeWeekBreakdown.reduce((sum, e) => sum + e.amount, 0),
        employeeCount: new Set(employeeWeekBreakdown.map((e) => e.userId)).size,
      },
    };
  });

  // Create project
  fastify.post('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const body = projectSchema.parse(request.body);

      // Kontrollera att projektkod är unik inom företaget
      const existing = await prisma.project.findUnique({
        where: {
          companyId_code: {
            companyId: request.user.companyId,
            code: body.code,
          },
        },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Projektkoden finns redan' });
      }

      const project = await prisma.project.create({
        data: {
          ...body,
          employeeCanSeeResults: body.employeeCanSeeResults ?? false,
          companyId: request.user.companyId,
        },
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'Project',
          entityId: project.id,
          newValue: JSON.stringify({
            name: project.name,
            code: project.code,
            employeeCanSeeResults: project.employeeCanSeeResults,
          }),
        },
      });

      await enqueueProjectChanged(prisma, {
        companyId: request.user.companyId,
        projectId: project.id,
        entityId: project.id,
        action: 'CREATE',
        payload: {
          code: project.code,
          name: project.name,
          customerId: project.customerId,
        },
      });

      return reply.status(201).send(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update project
  fastify.put('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = projectSchema.partial().parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      // Om kod ändras, kontrollera att den är unik inom företaget
      if (body.code && body.code !== project.code) {
        const existing = await prisma.project.findUnique({
          where: {
            companyId_code: {
              companyId: request.user.companyId,
              code: body.code,
            },
          },
        });
        if (existing) {
          return reply.status(400).send({ error: 'Projektkoden finns redan' });
        }
      }

      const updatedProject = await prisma.project.update({
        where: { id },
        data: body,
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'Project',
          entityId: id,
          oldValue: JSON.stringify({
            name: project.name,
            status: project.status,
            employeeCanSeeResults: project.employeeCanSeeResults,
          }),
          newValue: JSON.stringify(body),
        },
      });

      await enqueueProjectChanged(prisma, {
        companyId: request.user.companyId,
        projectId: id,
        entityId: id,
        action: 'UPDATE',
        payload: {
          code: updatedProject.code,
          name: updatedProject.name,
          changedFields: Object.keys(body),
        },
      });

      return updatedProject;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete project (soft delete)
  fastify.delete('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    await prisma.project.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'Project',
        entityId: id,
        oldValue: JSON.stringify({ name: project.name, code: project.code }),
      },
    });

    await enqueueProjectChanged(prisma, {
      companyId: request.user.companyId,
      projectId: id,
      entityId: id,
      action: 'DELETE',
      payload: {
        softDelete: true,
        code: project.code,
        name: project.name,
      },
    });

    return { message: 'Projekt inaktiverat' };
  });

  // Delete project permanently (hard delete)
  fastify.delete('/:id/permanent', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    await prisma.$transaction([
      prisma.attachment.deleteMany({ where: { timeEntry: { projectId: id } } }),
      prisma.timeEntry.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'Project',
        entityId: id,
        oldValue: JSON.stringify({ name: project.name, code: project.code, permanent: true }),
      },
    });

    return { message: 'Projekt raderat permanent' };
  });
};

export default projectRoutes;
