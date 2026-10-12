import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';

// Public disposable fixture only. Never fall back to DATABASE_URL or production.
const localUrl = 'postgresql://inventory_test:inventory_test@127.0.0.1:65433/tidapp_inventory_test';
if (process.env.INVENTORY_TEST_DATABASE_URL !== localUrl) throw new Error('Use only the explicit local inventory PostgreSQL fixture on 127.0.0.1:65433.');
process.env.DATABASE_URL = localUrl;
const { PrismaClient } = await import('@prisma/client');
const { createInventoryService, InventoryError } = await import('./inventory.js');
const { createInventoryRoutes } = await import('../routes/inventory.js');
const { createProjectRoutes } = await import('../routes/projects.js');

async function setup(t: TestContext) {
  const db = new PrismaClient({ datasources: { db: { url: localUrl } }, transactionOptions: { timeout: 15000, maxWait: 15000 } });
  t.after(() => db.$disconnect());
  const identity = await db.$queryRaw<any[]>`SELECT current_database() AS db, current_user AS usr, host(inet_server_addr()) AS host, inet_server_port() AS port`;
  assert.deepEqual(identity, [{ db: 'tidapp_inventory_test', usr: 'inventory_test', host: '127.0.0.1', port: 65433 }]);
  const company = await db.company.create({ data: { name: 'SYNTHETIC INVENTORY TEST' } });
  const otherCompany = await db.company.create({ data: { name: 'SYNTHETIC OTHER' } });
  const user = await db.user.create({ data: { companyId: company.id, name: 'TEST', email: `${randomUUID()}@test.invalid`, password: 'TEST', role: 'EMPLOYEE' } });
  const actor = { id: user.id, companyId: company.id, role: 'ADMIN' };
  const employee = { ...actor, role: 'EMPLOYEE' };
  const article = await db.materialArticle.create({ data: { companyId: company.id, name: 'TEST Rörskål 22-30', unit: 'm', purchasePrice: 10, defaultUnitPrice: 20 } });
  const project = await db.project.create({ data: { companyId: company.id, name: 'TEST Project', code: 'T1' } });
  const foreignProject = await db.project.create({ data: { companyId: otherCompany.id, name: 'TEST Other', code: 'T1' } });
  const service = createInventoryService(db);
  const item = await service.addItem(actor, { articleId: article.id, shelf: 'TEST A1' });
  const stock = async () => (await service.list(actor))[0];
  const move = async (kind: 'RECEIPT' | 'ISSUE' | 'COUNT', quantity: number) => service.move(kind === 'ISSUE' ? employee : actor, item.id, {
    kind, quantity, revision: (await stock()).revision, requestKey: randomUUID(), note: 'TEST', ...(kind === 'ISSUE' ? { projectId: project.id } : {}),
  } as any);
  const app = Fastify();
  app.decorate('authenticate', async (req: any) => { req.user = { ...actor, role: req.headers['x-role'] || 'EMPLOYEE' }; });
  await app.register(createInventoryRoutes(db), { prefix: '/api/inventory' });
  await app.register(createProjectRoutes(db), { prefix: '/api/projects' });
  t.after(() => app.close());
  return { db, actor, employee, service, item, article, project, foreignProject, stock, move, app };
}

test('Postgres inventory: receipt, issue and partial/full returns preserve prices and ledger', async (t) => {
  const c = await setup(t);
  assert.equal((await c.stock()).balance, 0);
  await c.move('RECEIPT', 100);
  const issue = await c.move('ISSUE', 30);
  await c.db.materialArticle.update({ where: { id: c.article.id }, data: { purchasePrice: 999 } });
  for (const quantity of [5, 25]) await c.service.move(c.employee, c.item.id, { kind: 'RETURN', quantity, revision: (await c.stock()).revision, sourceIssueId: issue.id, requestKey: randomUUID(), note: 'TEST Retur' });
  const material = await c.db.projectMaterial.findUniqueOrThrow({ where: { inventoryMovementId: issue.id } });
  assert.equal(material.quantity, 0);
  assert.equal(material.purchasePrice, 10);
  assert.equal((await c.stock()).balance, 100);
  assert.equal(await c.db.inventoryMovement.count({ where: { itemId: c.item.id } }), 4);
  assert.equal(await c.db.projectMaterial.count({ where: { projectId: c.project.id } }), 1);
  assert.equal((await c.service.history(c.employee, c.item.id, 1)).items.find((row) => row.id === issue.id)?.returnableQuantity, 0);
});

test('Postgres inventory: atomic overspend rejection, counts, stale revision and request replay', async (t) => {
  const c = await setup(t);
  await c.move('COUNT', 12.125);
  const before = await c.stock();
  await assert.rejects(c.move('ISSUE', 13), /tillräckligt/);
  assert.equal((await c.stock()).revision, before.revision);
  const input = { kind: 'ISSUE' as const, quantity: 2.125, revision: before.revision, requestKey: randomUUID(), note: '', projectId: c.project.id };
  const first = await c.service.move(c.employee, c.item.id, input);
  assert.deepEqual(await c.service.move(c.employee, c.item.id, input), first);
  assert.equal((await c.stock()).balance, 10);
  await assert.rejects(c.service.move(c.employee, c.item.id, { ...input, quantity: 1 }), /nyckeln/);
  await assert.rejects(c.service.move(c.employee, c.item.id, { ...input, requestKey: randomUUID() }), /Lagret har ändrats/);
});

test('Postgres inventory: employee/accountant boundaries, company, hidden article and safe responses', async (t) => {
  const c = await setup(t);
  const payload = { kind: 'RECEIPT', quantity: 10, revision: 1, requestKey: randomUUID() };
  assert.equal((await c.app.inject({ method: 'POST', url: `/api/inventory/items/${c.item.id}/movements`, payload })).statusCode, 403);
  assert.equal((await c.app.inject({ method: 'POST', url: '/api/inventory/items', payload: { articleId: c.article.id } })).statusCode, 403);
  assert.equal((await c.app.inject({ method: 'PATCH', url: `/api/inventory/items/${c.item.id}`, payload: { shelf: 'BAD', revision: 1 } })).statusCode, 403);
  assert.equal((await c.app.inject({ method: 'GET', url: '/api/inventory/items', headers: { 'x-role': 'ACCOUNTANT' } })).statusCode, 403);
  await c.move('RECEIPT', 10);
  await assert.rejects(c.service.move(c.employee, c.item.id, { kind: 'ISSUE', quantity: 1, revision: (await c.stock()).revision, requestKey: randomUUID(), note: '', projectId: c.foreignProject.id }), /tillhör inte/);
  const output = await c.app.inject({ method: 'GET', url: '/api/inventory/items' });
  assert.equal(output.statusCode, 200);
  assert.equal(output.body.includes('purchasePrice'), false);
  assert.equal(output.body.includes('defaultUnitPrice'), false);
  await c.db.materialArticle.update({ where: { id: c.article.id }, data: { employeeVisible: false } });
  assert.deepEqual(await c.service.list(c.employee), []);
  await assert.rejects(c.service.history(c.employee, c.item.id, 1), /hittades inte/);
});

test('Postgres inventory: returns protect ownership, invoicing, active project and remaining quantity', async (t) => {
  const c = await setup(t);
  await c.move('RECEIPT', 10);
  const issue = await c.move('ISSUE', 3);
  const input = { kind: 'RETURN' as const, quantity: 1, revision: (await c.stock()).revision, requestKey: randomUUID(), note: '', sourceIssueId: issue.id };
  await assert.rejects(c.service.move({ ...c.employee, id: randomUUID() }, c.item.id, input), /Uttaget hittades inte/);
  await assert.rejects(c.service.move(c.employee, c.item.id, { ...input, quantity: 4 }), /större/);
  await c.db.projectMaterial.update({ where: { inventoryMovementId: issue.id }, data: { invoiceStatus: 'INVOICED' } });
  await assert.rejects(c.service.move(c.employee, c.item.id, input), /Fakturerat/);
  await c.db.projectMaterial.update({ where: { inventoryMovementId: issue.id }, data: { invoiceStatus: 'UNINVOICED' } });
  await c.db.project.update({ where: { id: c.project.id }, data: { active: false } });
  await assert.rejects(c.service.move(c.employee, c.item.id, input), /inte aktivt/);
  assert.equal((await c.stock()).balance, 7);
});

test('Postgres inventory: project routes cannot alter or delete inventory-linked material', async (t) => {
  const c = await setup(t);
  await c.move('RECEIPT', 10); const issue = await c.move('ISSUE', 3);
  const material = await c.db.projectMaterial.findUniqueOrThrow({ where: { inventoryMovementId: issue.id } });
  for (const role of ['EMPLOYEE', 'ADMIN']) {
    for (const method of ['PATCH', 'DELETE'] as const) {
      const result = await c.app.inject({ method, url: `/api/projects/${c.project.id}/materials/${material.id}`, headers: { 'x-role': role }, ...(method === 'PATCH' ? { payload: { quantity: 8 } } : {}) });
      assert.equal(result.statusCode, 409);
    }
  }
  assert.equal((await c.app.inject({ method: 'PATCH', url: `/api/projects/${c.project.id}/materials/${material.id}`, headers: { 'x-role': 'ADMIN' }, payload: { invoiceStatus: 'INVOICED', invoiceReference: 'TEST' } })).statusCode, 200);
  assert.equal((await c.stock()).balance, 7);
});

test('Postgres inventory: concurrent withdrawals cannot both consume last stock', async (t) => {
  const c = await setup(t);
  await c.move('RECEIPT', 10);
  const revision = (await c.stock()).revision;
  let arrivals = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
  const timeout = setTimeout(() => reject(new Error('Both transactions did not reach inventory lock')), 6000);
  let active = true;
  c.db.$use(async (params, next) => {
    if (active && params.model === 'InventoryItem' && params.action === 'updateMany') {
      assert.equal(params.runInTransaction, true);
      arrivals++; if (arrivals === 2) release(); await gate;
    }
    return next(params);
  });
  const results = await Promise.allSettled([1, 2].map(() => c.service.move(c.employee, c.item.id, { kind: 'ISSUE', quantity: 7, revision, requestKey: randomUUID(), projectId: c.project.id, note: '' })));
  active = false; clearTimeout(timeout);
  assert.equal(arrivals, 2);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  const failure = results.find((row) => row.status === 'rejected') as PromiseRejectedResult;
  assert.ok(failure.reason instanceof InventoryError);
  assert.equal(failure.reason.statusCode, 409);
  assert.equal((await c.stock()).balance, 3);
  assert.equal(await c.db.projectMaterial.count({ where: { projectId: c.project.id } }), 1);
});

test('Postgres inventory: failed audit rolls back stock, revision, movement and material', async (t) => {
  const c = await setup(t);
  await c.move('RECEIPT', 10);
  const before = await c.stock();
  let fail = true;
  c.db.$use(async (params, next) => { if (fail && params.model === 'AuditLog' && params.action === 'create') throw new Error('TEST Audit unavailable'); return next(params); });
  await assert.rejects(c.move('ISSUE', 3), /Audit unavailable/);
  fail = false;
  assert.equal((await c.stock()).balance, 10);
  assert.equal((await c.stock()).revision, before.revision);
  assert.equal(await c.db.inventoryMovement.count({ where: { itemId: c.item.id } }), 1);
  assert.equal(await c.db.projectMaterial.count({ where: { projectId: c.project.id } }), 0);
});

test('Postgres inventory: issue uses the Swedish business date across midnight and DST', async (t) => {
  const c = await setup(t);
  await c.move('RECEIPT', 10);
  let instant = new Date();
  c.db.$use(async (params, next) => {
    if (params.model === 'InventoryMovement' && params.action === 'create') params.args.data.createdAt = instant;
    return next(params);
  });
  for (const [timestamp, expected] of [
    ['2026-10-12T22:30:00Z', '2026-10-13'],
    ['2026-01-12T23:30:00Z', '2026-01-13'],
    ['2026-03-29T22:30:00Z', '2026-03-30'],
  ]) {
    instant = new Date(timestamp);
    const issue = await c.move('ISSUE', 1);
    const material = await c.db.projectMaterial.findUniqueOrThrow({ where: { inventoryMovementId: issue.id } });
    assert.equal(material.date.toISOString(), `${expected}T00:00:00.000Z`);
  }
});
