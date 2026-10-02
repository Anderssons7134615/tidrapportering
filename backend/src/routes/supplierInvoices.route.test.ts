import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { createSupplierInvoiceRoutes } from './supplierInvoices.js';
import { createInvoiceService } from '../lib/supplierInvoices.js';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

const draft = { revision: 1, supplierName: 'Testleverantör', supplierOrgNumber: '556000-0000', invoiceNumber: 'TEST-1', documentType: 'INVOICE', issueDate: '2026-10-02', dueDate: null, currency: 'SEK', netOre: 10000, vatOre: 2500, roundingOre: 0, grossOre: 12500, note: null, allocations: [{ projectId: 'pa', netOre: 6000, note: null }] };
const pdf = Buffer.from('%PDF-1.4 TEST ONLY');
function multipartBody(files = 1) {
  return Buffer.from(Array.from({ length: files }, () => `--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n${pdf.toString()}\r\n`).join('') + '--test-boundary--\r\n');
}
async function setup({ companyId = 'a', failAudit = false, failParse = false } = {}) {
  let records: any[] = [{ ...draft, id: 'ia', companyId, status: 'DRAFT', supplierKey: '5560000000', numberKey: 'TEST-1', createdAt: new Date(), updatedAt: new Date(), allocations: draft.allocations.map((row) => ({ ...row, companyId, invoiceId: 'ia', project: { name: 'Testprojekt', code: 'A' } })), document: { originalName: 'test.pdf', byteSize: pdf.length, sha256: 'old' }, suggestions: {}, parseWarnings: [], confirmedAt: null }];
  let documents: any[] = [{ invoiceId: 'ia', companyId, originalName: 'test.pdf', content: pdf, byteSize: pdf.length, sha256: 'old' }];
  let audits: any[] = [];
  const calls: any[] = [];
  const scoped = (row: any, where: any) => (!where.id || row.id === where.id) && row.companyId === where.companyId;
  const db: any = {
    supplierInvoice: {
      findFirst: async (args: any) => { calls.push(args); return structuredClone(records.find((row) => scoped(row, args.where)) || null); },
      findMany: async (args: any) => { calls.push(args); return structuredClone(records.filter((row) => scoped(row, args.where))); },
      count: async () => records.length,
      create: async ({ data }: any) => { records.push({ ...data, status: 'DRAFT', documentType: 'INVOICE', revision: 1, allocations: [], netOre: null, document: null }); return data; },
      updateMany: async ({ where, data }: any) => {
        const row = records.find((row) => scoped(row, where) && row.status === where.status && row.revision === where.revision);
        if (!row) return { count: 0 };
        const next = { ...row, ...data };
        if (next.supplierKey && next.numberKey && records.some((other) => other.id !== row.id && other.companyId === row.companyId && other.supplierKey === next.supplierKey && other.numberKey === next.numberKey && other.documentType === next.documentType)) throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: 'test' });
        Object.assign(row, data, { revision: row.revision + data.revision.increment }); return { count: 1 };
      },
    },
    supplierInvoiceDocument: {
      findFirst: async (args: any) => { calls.push(args); const row = documents.find((row) => row.companyId === args.where.companyId && (!args.where.invoiceId || row.invoiceId === args.where.invoiceId) && (!args.where.sha256 || row.sha256 === args.where.sha256)); return row ? structuredClone(row) : null; },
      create: async ({ data }: any) => { documents.push(data); records.find((row) => row.id === data.invoiceId).document = { originalName: data.originalName, byteSize: data.byteSize, sha256: data.sha256 }; return data; },
    },
    supplierInvoiceAllocation: {
      deleteMany: async ({ where }: any) => { records.find((row) => row.id === where.invoiceId && row.companyId === where.companyId).allocations = []; return { count: 1 }; },
      createMany: async ({ data }: any) => { for (const row of data) records.find((invoice) => invoice.id === row.invoiceId).allocations.push({ ...row, project: { name: 'Testprojekt', code: 'A' } }); return { count: data.length }; },
      aggregate: async (args: any) => { calls.push(args); return { _sum: { netOre: records.filter((row) => row.companyId === args.where.companyId && row.status === args.where.invoice.status).flatMap((row) => row.allocations).filter((row) => row.projectId === args.where.projectId).reduce((sum, row) => sum + row.netOre, 0) } }; },
    },
    project: {
      findMany: async ({ where }: any) => where.companyId === 'a' ? where.id.in.filter((id: string) => id === 'pa').map((id: string) => ({ id, active: true })) : [],
      findFirst: async ({ where }: any) => where.companyId === 'a' && where.id === 'pa' ? { id: 'pa' } : null,
    },
    auditLog: { create: async ({ data }: any) => { if (failAudit) throw new Error('Audit unavailable'); audits.push(data); return data; } },
    $transaction: async (fn: any) => { const before = structuredClone({ records, documents, audits }); try { return await fn(db); } catch (error) { records = before.records; documents = before.documents; audits = before.audits; throw error; } },
  };
  const service = createInvoiceService(db, async () => { if (failParse) throw new Error('parser'); return { text: 'Bevego\nNetto 100,00 SEK', pages: 1 }; });
  const app = Fastify();
  await app.register(multipart);
  app.decorate('authenticate', async (request: any) => { request.user = { id: 'ua', companyId: 'a', role: request.headers['x-test-role'] || 'ADMIN' }; });
  app.setErrorHandler((error: any, _, reply) => reply.status(error instanceof ZodError ? 400 : error.statusCode || 500).send({ error: error.message }));
  await app.register(createSupplierInvoiceRoutes(db, service), { prefix: '/api/supplier-invoices' });
  return { app, records: () => records, documents: () => documents, audits: () => audits, calls };
}
test('fakturaroller avvisas före läsning och skrivning', async () => {
  const ctx = await setup();
  try {
    for (const role of ['EMPLOYEE', 'ACCOUNTANT']) for (const [method, suffix] of [['GET', ''], ['GET', '/ia'], ['GET', '/ia/document'], ['POST', ''], ['PUT', '/ia'], ['POST', '/ia/confirm'], ['POST', '/ia/reopen'], ['POST', '/ia/void']] as const) {
      assert.equal((await ctx.app.inject({ method, url: `/api/supplier-invoices${suffix}`, headers: { 'x-test-role': role }, ...(method === 'PUT' ? { payload: draft } : {}) })).statusCode, 403);
    }
    assert.equal(ctx.calls.length, 0); assert.equal(ctx.audits().length, 0);
  } finally { await ctx.app.close(); }
});
test('annat företags faktura, original och projekt går inte att nå', async () => {
  const ctx = await setup({ companyId: 'b' });
  try {
    for (const [method, suffix, payload] of [['GET', '/ia', undefined], ['GET', '/ia/document', undefined], ['PUT', '/ia', draft], ['POST', '/ia/confirm', { revision: 1, reviewedOriginal: true }], ['POST', '/ia/void', { revision: 1, reason: 'Test' }]] as const) assert.equal((await ctx.app.inject({ method, url: `/api/supplier-invoices${suffix}`, payload })).statusCode, 404);
    assert.equal((await ctx.app.inject({ url: '/api/supplier-invoices?projectId=pb' })).statusCode, 404);
    assert.equal(ctx.audits().length, 0);
  } finally { await ctx.app.close(); }
});
test('fördelning utanför företaget rullar tillbaka även revisionen', async () => {
  const ctx = await setup();
  try {
    const response = await ctx.app.inject({ method: 'PUT', url: '/api/supplier-invoices/ia', payload: { ...draft, allocations: [{ projectId: 'pb', netOre: 1000, note: null }] } });
    assert.equal(response.statusCode, 400); assert.equal(ctx.records()[0].revision, 1); assert.equal(ctx.records()[0].allocations[0].projectId, 'pa');
  } finally { await ctx.app.close(); }
});
test('sparande och statusbyte kräver rätt revision och kontroll av original', async () => {
  const ctx = await setup();
  try {
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/confirm', payload: { revision: 1 } })).statusCode, 400);
    assert.equal((await ctx.app.inject({ method: 'PUT', url: '/api/supplier-invoices/ia', payload: draft })).statusCode, 200);
    assert.equal((await ctx.app.inject({ method: 'PUT', url: '/api/supplier-invoices/ia', payload: draft })).statusCode, 409);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/confirm', payload: { revision: 1, reviewedOriginal: true } })).statusCode, 409);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/confirm', payload: { revision: 2, reviewedOriginal: true } })).statusCode, 200);
    assert.equal((await ctx.app.inject({ url: '/api/supplier-invoices?projectId=pa' })).json().confirmedProjectNetOre, 6000);
    assert.equal((await ctx.app.inject({ method: 'PUT', url: '/api/supplier-invoices/ia', payload: { ...draft, revision: 3 } })).statusCode, 409);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/reopen', payload: { revision: 3, reason: 'Fel projekt' } })).statusCode, 200);
    assert.equal((await ctx.app.inject({ url: '/api/supplier-invoices?projectId=pa' })).json().confirmedProjectNetOre, 0);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/void', payload: { revision: 4, reason: 'Fel original' } })).statusCode, 200);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/reopen', payload: { revision: 5, reason: 'Ångra' } })).statusCode, 409);
    assert.equal(ctx.audits().length, 4); assert.equal(ctx.documents().length, 1);
  } finally { await ctx.app.close(); }
});
for (const action of ['save', 'confirm', 'upload'] as const) test(`${action} rullas tillbaka om revisionsloggen inte kan sparas`, async () => {
  const ctx = await setup({ failAudit: true }); const before = structuredClone(ctx.records());
  try {
    const response = await ctx.app.inject(action === 'upload' ? { method: 'POST', url: '/api/supplier-invoices', payload: multipartBody(), headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' } } : { method: action === 'save' ? 'PUT' : 'POST', url: `/api/supplier-invoices/ia${action === 'confirm' ? '/confirm' : ''}`, payload: action === 'save' ? draft : { revision: 1, reviewedOriginal: true } });
    assert.equal(response.statusCode, 500); assert.deepEqual(ctx.records(), before); assert.equal(ctx.documents().length, 1); assert.equal(ctx.audits().length, 0);
  } finally { await ctx.app.close(); }
});
test('PDF-upload är privat, hashberäknad på servern, idempotent och kan fyllas i efter parserfel', async () => {
  const ctx = await setup({ failParse: true });
  try {
    const request = { method: 'POST' as const, url: '/api/supplier-invoices', payload: multipartBody(), headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' } };
    const first = await ctx.app.inject(request); assert.equal(first.statusCode, 201, first.body);
    const result = first.json(); assert.equal(result.invoice.status, 'DRAFT'); assert.ok(result.invoice.parseWarnings.length); assert.equal(result.invoice.document.content, undefined);
    assert.equal(ctx.documents()[1].sha256, createHash('sha256').update(pdf).digest('hex'));
    const repeat = await ctx.app.inject(request); assert.equal(repeat.statusCode, 200); assert.equal(repeat.json().duplicate, true); assert.equal(ctx.documents().length, 2);
    const original = await ctx.app.inject({ url: `/api/supplier-invoices/${result.invoice.id}/document` });
    assert.equal(original.statusCode, 200); assert.equal(original.headers['cache-control'], 'private, no-store'); assert.equal(original.headers['x-content-type-options'], 'nosniff');
    assert.match(original.headers['content-disposition'] as string, /^attachment/);
    assert.equal(ctx.calls.some((call) => call.select === undefined || !call.where.companyId), false);
  } finally { await ctx.app.close(); }
});
test('multipart med flera filer skapar inte ett halvt accepterat inköp', async () => {
  const ctx = await setup();
  try {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices', payload: multipartBody(2), headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' } });
    assert.equal(response.statusCode, 413); assert.equal(ctx.documents().length, 1); assert.equal(ctx.audits().length, 0);
  } finally { await ctx.app.close(); }
});
test('makulering frigör aktiv identitet för ett korrekt ersättningsoriginal och behåller historiken', async () => {
  const ctx = await setup();
  try {
    const uploaded = await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices', payload: multipartBody(), headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' } });
    const replacement = uploaded.json().invoice.id;
    assert.equal((await ctx.app.inject({ method: 'PUT', url: `/api/supplier-invoices/${replacement}`, payload: draft })).statusCode, 409);
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/supplier-invoices/ia/void', payload: { revision: 1, reason: 'Fel original' } })).statusCode, 200);
    assert.equal((await ctx.app.inject({ method: 'PUT', url: `/api/supplier-invoices/${replacement}`, payload: draft })).statusCode, 200);
    assert.equal(ctx.records()[0].status, 'VOID'); assert.equal(ctx.records()[0].invoiceNumber, 'TEST-1'); assert.equal(ctx.records()[0].supplierKey, null);
    assert.equal(ctx.documents().length, 2); assert.equal(ctx.audits().filter((audit) => audit.action === 'VOID').length, 1);
  } finally { await ctx.app.close(); }
});
