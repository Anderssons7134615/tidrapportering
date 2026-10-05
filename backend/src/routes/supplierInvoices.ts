import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';
import { createInvoiceService, invoiceDto, invoiceSelect } from '../lib/supplierInvoices.js';
import { invoiceDraftSchema, InvoiceError, INVOICE_MAX_BYTES } from '../lib/supplierInvoiceRules.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'VOID']).optional(),
  projectId: z.string().min(1).max(100).optional(),
}).strict();
const revisionSchema = z.object({ revision: z.number().int().positive() });
const requireManager = requireRoles(['ADMIN', 'SUPERVISOR']);

export function createSupplierInvoiceRoutes(db: typeof prisma = prisma, service = createInvoiceService(db)): FastifyPluginAsync {
  return async (fastify) => {
    fastify.addHook('preHandler', requireManager);
    fastify.get('/', async (request) => {
      const query = querySchema.parse(request.query);
      const companyId = request.user.companyId;
      if (query.projectId && !await db.project.findFirst({ where: { id: query.projectId, companyId }, select: { id: true } })) throw new InvoiceError('Projektet hittades inte.', 404);
      const where: Prisma.SupplierInvoiceWhereInput = {
        companyId, ...(query.status ? { status: query.status } : {}),
        ...(query.projectId ? { allocations: { some: { companyId, projectId: query.projectId } } } : {}),
        ...(query.search ? { OR: ['supplierName', 'invoiceNumber'].map((field) => ({ [field]: { contains: query.search, mode: 'insensitive' } })) } : {}),
      };
      const [rows, total, purchases] = await Promise.all([
        db.supplierInvoice.findMany({ where, select: invoiceSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * 25, take: 25 }),
        db.supplierInvoice.count({ where }),
        query.projectId ? db.supplierInvoiceAllocation.aggregate({ where: { companyId, projectId: query.projectId, invoice: { companyId, status: 'CONFIRMED' } }, _sum: { netOre: true } }) : null,
      ]);
      return { items: rows.map(invoiceDto), total, page: query.page, pageSize: 25, confirmedProjectNetOre: purchases ? purchases._sum.netOre ?? 0 : null };
    });
    fastify.post('/', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      let bytes: Buffer | undefined;
      let name = '';
      // Consume the whole request before creating anything: extra files/fields
      // must fail atomically instead of creating a half-accepted upload.
      for await (const part of request.parts({ limits: { files: 1, fields: 0, parts: 1, fileSize: INVOICE_MAX_BYTES } })) {
        if (part.type !== 'file' || part.mimetype !== 'application/pdf') throw new InvoiceError('Välj en PDF-fil.');
        bytes = await part.toBuffer(); name = part.filename;
        if (part.file.truncated) throw new InvoiceError('Filen får vara högst 10 MB.', 413);
      }
      if (!bytes) throw new InvoiceError('Välj en PDF-fil.');
      const result = await service.upload(request.user, bytes, name);
      return reply.status(result.duplicate ? 200 : 201).send(result);
    });
    fastify.get('/:id', async (request) => {
      const { id } = request.params as { id: string };
      const row = await db.supplierInvoice.findFirst({ where: { id, companyId: request.user.companyId }, select: invoiceSelect });
      if (!row) throw new InvoiceError('Fakturan hittades inte.', 404);
      return invoiceDto(row);
    });
    fastify.get('/:id/document', async (request, reply) => {
      const { id } = request.params as { id: string };
      const document = await db.supplierInvoiceDocument.findFirst({ where: { invoiceId: id, companyId: request.user.companyId }, select: { content: true, originalName: true } });
      if (!document) throw new InvoiceError('Originalet hittades inte.', 404);
      return reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename="faktura.pdf"; filename*=UTF-8''${encodeURIComponent(document.originalName).replace(/'/g, '%27')}`)
        .type('application/pdf').send(document.content);
    });
    fastify.put('/:id', async (request) => service.save(request.user, (request.params as { id: string }).id, invoiceDraftSchema.parse(request.body)));
    fastify.post('/:id/reparse', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
      const body = revisionSchema.strict().parse(request.body);
      return service.reparse(request.user, (request.params as { id: string }).id, body.revision);
    });
    fastify.post('/:id/confirm', async (request) => {
      const body = revisionSchema.extend({ reviewedOriginal: z.literal(true) }).strict().parse(request.body);
      return service.transition(request.user, (request.params as { id: string }).id, body.revision, 'confirm');
    });
    for (const action of ['reopen', 'void'] as const) {
      fastify.post(`/:id/${action}`, async (request) => {
        const body = revisionSchema.extend({ reason: z.string().trim().min(3).max(1000) }).strict().parse(request.body);
        return service.transition(request.user, (request.params as { id: string }).id, body.revision, action, body.reason);
      });
    }
  };
}
export default createSupplierInvoiceRoutes();
