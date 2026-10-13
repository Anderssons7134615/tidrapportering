import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createProjectRoutes } from './projects.js';

const baseline = { id: 'project-1', companyId: 'company-a', name: 'Testprojekt', code: '0042', status: 'ONGOING', active: true, site: 'Plats', notes: 'Anteckning', budgetHours: 80, customerId: null };

test('project choices keep company and active scope without financial or metrics queries', async () => {
  const calls: any[] = [];
  const choices = [{ id: 'project-1', code: '0042', name: 'Testprojekt', customer: { id: 'customer-1', name: 'Testkund' } }];
  // Only this read exists: an accidental metrics/finance call fails the request.
  const db: any = { project: { findMany: async (query: any) => { calls.push(query); return choices; } } };
  const app = Fastify();
  app.decorate('authenticate', async (request: any, reply: any) => {
    if (!request.headers['x-test-role']) return reply.code(401).send({ error: 'Logga in' });
    request.user = { id: 'user-1', companyId: 'company-a', role: request.headers['x-test-role'] };
  });
  await app.register(createProjectRoutes(db), { prefix: '/api/projects' });
  try {
    for (const role of ['ADMIN', 'SUPERVISOR', 'EMPLOYEE']) {
      const response = await app.inject({ method: 'GET', url: '/api/projects/options?companyId=company-b&active=false', headers: { 'x-test-role': role } });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), choices);
      assert.deepEqual(calls.at(-1), {
        where: { companyId: 'company-a', active: true },
        select: { id: true, code: true, name: true, customer: { select: { id: true, name: true } } },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      });
    }
    for (const [role, expected] of [['ACCOUNTANT', 403], ['', 401]] as const) {
      const response = await app.inject({ method: 'GET', url: '/api/projects/options', headers: role ? { 'x-test-role': role } : {} });
      assert.equal(response.statusCode, expected);
    }
    assert.equal(calls.length, 3);
  } finally { await app.close(); }
});

async function setupCreation(failAt = '', customerActive = true) {
  const rows: any[] = [];
  const audits: any[] = [];
  const events: any[] = [];
  const customerId = '11111111-1111-4111-8111-111111111111';
  const customerQueries: any[] = [];
  const db: any = {
    project: {
      findMany: async ({ where }: any) => rows.filter((row) => row.companyId === where.companyId),
      findUnique: async ({ where }: any) => rows.find((row) => row.companyId === where.companyId_code.companyId && row.code === where.companyId_code.code) || null,
      create: async ({ data }: any) => { const row = { id: `created-${rows.length}`, active: true, status: 'PLANNED', billingModel: 'HOURLY', ...data }; rows.push(row); return row; },
    },
    customer: {
      findFirst: async ({ where }: any) => where.id === customerId && where.companyId === 'company-a' && (where.active !== true || customerActive) ? { id: customerId } : null,
      findMany: async (query: any) => { customerQueries.push(query); return [{ id: customerId, name: 'Kund' }]; },
    },
    auditLog: { create: async ({ data }: any) => { if (failAt === 'audit') throw new Error('Audit failed'); audits.push(data); return data; } },
    obsidianSyncEvent: { create: async ({ data }: any) => { if (failAt === 'sync') throw new Error('Sync failed'); events.push(data); return data; } },
    $transaction: async (callback: any) => {
      const counts = [rows.length, audits.length, events.length];
      try { return await callback(db); }
      catch (error) { [rows.length, audits.length, events.length] = counts; throw error; }
    },
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = { id: 'employee-1', role: request.headers['x-test-role'] || 'EMPLOYEE', companyId: 'company-a' }; });
  await app.register(createProjectRoutes(db), { prefix: '/api/projects' });
  return { app, rows, audits, events, customerId, customerQueries };
}

test('employee cannot create a project for an inactive customer', async () => {
  const { app, rows, customerId } = await setupCreation('', false);
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Nytt jobb', customerId } })).statusCode, 400);
    assert.equal(rows.length, 0);
  } finally { await app.close(); }
});

for (const failure of ['audit', 'sync']) test(`project creation rolls back on ${failure} failure including retries`, async () => {
  const { app, rows, audits, events } = await setupCreation(failure);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Nytt jobb' } })).statusCode, 500);
      assert.equal(rows.length, 0);
      assert.equal(audits.length, 0);
      assert.equal(events.length, 0);
    }
  } finally { await app.close(); }
});

test('employee creates a company-scoped project with automatic number and audit', async () => {
  const { app, rows, audits, events, customerId } = await setupCreation();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: ' Nytt jobb ', customerId, site: 'Panncentral' } });
    assert.equal(response.statusCode, 201);
    assert.equal(rows[0].name, 'Nytt jobb');
    assert.equal(rows[0].companyId, 'company-a');
    assert.ok(rows[0].code);
    assert.equal(rows[0].active, true);
    assert.equal(rows[0].employeeCanSeeResults, false);
    assert.equal(response.json().billingModel, null);
    assert.equal(audits[0].userId, 'employee-1');
    assert.equal(events[0].companyId, 'company-a');
    const second = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Nästa jobb' } });
    assert.equal(second.statusCode, 201);
    assert.notEqual(rows[0].code, rows[1].code);
  } finally { await app.close(); }
});

test('employee cannot set financials, visibility, status, company or project code when creating', async () => {
  const { app, rows } = await setupCreation();
  try {
    for (const extra of [{ defaultRate: 1 }, { budgetHours: 1 }, { fixedPrice: 1 }, { billingModel: 'FIXED' }, { employeeCanSeeResults: true }, { companyId: 'company-b' }, { status: 'COMPLETED' }, { code: '9999' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Jobb', ...extra } });
      assert.equal(response.statusCode, 400, JSON.stringify(extra));
    }
    assert.equal(rows.length, 0);
  } finally { await app.close(); }
});

test('project creation rejects another company customer and accountant role', async () => {
  const { app, rows } = await setupCreation();
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Jobb', customerId: '22222222-2222-4222-8222-222222222222' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects', headers: { 'x-test-role': 'ACCOUNTANT' }, payload: { name: 'Jobb' } })).statusCode, 403);
    assert.equal(rows.length, 0);
  } finally { await app.close(); }
});

test('customer choices select only active company customer ids and names', async () => {
  const { app, customerQueries } = await setupCreation();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/projects/customer-options' })).statusCode, 200);
    assert.deepEqual(customerQueries[0], { where: { companyId: 'company-a', active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    assert.equal((await app.inject({ method: 'GET', url: '/api/projects/customer-options', headers: { 'x-test-role': 'ACCOUNTANT' } })).statusCode, 403);
  } finally { await app.close(); }
});

for (const role of ['ADMIN']) test(`${role} retains full project creation`, async () => {
  const { app, rows } = await setupCreation();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/projects', headers: { 'x-test-role': role }, payload: { name: 'Jobb', code: 'X1', defaultRate: 700, budgetHours: 10, employeeCanSeeResults: true } });
    assert.equal(response.statusCode, 201);
    assert.equal(rows[0].defaultRate, 700);
    assert.equal(response.json().defaultRate, 700);
  } finally { await app.close(); }
});

async function setup({ companyId = 'company-a', active = true, failAudit = false } = {}) {
  let row = { ...baseline, companyId, active };
  const audits: any[] = [];
  const events: any[] = [];
  const db: any = {
    project: {
      findUnique: async () => ({ ...row }),
      findFirst: async ({ where }: any) => row.companyId === where.companyId ? { ...row } : null,
      update: async ({ data }: any) => (row = { ...row, ...data }),
    },
    customer: { findFirst: async () => null },
    auditLog: { create: async ({ data }: any) => { if (failAudit) throw new Error('Audit unavailable'); audits.push(data); return data; } },
    obsidianSyncEvent: { create: async ({ data }: any) => { events.push(data); return data; } },
    $transaction: async (callback: any) => {
      const previous = { ...row };
      const auditCount = audits.length;
      const eventCount = events.length;
      try { return await callback(db); }
      catch (error) { row = previous; audits.length = auditCount; events.length = eventCount; throw error; }
    },
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { id: 'user-1', companyId: 'company-a', role: request.headers['x-test-role'] || 'ADMIN' };
  });
  await app.register(createProjectRoutes(db), { prefix: '/api/projects' });
  return { app, audits, events, row: () => row };
}

test('project edit persists explicit nulls and records the same successful change', async () => {
  const { app, row, audits, events } = await setup();
  try {
    const response = await app.inject({ method: 'PUT', url: '/api/projects/project-1', payload: { site: null, notes: null, budgetHours: null, customerId: null } });
    assert.equal(response.statusCode, 200);
    assert.equal(row().site, null);
    assert.equal(row().notes, null);
    assert.equal(row().budgetHours, null);
    assert.equal(audits.length, 1);
    assert.equal(events.length, 1);
  } finally { await app.close(); }
});

test('archive and restore preserve project status and historical fields', async () => {
  const { app, row, audits, events } = await setup();
  try {
    const archived = await app.inject({ method: 'DELETE', url: '/api/projects/project-1' });
    assert.equal(archived.statusCode, 200);
    assert.deepEqual(row(), { ...baseline, active: false });
    const restored = await app.inject({ method: 'POST', url: '/api/projects/project-1/restore' });
    assert.equal(restored.statusCode, 200);
    assert.deepEqual(row(), baseline);
    assert.equal(audits.length, 2);
    assert.equal(events.length, 2);
    assert.deepEqual(JSON.parse(audits[1].newValue), { active: true });
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects/project-1/restore' })).statusCode, 200);
    assert.equal(audits.length, 2, 'repeat restore does not duplicate audit');
  } finally { await app.close(); }
});

for (const role of ['EMPLOYEE', 'ACCOUNTANT']) test(`${role} cannot edit, archive or restore projects`, async () => {
  const { app, row, audits } = await setup();
  try {
    for (const method of ['PUT', 'DELETE', 'POST'] as const) {
      const response = await app.inject({ method, url: `/api/projects/project-1${method === 'POST' ? '/restore' : ''}`, headers: { 'x-test-role': role }, ...(method === 'PUT' ? { payload: { name: 'Ändrat' } } : {}) });
      assert.equal(response.statusCode, 403);
    }
    assert.deepEqual(row(), baseline);
    assert.equal(audits.length, 0);
  } finally { await app.close(); }
});

test('another company cannot edit, archive or restore a project', async () => {
  const { app, audits } = await setup({ companyId: 'company-b' });
  try {
    for (const method of ['PUT', 'DELETE', 'POST'] as const) {
      const response = await app.inject({ method, url: `/api/projects/project-1${method === 'POST' ? '/restore' : ''}`, ...(method === 'PUT' ? { payload: { name: 'Ändrat' } } : {}) });
      assert.equal(response.statusCode, 404);
    }
    assert.equal(audits.length, 0);
  } finally { await app.close(); }
});

for (const operation of ['edit', 'archive', 'restore']) test(`${operation} rolls back if its audit cannot be saved`, async () => {
  const { app, row, events } = await setup({ active: operation !== 'restore', failAudit: true });
  const before = { ...row() };
  try {
    const response = await app.inject({ method: operation === 'edit' ? 'PUT' : operation === 'archive' ? 'DELETE' : 'POST', url: `/api/projects/project-1${operation === 'restore' ? '/restore' : ''}`, ...(operation === 'edit' ? { payload: { name: 'Ändrat' } } : {}) });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(row(), before);
    assert.equal(events.length, 0);
  } finally { await app.close(); }
});


test('supervisor can create operational projects but cannot send financial fields', async () => {
  const { app, rows } = await setupCreation();
  try {
    for (const field of ['fixedPrice', 'defaultRate', 'budgetHours', 'billingModel']) {
      const response = await app.inject({ method: 'POST', url: '/api/projects', headers: { 'x-test-role': 'SUPERVISOR' }, payload: { name: 'Jobb', code: 'S1', [field]: field === 'billingModel' ? 'FIXED' : 12345 } });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(rows.length, 0);
    const response = await app.inject({ method: 'POST', url: '/api/projects', headers: { 'x-test-role': 'SUPERVISOR' }, payload: { name: 'Jobb', code: 'S1', employeeCanSeeResults: true } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().defaultRate, null);
  } finally { await app.close(); }
});
