import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import timeEntryRoutes from './timeEntries.js';
import { prisma } from '../lib/prisma.js';

const employee = { id: 'employee-1', email: 'employee@test', role: 'EMPLOYEE', companyId: 'company-a', sessionVersion: 0 };

test('delete checks approved status inside the serializable transaction', async () => {
  const originalTransaction = (prisma as any).$transaction;
  let deleted = false;
  (prisma as any).$transaction = async (callback: any) => callback({
    timeEntry: {
      findFirst: async () => ({ id: 'entry-1', userId: employee.id, projectId: null, date: new Date('2026-08-10T00:00:00.000Z'), hours: 8, status: 'APPROVED', attachments: [] }),
      delete: async () => { deleted = true; },
    },
  });
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = employee; });
  await app.register(timeEntryRoutes, { prefix: '/api/time-entries' });
  try {
    const response = await app.inject({ method: 'DELETE', url: '/api/time-entries/entry-1' });
    assert.equal(response.statusCode, 409);
    assert.equal(deleted, false);
  } finally {
    (prisma as any).$transaction = originalTransaction;
    await app.close();
  }
});
