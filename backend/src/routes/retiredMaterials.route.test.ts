import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { spawn } from 'node:child_process';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectRoutes } from './projects.js';
import { createIntegrationRoutes } from './integrations.js';
import { hashIntegrationKey } from '../lib/integrationAuth.js';

const projectPaths = [
  '/materials/articles', '/materials/articles.xlsx', '/materials/template.xlsx', '/materials/articles/import-preview',
  '/materials/articles/import.xlsx', '/materials/articles/article-id', '/project-id/materials/import.xlsx',
  '/project-id/materials', '/project-id/materials/material-id',
];
const integrationPaths = ['/projects/project-id/materials', '/material-writes', '/material-writes/validate', '/material-writes/request-1234'];

test('retired project and integration material routes return 404 even for admins and old keys, without data access', async () => {
  const noData = new Proxy({}, { get: (_target, property) => { throw new Error(`Retired route queried ${String(property)}`); } });
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = { id: 'user', companyId: 'company', role: request.headers['x-role'] }; });
  await app.register(createProjectRoutes(noData as any), { prefix: '/api/projects' });
  await app.register(createIntegrationRoutes(noData as any), { prefix: '/api/integrations' });
  try {
    for (const role of ['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT']) for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      for (const url of [...projectPaths.map(path => `/api/projects${path}`), ...integrationPaths.map(path => `/api/integrations${path}`)]) {
        const response = await app.inject({ method, url, headers: { 'x-role': role, 'x-tidapp-integration-key': 'old-material-key' } });
        assert.equal(response.statusCode, 404, `${role} ${method} ${url}: ${response.body}`);
      }
    }
  } finally { await app.close(); }
});

test('production server has no purchase, inventory or calculation routes', { timeout: 30_000 }, async () => {
  // An unreachable local test database guarantees this server cannot touch real data.
  const uploadDir = await mkdtemp(join(tmpdir(), 'tidapp-retired-routes-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), windowsHide: true,
    env: { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/isolated_test', JWT_SECRET: 'isolated-test-secret-not-production', PORT: '0', UPLOAD_DIR: uploadDir, PUBLIC_UPLOADS_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  try {
    const address = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Isolated API did not start')), 20_000);
      let output = '';
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Isolated API exited ${code}`)); });
      child.stdout.on('data', chunk => {
        output += String(chunk);
        const found = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/);
        if (found) { clearTimeout(timer); resolve(found[1]); }
      });
      child.stderr.resume();
    });
    assert.equal((await fetch(`${address}/api/health`)).status, 200);
    for (const prefix of ['/api/supplier-invoices', '/api/inventory', '/api/project-calculations']) {
      for (const suffix of ['', '/items', '/project-id/editor', '/invoice-id/confirm']) for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.equal((await fetch(`${address}${prefix}${suffix}`, { method })).status, 404, `${method} ${prefix}${suffix}`);
      }
    }
  } finally { child.kill(); await exited; await rmdir(uploadDir); }
});

test('project integration still validates, creates once and replays with the shared idempotency parser', async () => {
  const customerId = '00000000-0000-4000-8000-000000000001';
  let project: any, operation: any, creates = 0, audits = 0, events = 0;
  const db: any = {
    integrationAccessKey: { findFirst: async ({ where }: any) => where.keyHash === hashIntegrationKey('project-create-key') ? { id: 'key', companyId: 'company', active: true, keyHash: where.keyHash, permission: 'PROJECT_CREATE', revokedAt: null } : null },
    customer: { findFirst: async ({ where }: any) => { assert.deepEqual(where, { id: customerId, companyId: 'company', active: true }); return { id: customerId, name: 'Provkund' }; } },
    project: {
      findMany: async ({ where }: any) => { assert.equal(where.companyId, 'company'); return []; },
      create: async ({ data }: any) => { creates++; project = { id: 'project', ...data }; return project; },
    },
    integrationProjectCreateOperation: {
      findUnique: async ({ where }: any) => { assert.equal(where.integrationAccessKeyId_idempotencyKey.integrationAccessKeyId, 'key'); return operation ?? null; },
      create: async ({ data }: any) => { operation = { id: 'op', ...data, project }; return operation; },
      findUniqueOrThrow: async () => operation,
    },
    auditLog: { create: async () => { audits++; } },
    obsidianSyncEvent: { create: async () => { events++; } },
  };
  db.$transaction = (run: any) => run(db);
  const app = Fastify(); await app.register(createIntegrationRoutes(db), { prefix: '/api/integrations' });
  const headers = { 'x-tidapp-integration-key': 'project-create-key', 'idempotency-key': 'project-request-1234' };
  const payload = { customerId, name: 'Provprojekt' };
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/integrations/project-writes/validate', headers, payload })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/integrations/project-writes', headers: { ...headers, 'idempotency-key': 'short' }, payload })).statusCode, 400);
    const first = await app.inject({ method: 'POST', url: '/api/integrations/project-writes', headers, payload });
    assert.equal(first.statusCode, 201, first.body);
    const again = await app.inject({ method: 'POST', url: '/api/integrations/project-writes', headers, payload });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().project.id, first.json().project.id);
    assert.deepEqual([creates, audits, events], [1, 1, 1]);
    assert.equal((await app.inject({ method: 'GET', url: '/api/integrations/project-writes/project-request-1234', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/integrations/project-writes', headers, payload: { ...payload, name: 'Annat projekt' } })).statusCode, 409);
    assert.deepEqual([creates, audits, events], [1, 1, 1]);
  } finally { await app.close(); }
});
