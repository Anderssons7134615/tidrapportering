import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProjectTaskDeadline, compareProjectControlRows, escapePrismaLikePattern, getProjectTaskCapabilities, getProjectTaskCompletion, getProjectTaskScope } from './projectControl.js';

test('keeps task access inside the company and separates work from economy roles', () => {
  assert.deepEqual(getProjectTaskScope({ id: 'employee-1', companyId: 'company-a', role: 'EMPLOYEE' }), { companyId: 'company-a', assigneeId: 'employee-1' });
  assert.deepEqual(getProjectTaskScope({ id: 'manager-1', companyId: 'company-a', role: 'SUPERVISOR' }), { companyId: 'company-a' });
  assert.equal(getProjectTaskScope({ id: 'accountant-1', companyId: 'company-a', role: 'ACCOUNTANT' }), null);
  assert.deepEqual(getProjectTaskCapabilities('ACCOUNTANT'), { workQueue: false, manage: false, portfolio: true });
  assert.deepEqual(getProjectTaskCapabilities('ADMIN'), { workQueue: true, manage: true, portfolio: true });
});

test('escapes Prisma LIKE wildcards in literal project searches', () => {
  assert.equal(escapePrismaLikePattern('100%_\\'), '100\\%\\_\\\\');
});

test('classifies project task deadlines from the Swedish calendar day', () => {
  const winterNow = new Date('2026-01-01T23:30:00.000Z');
  assert.equal(classifyProjectTaskDeadline(new Date('2026-01-01T00:00:00.000Z'), winterNow), 'OVERDUE');
  assert.equal(classifyProjectTaskDeadline(new Date('2026-01-02T00:00:00.000Z'), winterNow), 'TODAY');
  assert.equal(classifyProjectTaskDeadline(new Date('2026-01-09T00:00:00.000Z'), winterNow), 'UPCOMING');
  assert.equal(classifyProjectTaskDeadline(new Date('2026-01-10T00:00:00.000Z'), winterNow), 'LATER');

  const summerNow = new Date('2026-07-09T22:30:00.000Z');
  assert.equal(classifyProjectTaskDeadline(new Date('2026-07-10T00:00:00.000Z'), summerNow), 'TODAY');
});

test('sets completion time on done and clears it when a task is reopened', () => {
  const now = new Date('2026-08-13T08:00:00.000Z');
  assert.equal(getProjectTaskCompletion('TODO', 'DONE', null, now)?.toISOString(), now.toISOString());
  assert.equal(getProjectTaskCompletion('DONE', 'IN_PROGRESS', now, now), null);
  assert.equal(getProjectTaskCompletion('DONE', 'DONE', now, new Date('2026-08-14T08:00:00.000Z')), now);
});

test('sorts urgent project rows before upcoming and inactive work', () => {
  const rows = [
    { code: '0040', overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, highestPriority: 'HIGH' as const, earliestDueDate: null, lastActivityAt: new Date('2026-08-13') },
    { code: '0020', overdueCount: 0, dueTodayCount: 1, upcomingCount: 0, highestPriority: 'NORMAL' as const, earliestDueDate: new Date('2026-08-13'), lastActivityAt: new Date('2026-08-12') },
    { code: '0010', overdueCount: 1, dueTodayCount: 0, upcomingCount: 0, highestPriority: 'LOW' as const, earliestDueDate: new Date('2026-08-11'), lastActivityAt: new Date('2026-08-10') },
    { code: '0030', overdueCount: 0, dueTodayCount: 0, upcomingCount: 1, highestPriority: 'HIGH' as const, earliestDueDate: new Date('2026-08-17'), lastActivityAt: null },
  ];

  assert.deepEqual(rows.sort(compareProjectControlRows).map((row) => row.code), ['0010', '0020', '0030', '0040']);
});

test('sorts non-urgent projects by priority before their later due date', () => {
  const rows = [
    { code: 'LOW', overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, highestPriority: 'LOW' as const, earliestDueDate: new Date('2026-09-01'), lastActivityAt: new Date('2026-08-13') },
    { code: 'HIGH', overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, highestPriority: 'HIGH' as const, earliestDueDate: new Date('2026-10-01'), lastActivityAt: new Date('2026-08-01') },
  ];
  assert.deepEqual(rows.sort(compareProjectControlRows).map((row) => row.code), ['HIGH', 'LOW']);
});

test('sorts equally prioritized non-urgent projects by latest activity before due date', () => {
  const rows = [
    { code: 'OLD', overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, highestPriority: 'HIGH' as const, earliestDueDate: new Date('2026-09-01'), lastActivityAt: new Date('2026-08-01') },
    { code: 'RECENT', overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, highestPriority: 'HIGH' as const, earliestDueDate: new Date('2026-10-01'), lastActivityAt: new Date('2026-08-13') },
  ];
  assert.deepEqual(rows.sort(compareProjectControlRows).map((row) => row.code), ['RECENT', 'OLD']);
});
