import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createCustomerRoutes } from './customers.js';

const users = {
  ADMIN: { id: 'admin-1', email: 'admin@test', role: 'ADMIN', companyId: 'company-a', sessionVersion: 0 },
  ACCOUNTANT: { id: 'accountant-1', email: 'accountant@test', role: 'ACCOUNTANT', companyId: 'company-a', sessionVersion: 0 },
} as const;

async function appWith(db: any) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = users[String(request.headers['x-test-role'] || 'ADMIN') as keyof typeof users];
  });
  await app.register(createCustomerRoutes(db), { prefix: '/api/customers' });
  return app;
}

test('accountant cannot access customer register or raw project details', async () => {
  let findUniqueCalled = false;
  const app = await appWith({ customer: { findMany: async () => [], findUnique: async () => { findUniqueCalled = true; return null; } } });
  for (const url of ['/api/customers', '/api/customers/customer-1']) {
    const response = await app.inject({ method: 'GET', url, headers: { 'x-test-role': 'ACCOUNTANT' } });
    assert.equal(response.statusCode, 403);
  }
  assert.equal(findUniqueCalled, false);
  await app.close();
});

test('admin can still read a customer with projects', async () => {
  const app = await appWith({ customer: { findUnique: async () => ({ id: 'customer-1', companyId: 'company-a', name: 'Kund', projects: [] }) } });
  const response = await app.inject({ method: 'GET', url: '/api/customers/customer-1', headers: { 'x-test-role': 'ADMIN' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().name, 'Kund');
  await app.close();
});
