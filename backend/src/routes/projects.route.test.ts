import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createProjectRoutes } from './projects.js';

const baseline = { id: 'project-1', companyId: 'company-a', name: 'Testprojekt', code: '0042', status: 'ONGOING', active: true, site: 'Plats', notes: 'Anteckning', budgetHours: 80, customerId: null };

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
