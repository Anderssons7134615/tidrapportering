import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { hashIntegrationKey } from '../lib/integrationAuth.js';
import { createIntegrationRoutes } from './integrations.js';
import type { prisma } from '../lib/prisma.js';

test('customer list requires a valid READ_ONLY key and stays within its company', async () => {
  let reads = 0;
  let query: unknown;
  const keys = [
    { plain: 'read-key', permission: 'READ_ONLY', active: true, revokedAt: null },
    { plain: 'create-key', permission: 'PROJECT_CREATE', active: true, revokedAt: null },
    { plain: 'revoked-key', permission: 'READ_ONLY', active: true, revokedAt: new Date() },
  ];
  const db = {
    integrationAccessKey: { findFirst: async ({ where }: { where: { keyHash: string } }) => {
      const found = keys.find(key => hashIntegrationKey(key.plain) === where.keyHash);
      return found ? { id: found.plain, companyId: 'company-from-key', active: found.active, permission: found.permission, keyHash: where.keyHash, revokedAt: found.revokedAt } : null;
    } },
    customer: { findMany: async (args: unknown) => { reads += 1; query = args; return [{ id: 'customer-1', name: 'Exempel', contactPerson: null, email: null, phone: null, address: null, active: true }]; } },
  };
  const app = Fastify();
  await app.register(createIntegrationRoutes(db as unknown as typeof prisma), { prefix: '/api/integrations' });
  try {
    const url = '/api/integrations/customers/list';
    for (const plain of [null, 'unknown-key', 'revoked-key']) {
      const response = await app.inject({ method: 'GET', url, headers: plain ? { 'x-tidapp-integration-key': plain } : {} });
      assert.equal(response.statusCode, 401);
    }
    assert.equal((await app.inject({ method: 'GET', url, headers: { 'x-tidapp-integration-key': 'create-key' } })).statusCode, 403);
    assert.equal(reads, 0);
    const response = await app.inject({ method: 'GET', url, headers: { 'x-tidapp-integration-key': 'read-key' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { items: [{ id: 'customer-1', name: 'Exempel', contactPerson: null, email: null, phone: null, address: null, active: true }] });
    assert.equal(reads, 1);
    assert.deepEqual((query as { where: unknown }).where, { companyId: 'company-from-key' });
  } finally { await app.close(); }
});
