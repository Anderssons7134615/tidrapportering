import { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../index.js';
import { getProjectMetrics } from '../lib/projectMetrics.js';

const projectSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  code: z.string().min(1),
  site: z.string().optional().nullable(),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'INVOICED']).optional(),
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

const invoiceMarkSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  invoiceReference: z.string().trim().max(100).optional().nullable(),
  invoicedAt: z.string().optional(),
});

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
        const hideResults = shouldHideResultsForEmployee(request.user.role, project);

        return {
          ...project,
          resultsVisibleToCurrentUser: !hideResults,
          totalHours: hideResults ? null : metrics.totalHours,
          billableHours: hideResults ? null : metrics.billableHours,
          metrics: hideResults ? null : metrics,
        };
      })
    );

    return projectsWithHours;
  });

  // Get project by ID
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

    const hideResults = shouldHideResultsForEmployee(request.user.role, project);
    const metrics = await getProjectMetrics(prisma, project);

    // Beräkna statistik
    const stats = hideResults
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id },
          _sum: { hours: true },
        });

    const billableStats = hideResults
      ? null
      : await prisma.timeEntry.aggregate({
          where: { projectId: id, billable: true },
          _sum: { hours: true },
        });

    return {
      ...project,
      resultsVisibleToCurrentUser: !hideResults,
      totalHours: hideResults ? null : (stats?._sum.hours || 0),
      billableHours: hideResults ? null : (billableStats?._sum.hours || 0),
      metrics: hideResults ? null : metrics,
    };
  });

  fastify.get('/materials/articles', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { active } = request.query as { active?: string };

    const where: any = { companyId: request.user.companyId };
    if (active !== undefined) {
      where.active = active === 'true';
    }

    return prisma.materialArticle.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
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
      { header: 'Försäljningspris', key: 'defaultUnitPrice', width: 18 },
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

    worksheet.getColumn('purchasePrice').numFmt = '#,##0.00';
    worksheet.getColumn('defaultUnitPrice').numFmt = '#,##0.00';
    worksheet.getColumn('markupPercent').numFmt = '0.00';
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
      { header: 'Inköpspris', key: 'purchasePrice', width: 14 },
      { header: 'Försäljningspris', key: 'defaultUnitPrice', width: 18 },
      { header: 'Påslag %', key: 'markupPercent', width: 12 },
      { header: 'Aktiv', key: 'active', width: 10 },
    ];

    [
      ['Rörskål 42 mm', 'RS-42', 'Rörskål', 'm', 0, 0, 0, 'Ja'],
      ['Lamellmatta 50 mm', 'LM-50', 'Lamellmatta', 'm2', 0, 0, 0, 'Ja'],
      ['Plåt aluminium', 'PL-ALU', 'Plåt', 'm2', 0, 0, 0, 'Ja'],
      ['Tejp aluminium', 'TEJP-ALU', 'Tejp', 'st', 0, 0, 0, 'Ja'],
      ['Brandtätningsmassa', 'BT-MASSA', 'Brandtätning', 'st', 0, 0, 0, 'Ja'],
      ['Skruv/nit', 'SKRUV-NIT', 'Skruv/nit', 'st', 0, 0, 0, 'Ja'],
      ['Övrigt material', '', 'Övrigt', 'st', 0, 0, 0, 'Ja'],
    ].forEach(([name, articleNumber, category, unit, purchasePrice, defaultUnitPrice, markupPercent, active]) => {
      worksheet.addRow({ name, articleNumber, category, unit, purchasePrice, defaultUnitPrice, markupPercent, active });
    });

    worksheet.getColumn('purchasePrice').numFmt = '#,##0.00';
    worksheet.getColumn('defaultUnitPrice').numFmt = '#,##0.00';
    worksheet.getColumn('markupPercent').numFmt = '0.00';
    styleMaterialWorksheet(worksheet);

    const info = workbook.addWorksheet('Instruktion');
    info.columns = [{ header: 'Fält', key: 'field', width: 24 }, { header: 'Beskrivning', key: 'description', width: 72 }];
    info.addRows([
      { field: 'Artikel', description: 'Namnet som montörer och projektledare ser i materialregistret.' },
      { field: 'Kategori', description: 'Använd en av kategorierna i mallen: Rörskål, Lamellmatta, Plåt, Tejp, Brandtätning, Skruv/nit eller Övrigt.' },
      { field: 'Inköpspris', description: 'Din kostnad per enhet, till exempel per meter, styck eller kvadratmeter.' },
      { field: 'Försäljningspris', description: 'Pris per enhet som används på projekt och faktureringsunderlag.' },
      { field: 'Påslag %', description: 'Valfritt påslag om du vill räkna försäljningspris från inköpspris.' },
      { field: 'Aktiv', description: 'Skriv Ja för aktiva artiklar och Nej för sådant som inte ska användas framåt.' },
    ]);
    styleMaterialWorksheet(info);

    return sendMaterialWorkbook(reply, workbook, 'materialmall.xlsx');
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

  fastify.get('/:id/materials', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const hideResults = shouldHideResultsForEmployee(request.user.role, project);

    const items = await prisma.projectMaterial.findMany({
      where: { projectId: id },
      include: {
        createdByUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const mappedItems = items.map((item) => {
      const lineTotal = item.unitPrice != null ? item.quantity * item.unitPrice : null;

      return {
        ...item,
        unitPrice: hideResults ? null : item.unitPrice,
        lineTotal: hideResults ? null : lineTotal,
      };
    });

    return {
      costVisibleToCurrentUser: !hideResults,
      items: mappedItems,
      totals: {
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        amount: hideResults
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

      return reply.status(201).send({
        ...material,
        lineTotal: material.unitPrice != null ? material.quantity * material.unitPrice : null,
      });
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

    return { message: 'Materialraden borttagen' };
  });

  fastify.post('/:id/materials/mark-invoiced', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = invoiceMarkSchema.parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      const result = await prisma.projectMaterial.updateMany({
        where: {
          projectId: id,
          invoiceStatus: { not: 'INVOICED' },
          ...(body.ids?.length ? { id: { in: body.ids } } : {}),
        },
        data: {
          invoiceStatus: 'INVOICED',
          invoicedAt: body.invoicedAt ? new Date(body.invoicedAt) : new Date(),
          invoiceReference: body.invoiceReference || null,
        },
      });

      return { updated: result.count };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
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

  fastify.post('/:id/time-entries/mark-invoiced', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = invoiceMarkSchema.parse(request.body);

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project || project.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Projekt hittades inte' });
      }

      const result = await prisma.timeEntry.updateMany({
        where: {
          projectId: id,
          user: { companyId: request.user.companyId },
          invoiceStatus: { not: 'INVOICED' },
          billable: true,
          ...(body.ids?.length ? { id: { in: body.ids } } : {}),
        },
        data: {
          invoiceStatus: 'INVOICED',
          invoicedAt: body.invoicedAt ? new Date(body.invoicedAt) : new Date(),
          invoiceReference: body.invoiceReference || null,
        },
      });

      return { updated: result.count };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
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
