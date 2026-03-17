import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import * as XLSX from 'xlsx';

const workItemSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  unitPrice: z.number().nonnegative().optional().nullable(),
  grossPrice: z.number().nonnegative().optional().nullable(),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const requireAdmin = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (request.user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Endast admin har åtkomst' });
  }
};

const workItemRoutes: FastifyPluginAsync = async (fastify) => {
  // List all work items
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { active } = request.query as { active?: string };

    const where: any = { companyId: request.user.companyId };
    if (active !== undefined) where.active = active === 'true';

    const rows = await prisma.workItem.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    if (request.user.role === 'EMPLOYEE') {
      return rows.map(({ unitPrice, grossPrice, ...rest }) => rest);
    }

    return rows;
  });

  // Import work items from Excel (admin)
  fastify.post('/import-excel', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.status(400).send({ error: 'Ingen fil skickades med' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return reply.status(400).send({ error: 'Excel-filen saknar blad' });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });

    if (!rows.length) {
      return reply.status(400).send({ error: 'Excel-filen innehåller inga rader' });
    }

    let created = 0;
    let updated = 0;
    const seenNames = new Set<string>();

    for (const row of rows) {
      const nameRaw = row['Artikelnamn'] ?? row['artikelnamn'] ?? row['Namn'] ?? row['name'];
      const unitRaw = row['Enhet'] ?? row['enhet'] ?? 'st';
      const nettoRaw = row['Netto'] ?? row['netto'];
      const bruttoRaw = row['Bruttopris'] ?? row['bruttopris'];

      const name = String(nameRaw || '').trim();
      if (!name) continue;

      const unit = String(unitRaw || 'st').trim().toUpperCase();
      const unitPrice = nettoRaw !== null && nettoRaw !== undefined && nettoRaw !== '' ? Number(nettoRaw) : null;
      const grossPrice = bruttoRaw !== null && bruttoRaw !== undefined && bruttoRaw !== '' ? Number(bruttoRaw) : null;

      seenNames.add(name.toLowerCase());

      const existing = await prisma.workItem.findUnique({
        where: {
          companyId_name: {
            companyId: request.user.companyId,
            name,
          },
        },
      });

      if (existing) {
        await prisma.workItem.update({
          where: { id: existing.id },
          data: {
            unit,
            unitPrice: Number.isFinite(unitPrice as number) ? unitPrice : null,
            grossPrice: Number.isFinite(grossPrice as number) ? grossPrice : null,
            active: true,
          },
        });
        updated += 1;
      } else {
        await prisma.workItem.create({
          data: {
            companyId: request.user.companyId,
            name,
            unit,
            unitPrice: Number.isFinite(unitPrice as number) ? unitPrice : null,
            grossPrice: Number.isFinite(grossPrice as number) ? grossPrice : null,
            active: true,
          },
        });
        created += 1;
      }
    }

    const current = await prisma.workItem.findMany({
      where: { companyId: request.user.companyId },
      select: { id: true, name: true },
    });

    const toDeactivate = current
      .filter((w) => !seenNames.has(w.name.toLowerCase()))
      .map((w) => w.id);

    if (toDeactivate.length > 0) {
      await prisma.workItem.updateMany({
        where: { id: { in: toDeactivate } },
        data: { active: false },
      });
    }

    return {
      created,
      updated,
      deactivated: toDeactivate.length,
      totalRows: rows.length,
    };
  });

  // Create work item
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const body = workItemSchema.parse(request.body);

      const existing = await prisma.workItem.findUnique({
        where: {
          companyId_name: {
            companyId: request.user.companyId,
            name: body.name,
          },
        },
      });

      if (existing) {
        return reply.status(400).send({ error: 'Arbetsmoment med det namnet finns redan' });
      }

      const workItem = await prisma.workItem.create({
        data: { ...body, companyId: request.user.companyId },
      });

      return reply.status(201).send(workItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update work item
  fastify.put('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = workItemSchema.partial().parse(request.body);

      const workItem = await prisma.workItem.findUnique({ where: { id } });
      if (!workItem || workItem.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Arbetsmoment hittades inte' });
      }

      if (body.name && body.name !== workItem.name) {
        const existing = await prisma.workItem.findUnique({
          where: {
            companyId_name: {
              companyId: request.user.companyId,
              name: body.name,
            },
          },
        });
        if (existing) {
          return reply.status(400).send({ error: 'Arbetsmoment med det namnet finns redan' });
        }
      }

      return prisma.workItem.update({ where: { id }, data: body });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete work item (soft delete if logs exist, hard delete otherwise)
  fastify.delete('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const workItem = await prisma.workItem.findUnique({ where: { id } });
    if (!workItem || workItem.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Arbetsmoment hittades inte' });
    }

    const logCount = await prisma.workLog.count({ where: { workItemId: id } });

    if (logCount > 0) {
      await prisma.workItem.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.workItem.delete({ where: { id } });
    }

    return { message: 'Arbetsmoment borttaget' };
  });
};

export default workItemRoutes;
