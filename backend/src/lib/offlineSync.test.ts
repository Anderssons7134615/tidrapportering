import assert from 'node:assert/strict';
import test from 'node:test';
import { createOfflineTimeEntryPayloadHash } from './offlineSync.js';
import { captureFinancialSnapshot, getHourlyCost, getHourlyCostValue, getRate } from './projectMetrics.js';
import { getMaterialMutationError, isAccountant } from './safety.js';

const offlineEntry = {
  userId: 'user-1',
  projectId: 'project-1',
  activityId: 'activity-1',
  date: new Date('2026-08-13T00:00:00.000Z'),
  startTime: '07:00',
  endTime: '15:00',
  hours: 8,
  billable: true,
  note: 'Montage',
  gpsLat: 57.7,
  gpsLng: 11.9,
};

test('offline hash is stable for a retry and changes for different work', () => {
  assert.equal(
    createOfflineTimeEntryPayloadHash(offlineEntry),
    createOfflineTimeEntryPayloadHash({ ...offlineEntry }),
  );
  assert.notEqual(
    createOfflineTimeEntryPayloadHash(offlineEntry),
    createOfflineTimeEntryPayloadHash({ ...offlineEntry, hours: 7.5 }),
  );
});

test('approved financial snapshots preserve a missing cost and ignore later register changes', () => {
  const captured = captureFinancialSnapshot({
    user: { hourlyCost: null },
    activity: { rateOverride: 900 },
    project: { defaultRate: 800, customer: { defaultRate: 700 } },
  }, new Date('2026-08-13T12:00:00.000Z'));
  const approvedEntry = {
    ...captured,
    user: { hourlyCost: 500 },
    activity: { rateOverride: 1200 },
    project: { defaultRate: 1100, customer: { defaultRate: 1000 } },
  };

  assert.equal(getRate(approvedEntry), 900);
  assert.equal(getHourlyCost(approvedEntry), 0);
  assert.equal(getHourlyCostValue(approvedEntry), null);
});

test('material mutations and accounting access follow the least-privilege policy', () => {
  assert.equal(getMaterialMutationError(false)?.code, 'PROJECT_INACTIVE');
  assert.equal(getMaterialMutationError(true, 'INVOICED')?.code, 'MATERIAL_INVOICED');
  assert.equal(getMaterialMutationError(true, 'UNINVOICED'), null);
  assert.equal(isAccountant('ACCOUNTANT'), true);
  assert.equal(isAccountant('SUPERVISOR'), false);
});
