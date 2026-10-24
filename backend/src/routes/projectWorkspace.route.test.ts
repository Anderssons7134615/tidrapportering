import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createProjectTaskRoutes } from './projectTasks.js';

const stamp = new Date('2026-10-01T12:00:00Z');
const project = (i: number) => ({ id: `p-${i}`, code: String(i), name: `Projekt ${i}`, companyId: 'company-a', active: i % 2 === 0, status: 'ONGOING', site: null, notes: i === 0 ? 'Äldre anteckning' : null, updatedAt: stamp, customer: null, employeeCanSeeResults: i !== 0 });
async function setup(role = 'ADMIN', authenticated = true) {
  const calls: Array<{ model: string; args: any }> = [];
  const read = (model: string, result: any) => async (args: any) => { calls.push({ model, args }); return result; };
  // Missing economy/material methods are intentional: touching them must fail.
  const db = {
    project: { findMany: read('projects', Array.from({ length: 251 }, (_, i) => project(i))) },
    projectTask: { findMany: read('tasks', []) },
    projectUpdate: { findMany: read('updates', [{ id: 'n1', projectId: 'p-0', type: 'NOTE', content: 'Sparad anteckning', occurredAt: stamp, createdAt: stamp, source: 'TIDAPP', createdByUser: null }]) },
    timeEntry: { groupBy: read('hours', [
      { projectId: 'p-0', status: 'APPROVED', _sum: { hours: 1.125 } },
      { projectId: 'p-0', status: 'DRAFT', _sum: { hours: 0.125 } },
      { projectId: 'p-1', status: 'APPROVED', _sum: { hours: 2.25 } },
    ]) },
  };
  const app = Fastify();
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authenticated) return reply.code(401).send({ error: 'Logga in' });
    req.user = { id: 'u1', role, companyId: 'company-a' };
  });
  await app.register(createProjectTaskRoutes(db as any), { prefix: '/api' });
  return { app, calls };
}

test('workspace returns every original project once, including archives and projects without tasks, using hours-only reads', async () => {
  const { app, calls } = await setup();
  try {
    const response = await app.inject('/api/project-workspace');
    assert.equal(response.statusCode, 200);
    const { items } = response.json();
    assert.equal(items.length, 251);
    assert.equal(new Set(items.map((p: any) => p.id)).size, 251);
    assert.deepEqual(items.map((p: any) => p.id), Array.from({ length: 251 }, (_, i) => `p-${i}`));
    assert.ok(items.some((p: any) => !p.active));
    assert.equal(items[0].notes, 'Äldre anteckning');
    assert.equal(items[0].updates[0].id, 'n1');
    assert.deepEqual(items[0].hours, { reported: 1.25, approved: 1.125 });
    assert.deepEqual(items[2].hours, { reported: 0, approved: 0 });
    const read = calls.find(c => c.model === 'projects')!.args;
    assert.deepEqual(read.where, { companyId: 'company-a' });
    assert.equal(read.take, undefined);
    assert.equal(read.skip, undefined);
    for (const field of ['fixedPrice', 'defaultRate', 'budgetHours', 'billingModel']) assert.equal(read.select[field], undefined);
    const hours = calls.find(c => c.model === 'hours')!.args;
    assert.deepEqual(hours.by, ['projectId', 'status']);
    assert.equal(hours.where.project.companyId, 'company-a');
    assert.doesNotMatch(response.body, /fixedPrice|defaultRate|materialCost|laborCost|budgetHours|revenue/);
  } finally { await app.close(); }
});

test('workspace preserves role and company boundaries without granting employee access to archives or hidden hours', async () => {
  for (const role of ['EMPLOYEE', 'SUPERVISOR', 'ACCOUNTANT']) {
    const { app, calls } = await setup(role);
    try {
      const response = await app.inject('/api/project-workspace');
      if (role === 'ACCOUNTANT') { assert.equal(response.statusCode, 403); assert.equal(calls.length, 0); continue; }
      assert.equal(response.statusCode, 200);
      const items = response.json().items;
      assert.deepEqual(calls.find(c => c.model === 'projects')!.args.where, { companyId: 'company-a', ...(role === 'EMPLOYEE' ? { active: true } : {}) });
      assert.equal(calls.find(c => c.model === 'tasks')!.args.where.companyId, 'company-a');
      assert.equal(calls.find(c => c.model === 'updates')!.args.where.companyId, 'company-a');
      if (role === 'EMPLOYEE') {
        assert.equal(calls.find(c => c.model === 'tasks')!.args.where.assigneeId, 'u1');
        assert.deepEqual(items[0].hours, { reported: null, approved: null });
      } else assert.deepEqual(items[0].hours, { reported: null, approved: 1.125 });
      assert.equal(calls.find(c => c.model === 'hours')!.args.where.status, 'APPROVED');
      assert.equal(items[1].hours.reported, null);
    } finally { await app.close(); }
  }
});

test('legacy management can opt out of economy without consulting material or invoice tables', async () => {
  const app = Fastify();
  app.decorate('authenticate', async (req: any) => { req.user = { id: 'u1', role: 'ADMIN', companyId: 'company-a' }; });
  const db = {
    project: { findMany: async () => [project(0)] },
    projectTask: { findMany: async () => [] },
    timeEntry: { groupBy: async () => [] },
    projectUpdate: { groupBy: async () => [] },
  };
  await app.register(createProjectTaskRoutes(db as any), { prefix: '/api' });
  try {
    const response = await app.inject('/api/project-control/projects?includeEconomy=false');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().items.map((item: any) => item.id), ['p-0']);
    assert.equal(Object.hasOwn(response.json().summary, 'invoiceDraftCount'), false);
  } finally { await app.close(); }
});

test('workspace authenticates before reading any data', async () => {
  const { app, calls } = await setup('ADMIN', false);
  try { assert.equal((await app.inject('/api/project-workspace')).statusCode, 401); assert.equal(calls.length, 0); }
  finally { await app.close(); }
});
