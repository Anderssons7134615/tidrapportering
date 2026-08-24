import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import weekLockRoutes from './weekLocks.js';
import { prisma } from '../lib/prisma.js';

const actor = {
  ADMIN: { id: 'reviewer-1', email: 'admin@test', role: 'ADMIN', companyId: 'company-a', sessionVersion: 0 },
  SUPERVISOR: { id: 'reviewer-1', email: 'supervisor@test', role: 'SUPERVISOR', companyId: 'company-a', sessionVersion: 0 },
} as const;

async function appWithRole() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    const role = String(request.headers['x-test-role'] || 'ADMIN') as keyof typeof actor;
    request.user = actor[role];
  });
  await app.register(weekLockRoutes, { prefix: '/api/week-locks' });
  return app;
}

test('admin can approve own submitted week while supervisor self approval stays blocked', async () => {
  const originalFindFirst = (prisma.weekLock as any).findFirst;
  const originalTransaction = (prisma as any).$transaction;
  const weekStartDate = new Date('2026-08-17T00:00:00.000Z');
  const lock = { id: 'lock-1', userId: 'reviewer-1', weekStartDate, status: 'SUBMITTED' };
  const entries = Array.from({ length: 5 }, (_, index) => ({
    id: `entry-${index + 1}`,
    userId: lock.userId,
    date: new Date(Date.UTC(2026, 7, 17 + index)),
    hours: 8,
    status: 'SUBMITTED',
    user: { hourlyCost: 500 },
    activity: { rateOverride: 850 },
    project: { defaultRate: null, customer: null },
  }));
  let lockWhere: any;
  let transactionCount = 0;
  let lockUpdate: any;
  const entryUpdates: any[] = [];
  let auditValue: any;

  (prisma.weekLock as any).findFirst = async (args: any) => {
    lockWhere = args.where;
    return lock;
  };
  (prisma as any).$transaction = async (callback: any) => {
    transactionCount += 1;
    return callback({
      timeEntry: {
        findMany: async () => entries,
        update: async (args: any) => { entryUpdates.push(args); return args.data; },
      },
      weekLock: {
        updateMany: async (args: any) => { lockUpdate = args; return { count: 1 }; },
        findUniqueOrThrow: async () => ({ ...lock, status: 'APPROVED' }),
      },
      auditLog: {
        create: async (args: any) => { auditValue = JSON.parse(args.data.newValue); return args.data; },
      },
    });
  };

  const app = await appWithRole();
  try {
    const adminResponse = await app.inject({ method: 'POST', url: '/api/week-locks/lock-1/approve', headers: { 'x-test-role': 'ADMIN' } });
    assert.equal(adminResponse.statusCode, 200);
    assert.deepEqual(lockWhere, { id: 'lock-1', user: { companyId: 'company-a' } });
    assert.equal(transactionCount, 1);
    assert.deepEqual(lockUpdate.where, { id: 'lock-1', status: 'SUBMITTED' });
    assert.equal(lockUpdate.data.reviewerId, 'reviewer-1');
    assert.equal(entryUpdates.length, 5);
    assert.equal(entryUpdates.every((update) => update.data.status === 'APPROVED' && update.data.approverId === 'reviewer-1'), true);
    assert.deepEqual(auditValue, { status: 'APPROVED', selfApproval: true });

    const supervisorResponse = await app.inject({ method: 'POST', url: '/api/week-locks/lock-1/approve', headers: { 'x-test-role': 'SUPERVISOR' } });
    assert.equal(supervisorResponse.statusCode, 403);
    assert.equal(supervisorResponse.json().error, 'Endast admin kan godkänna sin egen vecka. Arbetsledare behöver en annan attestant.');
    assert.equal(transactionCount, 1);
  } finally {
    (prisma.weekLock as any).findFirst = originalFindFirst;
    (prisma as any).$transaction = originalTransaction;
    await app.close();
  }
});
