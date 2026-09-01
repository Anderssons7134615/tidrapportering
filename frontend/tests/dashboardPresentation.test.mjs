import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashboardActionRows,
  getDashboardApprovalReminderCount,
  getDashboardPrimaryAction,
  isFridayInStockholm,
} from '../src/utils/dashboardPresentation.ts';

test('fredag i Stockholm styr attestpåminnelsen vid sommartidens dygnsgräns', () => {
  assert.equal(isFridayInStockholm(new Date('2026-07-23T21:59:00Z')), false);
  assert.equal(isFridayInStockholm(new Date('2026-07-23T22:00:00Z')), true);
  assert.equal(isFridayInStockholm(new Date('2026-07-24T21:59:00Z')), true);
  assert.equal(isFridayInStockholm(new Date('2026-07-24T22:00:00Z')), false);
});

test('fredag i Stockholm styr attestpåminnelsen vid vintertidens dygnsgräns', () => {
  assert.equal(isFridayInStockholm(new Date('2026-01-22T22:59:00Z')), false);
  assert.equal(isFridayInStockholm(new Date('2026-01-22T23:00:00Z')), true);
  assert.equal(isFridayInStockholm(new Date('2026-01-23T22:59:00Z')), true);
  assert.equal(isFridayInStockholm(new Date('2026-01-23T23:00:00Z')), false);
});

test('väntande attester räknas på fredagar men döljs övriga dagar', () => {
  assert.equal(getDashboardApprovalReminderCount(4, true, new Date('2026-09-04T10:00:00Z')), 4);
  assert.equal(getDashboardApprovalReminderCount(4, true, new Date('2026-09-03T10:00:00Z')), 0);
  assert.equal(getDashboardApprovalReminderCount(0, true, new Date('2026-09-04T10:00:00Z')), 0);
});

test('medarbetare får ingen attestpåminnelse ens på fredag', () => {
  assert.equal(getDashboardApprovalReminderCount(4, false, new Date('2026-09-04T10:00:00Z')), 0);
});

test('fredag ger chef attest som primär handling och prioriterad rad', () => {
  const primary = getDashboardPrimaryAction({
    isManager: true,
    pendingCount: 10,
    riskCount: 2,
    runningCount: 1,
    now: new Date('2026-09-04T10:00:00Z'),
  });
  const rows = buildDashboardActionRows({
    isManager: true,
    missingWeekdays: [],
    pendingWeeks: [],
    approvalReminderCount: primary.approvalReminderCount,
    riskCount: 2,
    runningCount: 1,
  });

  assert.equal(primary.to, '/approval');
  assert.equal(primary.label, 'Öppna attest');
  assert.equal(rows[0].id, 'pending-approvals');
  assert.equal(rows[0].to, '/approval');
  assert.doesNotMatch(rows[0].title, /10/);
});

test('övriga dagar prioriterar projekt och döljer attest från chefens dashboard', () => {
  const primary = getDashboardPrimaryAction({
    isManager: true,
    pendingCount: 10,
    riskCount: 2,
    runningCount: 1,
    now: new Date('2026-09-03T10:00:00Z'),
  });
  const rows = buildDashboardActionRows({
    isManager: true,
    missingWeekdays: [],
    pendingWeeks: [],
    approvalReminderCount: primary.approvalReminderCount,
    riskCount: 2,
    runningCount: 1,
  });

  assert.equal(primary.to, '/projects');
  assert.equal(primary.label, 'Granska projekt');
  assert.equal(rows.some((row) => row.id === 'pending-approvals'), false);
  assert.equal(rows.find((row) => row.id === 'risk-projects')?.to, '/projects');
});

test('medarbetarens primära handling och prioriteringar innehåller aldrig attest', () => {
  const primary = getDashboardPrimaryAction({
    isManager: false,
    pendingCount: 10,
    riskCount: 2,
    runningCount: 1,
    now: new Date('2026-09-04T10:00:00Z'),
  });
  const rows = buildDashboardActionRows({
    isManager: false,
    missingWeekdays: ['Tor'],
    pendingWeeks: ['2026-08-24'],
    approvalReminderCount: primary.approvalReminderCount,
    riskCount: 2,
    runningCount: 1,
  });

  assert.equal(primary.to, '/time-entry');
  assert.equal(rows.some((row) => row.to === '/approval'), false);
});
