import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createProjectCalculationRoutes } from './projectCalculations.js';
import { calculationFixture } from '../lib/projectCalculationFixture.js';
import { createCalculationEditorRoutes } from './calculationEditor.js';

test('every calculation endpoint rejects non-admin before accessing any database data', async () => {
  const noData = new Proxy({}, { get() { throw new Error('Do not query internal estimates'); } });
  const app = Fastify();
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!req.headers['x-role']) return reply.code(401).send({ error: 'Login required' });
    req.user = { id: 'user', companyId: 'company', role: req.headers['x-role'] };
  });
  await app.register(createProjectCalculationRoutes(noData as any));
  await app.register(createCalculationEditorRoutes(noData as any));
  try {
    for (const role of [undefined, 'EMPLOYEE', 'SUPERVISOR', 'ACCOUNTANT']) for (const [method, url] of [['GET', '/p'], ['GET', '/p/c'], ['POST', '/p/preview'], ['POST', '/p/import'], ['GET', '/p/editor'], ['GET', '/p/editor/id'], ['POST', '/p/editor/id/preview'], ['PUT', '/p/editor/id'], ['POST', '/p/editor/id/lock']] as const) {
      assert.equal((await app.inject({ method, url, headers: role ? { 'x-role': role } : {} })).statusCode, role ? 403 : 401);
    }
  } finally { await app.close(); }
});

test('preview checks company scope, never writes, and inactive projects cannot import', async () => {
  const app = Fastify(); let active = true;
  app.decorate('authenticate', async (req: any) => { req.user = { id: 'user', companyId: 'company', role: 'ADMIN' }; });
  const db: any = { project: { findFirst: async ({ where }: any) => { assert.equal(where.companyId, 'company'); return where.id === 'p' ? { id: 'p', active } : null; } } };
  await app.register(createProjectCalculationRoutes(db));
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/foreign/preview', payload: calculationFixture() })).statusCode, 404);
    const preview = await app.inject({ method: 'POST', url: '/p/preview', payload: calculationFixture() });
    assert.equal(preview.statusCode, 200); assert.equal(preview.json().totals.directCost, 1125.23);
    active = false;
    assert.equal((await app.inject({ method: 'POST', url: '/p/preview', payload: calculationFixture() })).statusCode, 409);
    assert.equal((await app.inject({ method: 'PUT', url: '/p/calculation', payload: {} })).statusCode, 404);
    assert.equal((await app.inject({ method: 'DELETE', url: '/p/calculation' })).statusCode, 404);
  } finally { await app.close(); }
});
