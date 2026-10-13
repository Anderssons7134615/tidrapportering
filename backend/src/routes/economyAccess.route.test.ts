import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { prisma } from '../lib/prisma.js';
import obsidianRoutes from './obsidianSync.js';
import usersRoutes from './users.js';
import activityRoutes from './activities.js';
import { createCustomerRoutes } from './customers.js';
import { createProjectRoutes } from './projects.js';
import { createSupplierInvoiceRoutes } from './supplierInvoices.js';

const identity = { id: 'supervisor', companyId: 'company-a', role: 'SUPERVISOR' };
async function app() {
  const server = Fastify();
  server.decorate('authenticate', async (request: any) => { request.user = { ...identity, role: request.headers['x-role'] || identity.role }; });
  return server;
}
test('supervisor gets operational customer data without customer rates or nested project economics and cannot write rates', async () => {
  const customer = { id: 'customer', companyId: identity.companyId, name: 'TEST', defaultRate: 918273, projects: [{ id: 'project', name: 'TEST', fixedPrice: 918273, defaultRate: 918273, budgetHours: 918273, billingModel: 'FIXED' }] };
  let writes = 0;
  const db: any = { customer: { findMany: async () => [customer], findUnique: async () => customer, update: async ({ data }: any) => { writes++; return { ...customer, ...data }; } }, auditLog: { create: async () => ({}) } };
  const server = await app(); await server.register(createCustomerRoutes(db), { prefix: '/customers' });
  try {
    for (const url of ['/customers', '/customers/customer']) {
      const response = await server.inject({ url }); assert.equal(response.statusCode, 200);
      for (const secret of ['918273', 'defaultRate', 'budgetHours', 'billingModel', 'fixedPrice']) assert.equal(response.body.includes(secret), false, secret);
    }
    assert.equal((await server.inject({ method: 'PUT', url: '/customers/customer', payload: { defaultRate: null } })).statusCode, 400);
    assert.equal(writes, 0);
    const saved = await server.inject({ method: 'PUT', url: '/customers/customer', payload: { name: 'Ny kund' } });
    assert.equal(saved.statusCode, 200); assert.equal(saved.json().name, 'Ny kund'); assert.equal(saved.body.includes('918273'), false);
  } finally { await server.close(); }
});

test('non-admin cannot reach invoice documents, prices, catalog exports or project money services', async () => {
  const noData = new Proxy({}, { get: () => { throw new Error('Financial data must not be queried'); } });
  const server = await app();
  await server.register(obsidianRoutes, { prefix: '/obsidian' });
  await server.register(createProjectRoutes(noData as any), { prefix: '/projects' });
  await server.register(createSupplierInvoiceRoutes(noData as any, noData as any), { prefix: '/invoices' });
  try {
    for (const role of ['SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT']) for (const request of [
      { method: 'GET', url: '/projects/project/manager-summary' },
      { method: 'GET', url: '/projects/materials/articles.xlsx' },
      { method: 'POST', url: '/projects/materials/articles/import.xlsx' },
      { method: 'POST', url: '/projects/project/materials/import.xlsx' },
      { method: 'GET', url: '/invoices' },
      { method: 'GET', url: '/obsidian/projects/project/snapshot' },
      { method: 'GET', url: '/obsidian/events' },
      { method: 'GET', url: '/invoices/invoice/document' },
      { method: 'PUT', url: '/invoices/invoice', payload: { netOre: 1 } },
    ] as const) {
      const response = await server.inject({ ...request, headers: { 'x-role': role } });
      assert.equal(response.statusCode, 403, `${role} ${request.url}: ${response.body}`);
    }
  } finally { await server.close(); }
});

test('supervisor personnel and activity endpoints omit internal cost and rate, admin retains them', async () => {
  const originals = { userList: prisma.user.findMany, userGet: prisma.user.findUnique, activityList: prisma.activity.findMany, activityGet: prisma.activity.findUnique };
  (prisma.user as any).findMany = async () => [{ id: 'user', hourlyCost: 918273, name: 'TEST' }];
  (prisma.user as any).findUnique = async () => ({ id: 'user', hourlyCost: 918273, name: 'TEST', companyId: identity.companyId });
  (prisma.activity as any).findMany = async () => [{ id: 'activity', rateOverride: 918273, name: 'TEST' }];
  (prisma.activity as any).findUnique = async () => ({ id: 'activity', companyId: identity.companyId, rateOverride: 918273, name: 'TEST' });
  const server = await app(); await server.register(usersRoutes, { prefix: '/users' }); await server.register(activityRoutes, { prefix: '/activities' });
  try {
    for (const url of ['/users', '/users/user', '/activities', '/activities/activity']) {
      const response = await server.inject({ url }); assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.body.includes('918273'), false);
      const admin = await server.inject({ url, headers: { 'x-role': 'ADMIN' } }); assert.equal(admin.body.includes('918273'), true);
    }
  } finally {
    (prisma.user as any).findMany = originals.userList; (prisma.user as any).findUnique = originals.userGet;
    (prisma.activity as any).findMany = originals.activityList; (prisma.activity as any).findUnique = originals.activityGet;
    await server.close();
  }
});
