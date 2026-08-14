import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import dashboardRoutes from './dashboard.js';
import { prisma } from '../lib/prisma.js';

const employee = { id: 'employee-1', email: 'employee@test', role: 'EMPLOYEE', companyId: 'company-a', sessionVersion: 0 };
const row = { id: 'entry-1', userId: employee.id, projectId: 'project-1', activityId: 'activity-1', date: new Date(), hours: 8, billable: true, note: null, status: 'SUBMITTED', startTime: null, endTime: null, submittedAt: null, approvedAt: null, approverId: null, rejectNote: null, createdAt: new Date(), updatedAt: new Date(), gpsLat: 1, gpsLng: 2, invoiceStatus: 'INVOICED', invoiceReference: 'F-1', approvedHourlyCostSnapshot: 500, approvedBillingRateSnapshot: 900, financialSnapshotCapturedAt: new Date(), offlineActorUserId: employee.id, offlineLocalId: 'local', offlinePayloadHash: 'hash', user: { id: employee.id, name: 'Medarbetare' }, project: { id: 'project-1', name: 'Projekt', code: '1001', site: null, customer: { id: 'customer-1', name: 'Kund' } }, activity: { id: 'activity-1', name: 'Montage', code: 'MONT' }, approver: null };

function assertSafe(value: Record<string, unknown>) {
  for (const field of ['gpsLat', 'gpsLng', 'invoiceStatus', 'invoiceReference', 'approvedHourlyCostSnapshot', 'approvedBillingRateSnapshot', 'financialSnapshotCapturedAt', 'offlineActorUserId', 'offlineLocalId', 'offlinePayloadHash']) assert.equal(field in value, false);
}

test('employee dashboard and drilldown omit financial totals and raw time-entry fields', async () => {
  const aggregate = (prisma.timeEntry as any).aggregate, findMany = (prisma.timeEntry as any).findMany, findWeekLocks = (prisma.weekLock as any).findMany;
  let calls = 0;
  (prisma.timeEntry as any).aggregate = async () => ({ _sum: { hours: 0 } });
  (prisma.timeEntry as any).findMany = async () => { calls += 1; return calls === 1 ? [] : [row]; };
  (prisma.weekLock as any).findMany = async () => [];
  const app = Fastify(); app.decorate('authenticate', async (request: any) => { request.user = employee; }); await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  try {
    const dashboard = await app.inject({ method: 'GET', url: '/api/dashboard' });
    assert.equal('weeklyBillableValue' in dashboard.json().summary, false); assertSafe(dashboard.json().recentEntries[0]);
    const drilldown = await app.inject({ method: 'GET', url: '/api/dashboard/drilldown?metric=weekly-hours&date=2026-08-14' });
    assertSafe(drilldown.json().entries[0]);
  } finally { (prisma.timeEntry as any).aggregate = aggregate; (prisma.timeEntry as any).findMany = findMany; (prisma.weekLock as any).findMany = findWeekLocks; await app.close(); }
});
