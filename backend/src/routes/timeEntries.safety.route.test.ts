import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import timeEntryRoutes from './timeEntries.js';
import { prisma } from '../lib/prisma.js';

const employee = { id: 'employee-1', email: 'employee@test', role: 'EMPLOYEE', companyId: 'company-a', sessionVersion: 0 };
const row = { id: 'entry-1', userId: employee.id, projectId: 'project-1', activityId: 'activity-1', date: new Date('2026-08-10'), hours: 8, billable: true, note: null, status: 'SUBMITTED', startTime: null, endTime: null, submittedAt: null, approvedAt: null, approverId: null, rejectNote: null, createdAt: new Date(), updatedAt: new Date(), gpsLat: 1, gpsLng: 2, invoiceStatus: 'INVOICED', invoiceReference: 'F-1', approvedHourlyCostSnapshot: 500, approvedBillingRateSnapshot: 900, financialSnapshotCapturedAt: new Date(), offlineActorUserId: employee.id, offlineLocalId: 'local', offlinePayloadHash: 'hash', user: { id: employee.id, name: 'Medarbetare' }, project: { id: 'project-1', name: 'Projekt', code: '1001', site: null, customer: { id: 'customer-1', name: 'Kund' } }, activity: { id: 'activity-1', name: 'Montage', code: 'MONT', category: 'WORK' }, approver: null, attachments: [] };

function assertSafe(value: Record<string, unknown>) {
  for (const field of ['gpsLat', 'gpsLng', 'invoiceStatus', 'invoiceReference', 'approvedHourlyCostSnapshot', 'approvedBillingRateSnapshot', 'financialSnapshotCapturedAt', 'offlineActorUserId', 'offlineLocalId', 'offlinePayloadHash']) assert.equal(field in value, false);
}

test('employee list, week and detail routes never return raw time-entry fields', async () => {
  const findMany = (prisma.timeEntry as any).findMany;
  const findFirst = (prisma.timeEntry as any).findFirst;
  const findUnique = (prisma.weekLock as any).findUnique;
  (prisma.timeEntry as any).findMany = async () => [row];
  (prisma.timeEntry as any).findFirst = async () => row;
  (prisma.weekLock as any).findUnique = async () => null;
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = employee; });
  await app.register(timeEntryRoutes, { prefix: '/api/time-entries' });
  try {
    const list = await app.inject({ method: 'GET', url: '/api/time-entries' });
    const week = await app.inject({ method: 'GET', url: '/api/time-entries/week/2026-08-10' });
    const detail = await app.inject({ method: 'GET', url: '/api/time-entries/entry-1' });
    assertSafe(list.json()[0]); assertSafe(week.json().entries[0]); assertSafe(detail.json());
  } finally {
    (prisma.timeEntry as any).findMany = findMany; (prisma.timeEntry as any).findFirst = findFirst; (prisma.weekLock as any).findUnique = findUnique;
    await app.close();
  }
});
