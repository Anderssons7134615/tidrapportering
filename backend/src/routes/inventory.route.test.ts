import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { createInventoryRoutes } from './inventory.js';

async function setup(t: TestContext, { exists = true, visible = true, companyId = 'company-a', active = true } = {}) {
  const article = { id: randomUUID(), companyId, name: 'Testartikel', unit: 'm', active, employeeVisible: visible };
  const item = { id: randomUUID(), companyId, articleId: article.id, unit: 'm', shelf: 'A1', revision: 1 };
  const actorId = randomUUID();
  const movements: any[] = [], audits: any[] = [], articleQueries: any[] = [];
  let balanceMilli = 10000, calls = 0, present = exists;
  const matchesItem = (where: any) => present && where.id === item.id && where.companyId === item.companyId && (!where.article?.employeeVisible || article.employeeVisible);
  const db: any = {
    materialArticle: { findFirst: async ({ where }: any) => {
      calls++; articleQueries.push(where);
      return where.id === article.id && where.companyId === article.companyId && (!where.active || article.active) && (!where.employeeVisible || article.employeeVisible) ? article : null;
    } },
    inventoryItem: {
      findFirst: async ({ where }: any) => { calls++; return matchesItem(where) ? { ...item, article } : null; },
      create: async ({ data }: any) => { calls++; Object.assign(item, data); present = true; balanceMilli = 0; return item; },
      updateMany: async ({ where, data }: any) => {
        calls++;
        if (!matchesItem(where) || where.revision !== item.revision) return { count: 0 };
        if (data.shelf !== undefined) item.shelf = data.shelf;
        item.revision += data.revision.increment;
        return { count: 1 };
      },
    },
    inventoryMovement: {
      findUnique: async ({ where }: any) => { calls++; return movements.find(row => row.companyId === where.companyId_requestKey.companyId && row.requestKey === where.companyId_requestKey.requestKey) || null; },
      aggregate: async ({ where }: any) => { calls++; assert.equal(where.companyId, 'company-a'); assert.equal(where.itemId, item.id); return { _sum: { deltaMilli: balanceMilli } }; },
      create: async ({ data }: any) => { calls++; const row = { id: randomUUID(), createdAt: new Date(), ...data }; movements.push(row); balanceMilli += row.deltaMilli; return row; },
    },
    auditLog: { create: async ({ data }: any) => { calls++; audits.push(data); return data; } },
    $transaction: async (callback: any) => {
      calls++;
      const snapshot = { item: { ...item }, balanceMilli, present, movements: movements.length, audits: audits.length };
      try { return await callback(db); }
      catch (error) { Object.assign(item, snapshot.item); balanceMilli = snapshot.balanceMilli; present = snapshot.present; movements.length = snapshot.movements; audits.length = snapshot.audits; throw error; }
    },
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any, reply: any) => {
    const role = request.headers['x-test-role'];
    if (!role) return reply.code(401).send({ error: 'Logga in' });
    request.user = { id: actorId, companyId: 'company-a', role };
  });
  await app.register(createInventoryRoutes(db), { prefix: '/api/inventory' });
  t.after(() => app.close());
  return { app, item, article, actorId, movements, audits, articleQueries, calls: () => calls, balance: () => balanceMilli / 1000 };
}

const headers = { 'x-test-role': 'EMPLOYEE' };
test('employee creates a visible warehouse article and edits its shelf with an audit trail', async t => {
  const c = await setup(t, { exists: false });
  const created = await c.app.inject({ method: 'POST', url: '/api/inventory/items', headers, payload: { articleId: c.article.id, shelf: ' B2 ' } });
  assert.equal(created.statusCode, 201, created.body);
  assert.deepEqual(created.json(), { id: c.item.id });
  assert.equal(c.balance(), 0);
  assert.deepEqual(c.articleQueries[0], { id: c.article.id, companyId: 'company-a', active: true, employeeVisible: true });
  const edited = await c.app.inject({ method: 'PATCH', url: `/api/inventory/items/${c.item.id}`, headers, payload: { revision: 1, shelf: ' C3 ' } });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal(c.item.shelf, 'C3');
  assert.equal(c.item.revision, 2);
  assert.deepEqual(c.audits.map(row => [row.action, row.userId]), [['CREATE', c.actorId], ['UPDATE', c.actorId]]);
  assert.equal(c.movements.length, 0, 'creating or moving a shelf must not invent a starting balance');
});

test('employee receipts and counts preserve revisions, idempotency and actor audit', async t => {
  const c = await setup(t);
  const url = `/api/inventory/items/${c.item.id}/movements`;
  const receipt = { kind: 'RECEIPT', quantity: 2.125, revision: 1, requestKey: randomUUID(), note: 'Inlevererat' };
  const first = await c.app.inject({ method: 'POST', url, headers, payload: receipt });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(c.balance(), 12.125);
  assert.deepEqual((await c.app.inject({ method: 'POST', url, headers, payload: receipt })).json(), first.json());
  assert.equal(c.movements.length, 1);
  assert.equal((await c.app.inject({ method: 'POST', url, headers, payload: { ...receipt, requestKey: randomUUID() } })).statusCode, 409);
  assert.equal((await c.app.inject({ method: 'POST', url, headers, payload: { kind: 'COUNT', quantity: 0, revision: 2, requestKey: randomUUID() } })).statusCode, 400);
  const counted = await c.app.inject({ method: 'POST', url, headers, payload: { kind: 'COUNT', quantity: 0, revision: 2, requestKey: randomUUID(), note: 'Kontrollräknat tomt' } });
  assert.equal(counted.statusCode, 201, counted.body);
  assert.equal(c.balance(), 0);
  assert.equal(c.item.revision, 3);
  assert.deepEqual(c.movements.map(row => [row.kind, row.createdByUserId, row.companyId]), [['RECEIPT', c.actorId, 'company-a'], ['COUNT', c.actorId, 'company-a']]);
  assert.deepEqual(c.audits.map(row => row.action), ['RECEIPT', 'COUNT']);
  assert.equal(first.body.includes('purchasePrice'), false);
});

test('employee warehouse writes cannot reach hidden or foreign material and stock', async t => {
  for (const scope of [{ visible: false }, { companyId: 'company-b' }]) {
    const c = await setup(t, scope);
    assert.equal((await c.app.inject({ method: 'POST', url: '/api/inventory/items', headers, payload: { articleId: c.article.id } })).statusCode, 400);
    assert.equal((await c.app.inject({ method: 'PATCH', url: `/api/inventory/items/${c.item.id}`, headers, payload: { revision: 1, shelf: 'No access' } })).statusCode, 404);
    for (const kind of ['RECEIPT', 'COUNT']) {
      assert.equal((await c.app.inject({ method: 'POST', url: `/api/inventory/items/${c.item.id}/movements`, headers, payload: { kind, quantity: 1, revision: 1, requestKey: randomUUID(), note: 'Test' } })).statusCode, 404);
    }
    assert.equal(c.movements.length, 0); assert.equal(c.audits.length, 0); assert.equal(c.item.revision, 1);
  }
  const inactive = await setup(t, { active: false });
  assert.equal((await inactive.app.inject({ method: 'POST', url: '/api/inventory/items', headers, payload: { articleId: inactive.article.id } })).statusCode, 400);
});

test('accountant and unauthenticated requests still cannot perform any warehouse action', async t => {
  const c = await setup(t);
  for (const [role, expected] of [['ACCOUNTANT', 403], ['', 401]] as const) {
    const restrictedHeaders = role ? { 'x-test-role': role } : {};
    const requests = [
      { method: 'GET' as const, url: '/api/inventory/items' },
      { method: 'POST' as const, url: '/api/inventory/items', payload: { articleId: c.article.id } },
      { method: 'PATCH' as const, url: `/api/inventory/items/${c.item.id}`, payload: { revision: 1, shelf: 'Blocked' } },
      ...['RECEIPT', 'COUNT', 'ISSUE', 'RETURN'].map(kind => ({ method: 'POST' as const, url: `/api/inventory/items/${c.item.id}/movements`, payload: { kind, quantity: 1, revision: 1, requestKey: randomUUID(), note: 'Test' } })),
    ];
    for (const request of requests) assert.equal((await c.app.inject({ ...request, headers: restrictedHeaders })).statusCode, expected);
  }
  assert.equal(c.calls(), 0);
});
