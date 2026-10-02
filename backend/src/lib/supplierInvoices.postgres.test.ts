import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import Fastify from 'fastify';
import { invoiceDraftSchema, InvoiceError } from './supplierInvoiceRules.js';

// Deliberately opt-in. No fallback to DATABASE_URL, .env or a production URL.
// These are public, disposable fixture credentials, not application credentials.
const localUrl = 'postgresql://invoice_test:invoice_test@127.0.0.1:65432/tidapp_invoice_test';
if (process.env.INVOICE_TEST_DATABASE_URL !== localUrl) {
  throw new Error('Set INVOICE_TEST_DATABASE_URL to the exact local fixture URL documented in scripts/INVOICE_POSTGRES_TESTS.md.');
}
process.env.DATABASE_URL = localUrl;
const { PrismaClient } = await import('@prisma/client');
const { createInvoiceService } = await import('./supplierInvoices.js');
const { createSupplierInvoiceRoutes } = await import('../routes/supplierInvoices.js');
const { createProjectTaskRoutes } = await import('../routes/projectTasks.js');

function client() {
  return new PrismaClient({ datasources: { db: { url: `${localUrl}?connection_limit=8` } }, transactionOptions: { maxWait: 10_000, timeout: 20_000 } });
}
async function setup(t: TestContext) {
  const db = client();
  const observer = client();
  t.after(async () => { await Promise.all([db.$disconnect(), observer.$disconnect()]); });
  const identity = await db.$queryRaw<Array<{ database: string; username: string; address: string; port: number }>>`
    SELECT current_database() AS database, current_user AS username,
      host(inet_server_addr()) AS address, inet_server_port() AS port`;
  assert.deepEqual(identity, [{ database: 'tidapp_invoice_test', username: 'invoice_test', address: '127.0.0.1', port: 65432 }]);
  const company = await db.company.create({ data: { name: `Invoice test ${randomUUID()}` } });
  const actor = await db.user.create({ data: { companyId: company.id, email: `${randomUUID()}@example.invalid`, password: 'NOT-A-LOGIN', name: 'Test admin', role: 'ADMIN' } });
  const projects = await Promise.all(['A', 'B'].map((code) => db.project.create({ data: { companyId: company.id, name: `Test ${code}`, code } })));
  // Race tests isolate persistence from the separately tested PDF worker.
  const service = createInvoiceService(db, async () => ({ text: 'Synthetic invoice fixture', pages: 1 }));
  const bytes = Buffer.from(`%PDF-1.4\nTEST ONLY ${randomUUID()}\n\u0000\u00ff\n%%EOF`);
  const draft = (revision: number, note = 'Original', projectIndex = 0) => invoiceDraftSchema.parse({
    revision, supplierName: 'Test supplier', supplierOrgNumber: '556000-0000', invoiceNumber: randomUUID(),
    documentType: 'INVOICE', issueDate: '2026-10-02', dueDate: '2026-10-31', currency: 'SEK',
    netOre: 10000, vatOre: 2500, roundingOre: 0, grossOre: 12500, note,
    allocations: [{ projectId: projects[projectIndex].id, netOre: projectIndex === 0 ? 6000 : 8000, note }],
  });
  const prepared = async () => {
    const { invoice } = await service.upload(actor, bytes, 'synthetic.pdf');
    const input = draft(invoice.revision);
    return { invoice: await service.save(actor, invoice.id, input), input };
  };
  const state = (id: string) => observer.supplierInvoice.findUniqueOrThrow({ where: { id }, include: { allocations: { orderBy: { projectId: 'asc' } }, document: true } });
  const audits = (id: string) => observer.auditLog.findMany({ where: { entityType: 'SupplierInvoice', entityId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return { db, observer, company, actor, projects, service, bytes, draft, prepared, state, audits };
}
type Context = Awaited<ReturnType<typeof setup>>;

// Both actual interactive transactions must reach the conflicting write before
// either proceeds. A missing second arrival fails instead of passing serially.
async function race<T>(ctx: Context, model: Prisma.ModelName, action: Prisma.PrismaAction, operations: [() => Promise<T>, () => Promise<T>]) {
  let arrivals = 0;
  let release!: () => void;
  let reject!: (reason: Error) => void;
  const gate = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
  const timer = setTimeout(() => reject(new Error('Two concurrent transactions did not reach the write barrier.')), 6000);
  let active = true;
  ctx.db.$use(async (params, next) => {
    if (active && params.model === model && params.action === action) {
      assert.equal(params.runInTransaction, true);
      arrivals += 1;
      assert.ok(arrivals <= 2);
      if (arrivals === 2) release();
      await gate;
    }
    return next(params);
  });
  try {
    const results = await Promise.allSettled(operations.map((operation) => operation()));
    assert.equal(arrivals, 2);
    return results;
  } finally { active = false; clearTimeout(timer); }
}
function oneWinner<T>(results: PromiseSettledResult<T>[]) {
  const successful = results.flatMap((result, index) => result.status === 'fulfilled' ? [{ value: result.value, index }] : []);
  const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  assert.equal(successful.length, 1);
  assert.equal(failed.length, 1);
  assert.ok(failed[0].reason instanceof InvoiceError);
  assert.equal(failed[0].reason.statusCode, 409);
  assert.equal(failed[0].reason.code, 'INVOICE_CONFLICT');
  return successful[0];
}

test('PostgreSQL: simultaneous file uploads commit one original, invoice and audit', async (t) => {
  const ctx = await setup(t);
  const results = await race(ctx, 'SupplierInvoiceDocument', 'create', [
    () => ctx.service.upload(ctx.actor, ctx.bytes, 'one.pdf'),
    () => ctx.service.upload(ctx.actor, ctx.bytes, 'two.pdf'),
  ]);
  const uploaded = results.map((result) => { assert.equal(result.status, 'fulfilled'); return result.value; });
  assert.deepEqual(uploaded.map((result) => result.duplicate).sort(), [false, true]);
  assert.equal(uploaded[0].invoice.id, uploaded[1].invoice.id);
  assert.equal(await ctx.observer.supplierInvoice.count({ where: { companyId: ctx.company.id } }), 1);
  assert.equal(await ctx.observer.supplierInvoiceDocument.count({ where: { companyId: ctx.company.id } }), 1);
  const row = await ctx.state(uploaded[0].invoice.id);
  assert.deepEqual(row.document!.content, ctx.bytes);
  assert.equal(row.document!.sha256, createHash('sha256').update(ctx.bytes).digest('hex'));
  assert.deepEqual((await ctx.audits(row.id)).map((entry) => entry.action), ['CREATE']);
});

test('PostgreSQL: concurrent saves keep one complete header/allocation version', async (t) => {
  const ctx = await setup(t);
  const { invoice } = await ctx.prepared();
  const inputs = [ctx.draft(invoice.revision, 'First', 0), ctx.draft(invoice.revision, 'Second', 1)];
  const winner = oneWinner(await race(ctx, 'SupplierInvoice', 'updateMany', [
    () => ctx.service.save(ctx.actor, invoice.id, inputs[0]),
    () => ctx.service.save(ctx.actor, invoice.id, inputs[1]),
  ]));
  const row = await ctx.state(invoice.id);
  const expected = inputs[winner.index];
  assert.equal(row.revision, invoice.revision + 1);
  assert.equal(row.status, 'DRAFT');
  assert.equal(row.invoiceNumber, expected.invoiceNumber);
  assert.equal(row.note, expected.note);
  assert.deepEqual(row.allocations.map(({ projectId, netOre, note }) => ({ projectId, netOre, note })), expected.allocations);
  assert.deepEqual((await ctx.audits(row.id)).map((entry) => entry.action), ['CREATE', 'UPDATE', 'UPDATE']);
});

test('PostgreSQL: saving and confirming the same revision cannot mix versions', async (t) => {
  const ctx = await setup(t);
  const { invoice, input } = await ctx.prepared();
  const change = ctx.draft(invoice.revision, 'Changed', 1);
  const winner = oneWinner(await race(ctx, 'SupplierInvoice', 'updateMany', [
    () => ctx.service.save(ctx.actor, invoice.id, change),
    () => ctx.service.transition(ctx.actor, invoice.id, invoice.revision, 'confirm'),
  ]));
  const row = await ctx.state(invoice.id);
  const expected = winner.index === 0 ? change : input;
  assert.equal(row.revision, invoice.revision + 1);
  assert.equal(row.status, winner.index === 0 ? 'DRAFT' : 'CONFIRMED');
  assert.equal(row.invoiceNumber, expected.invoiceNumber);
  assert.equal(row.note, expected.note);
  assert.deepEqual(row.allocations.map(({ projectId, netOre, note }) => ({ projectId, netOre, note })), expected.allocations);
  assert.equal(row.confirmedByUserId, winner.index === 0 ? null : ctx.actor.id);
  assert.equal(row.confirmedAt !== null, winner.index === 1);
  assert.deepEqual((await ctx.audits(row.id)).map((entry) => entry.action), ['CREATE', 'UPDATE', winner.index === 0 ? 'UPDATE' : 'CONFIRM']);
});

test('PostgreSQL: confirm versus void produces one audited status transition', async (t) => {
  const ctx = await setup(t);
  const { invoice } = await ctx.prepared();
  const winner = oneWinner(await race(ctx, 'SupplierInvoice', 'updateMany', [
    () => ctx.service.transition(ctx.actor, invoice.id, invoice.revision, 'confirm'),
    () => ctx.service.transition(ctx.actor, invoice.id, invoice.revision, 'void', 'Incorrect original'),
  ]));
  const row = await ctx.state(invoice.id);
  const confirmed = winner.index === 0;
  assert.equal(row.revision, invoice.revision + 1);
  assert.equal(row.status, confirmed ? 'CONFIRMED' : 'VOID');
  assert.equal(row.confirmedByUserId, confirmed ? ctx.actor.id : null);
  assert.equal(row.confirmedAt !== null, confirmed);
  assert.equal(row.supplierKey, confirmed ? '5560000000' : null);
  assert.equal(row.numberKey, confirmed ? invoice.invoiceNumber!.toUpperCase() : null);
  assert.equal(row.statusReason, confirmed ? null : 'Incorrect original');
  assert.deepEqual((await ctx.audits(row.id)).map((entry) => entry.action), ['CREATE', 'UPDATE', confirmed ? 'CONFIRM' : 'VOID']);
});

async function failAudit(ctx: Context, operation: () => Promise<void>) {
  // Identifiers and the sole SQL literal are locally generated UUIDs. This
  // trigger exists only in the guarded scratch DB and affects this test user.
  const name = `invoice_test_${randomUUID().replaceAll('-', '')}`;
  await ctx.db.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."entityType" = 'SupplierInvoice' AND NEW."userId" = '${ctx.actor.id}' THEN
        RAISE EXCEPTION 'invoice_test_audit_failure';
      END IF;
      RETURN NEW;
    END $$`);
  try {
    await ctx.db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    try { await operation(); }
    finally { await ctx.db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "AuditLog"`); }
  } finally { await ctx.db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`); }
}

test('PostgreSQL: failed audit rolls back revision, header and replacement allocations', async (t) => {
  const ctx = await setup(t);
  const { invoice } = await ctx.prepared();
  const before = await ctx.state(invoice.id);
  const auditBefore = await ctx.audits(invoice.id);
  const change = ctx.draft(invoice.revision, 'Must roll back', 1);
  await failAudit(ctx, async () => {
    await assert.rejects(ctx.service.save(ctx.actor, invoice.id, change), /invoice_test_audit_failure/);
    assert.deepEqual(await ctx.state(invoice.id), before);
    assert.deepEqual(await ctx.audits(invoice.id), auditBefore);
  });
  assert.equal((await ctx.service.save(ctx.actor, invoice.id, change)).revision, invoice.revision + 1);
});

test('PostgreSQL: failed creation audit leaves no invoice/document and retry succeeds', async (t) => {
  const ctx = await setup(t);
  await failAudit(ctx, async () => {
    await assert.rejects(ctx.service.upload(ctx.actor, ctx.bytes, 'test.pdf'), /invoice_test_audit_failure/);
    assert.equal(await ctx.observer.supplierInvoice.count({ where: { companyId: ctx.company.id } }), 0);
    assert.equal(await ctx.observer.supplierInvoiceDocument.count({ where: { companyId: ctx.company.id } }), 0);
    assert.equal(await ctx.observer.auditLog.count({ where: { userId: ctx.actor.id } }), 0);
  });
  const uploaded = await ctx.service.upload(ctx.actor, ctx.bytes, 'test.pdf');
  assert.equal(uploaded.duplicate, false);
  assert.deepEqual((await ctx.audits(uploaded.invoice.id)).map((entry) => entry.action), ['CREATE']);
});

test('PostgreSQL/Fastify: original bytes, dates, scoped totals and corrections survive the real adapter', async (t) => {
  const ctx = await setup(t);
  const { invoice } = await ctx.prepared();
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { id: ctx.actor.id, companyId: request.headers['x-test-company'] || ctx.company.id, role: request.headers['x-test-role'] || 'ADMIN' };
  });
  app.setErrorHandler((error: any, _, reply) => reply.status(error.statusCode || 500).send({ error: error.message }));
  await app.register(createSupplierInvoiceRoutes(ctx.db, ctx.service), { prefix: '/api/supplier-invoices' });
  await app.register(createProjectTaskRoutes(ctx.db), { prefix: '/api' });
  t.after(() => app.close());
  const url = `/api/supplier-invoices/${invoice.id}`;
  const detail = await app.inject({ url });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().issueDate, '2026-10-02T00:00:00.000Z');
  assert.equal(detail.json().dueDate, '2026-10-31T00:00:00.000Z');
  assert.equal(detail.json().document.content, undefined);
  const original = await app.inject({ url: `${url}/document` });
  assert.equal(original.statusCode, 200);
  assert.deepEqual(original.rawPayload, ctx.bytes);
  assert.equal(original.headers['cache-control'], 'private, no-store');
  for (const suffix of ['', '/document']) {
    assert.equal((await app.inject({ url: url + suffix, headers: { 'x-test-company': randomUUID() } })).statusCode, 404);
    assert.equal((await app.inject({ url: url + suffix, headers: { 'x-test-role': 'EMPLOYEE' } })).statusCode, 403);
  }
  const listUrl = `/api/supplier-invoices?projectId=${ctx.projects[0].id}`;
  const portfolio = async () => {
    const response = await app.inject({ url: '/api/project-portfolio' });
    assert.equal(response.statusCode, 200);
    return response.json().find((row: any) => row.project.id === ctx.projects[0].id);
  };
  const draftCount = async () => (await app.inject({ url: '/api/project-control/projects?q=NoMatchingProject' })).json().summary.invoiceDraftCount;
  assert.equal(await draftCount(), 1);
  assert.equal((await portfolio()).confirmedPurchaseNetOre, 0);
  assert.equal((await app.inject({ url: listUrl })).json().confirmedProjectNetOre, 0);
  const confirmed = await app.inject({ method: 'POST', url: `${url}/confirm`, payload: { revision: invoice.revision, reviewedOriginal: true } });
  assert.equal(confirmed.statusCode, 200);
  assert.equal((await app.inject({ url: listUrl })).json().confirmedProjectNetOre, 6000);
  assert.equal((await portfolio()).confirmedPurchaseNetOre, 6000);
  assert.equal(await draftCount(), 0);
  // A real signed credit must subtract from purchases, without changing reported material/result.
  const uploadedCredit = await ctx.service.upload(ctx.actor, Buffer.from('%PDF-1.4 synthetic credit'), 'credit.pdf');
  const credit = await ctx.service.save(ctx.actor, uploadedCredit.invoice.id, {
    ...ctx.draft(uploadedCredit.invoice.revision), documentType: 'CREDIT', netOre: -10000, vatOre: -2500, grossOre: -12500,
    allocations: [{ projectId: ctx.projects[0].id, netOre: -1500, note: null }],
  });
  await ctx.service.transition(ctx.actor, credit.id, credit.revision, 'confirm');
  const withCredit = await portfolio();
  assert.equal(withCredit.confirmedPurchaseNetOre, 4500);
  assert.equal(withCredit.materialCost, 0);
  assert.equal(withCredit.result, 0);
  const accountant = (await app.inject({ url: '/api/project-portfolio', headers: { 'x-test-role': 'ACCOUNTANT' } })).json();
  assert.ok(accountant.every((row: any) => !('confirmedPurchaseNetOre' in row)));
  assert.deepEqual((await app.inject({ url: '/api/project-portfolio', headers: { 'x-test-company': randomUUID() } })).json(), []);
  const reopened = await app.inject({ method: 'POST', url: `${url}/reopen`, payload: { revision: confirmed.json().revision, reason: 'Check allocation' } });
  assert.equal(reopened.statusCode, 200);
  assert.equal((await app.inject({ url: listUrl })).json().confirmedProjectNetOre, -1500);
  assert.equal((await portfolio()).confirmedPurchaseNetOre, -1500);
  assert.equal(await draftCount(), 1);
});
