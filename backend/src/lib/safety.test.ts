import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canApproveWeek,
  toPublicProjectSummaryEntry,
  withoutActivityRate,
  withoutHourlyCost,
} from './safety.js';

test('blocks self approval but permits another reviewer', () => {
  assert.equal(canApproveWeek('reviewer-1', 'reviewer-1'), false);
  assert.equal(canApproveWeek('reviewer-2', 'reviewer-1'), true);
});

test('project summary entries whitelist work data and omit confidential relations', () => {
  const entry = toPublicProjectSummaryEntry({
    id: 'entry-1',
    userId: 'user-1',
    date: new Date('2026-08-10T00:00:00.000Z'),
    hours: 8,
    billable: true,
    note: 'Montage',
    status: 'APPROVED',
    user: { id: 'user-1', name: 'Mika' },
    project: { id: 'project-1', name: 'Bygget', code: 'P-1' },
    activity: { id: 'activity-1', name: 'Montage', code: 'MONT' },
  });

  assert.equal('hourlyCost' in entry, false);
  assert.equal('rateOverride' in entry, false);
  assert.equal('gpsLat' in entry, false);
  assert.equal('invoiceStatus' in entry, false);
  assert.deepEqual(entry.user, { id: 'user-1', name: 'Mika' });
});

test('employee-facing DTOs remove internal rates and hourly cost', () => {
  assert.deepEqual(withoutActivityRate({ id: 'activity-1', name: 'Montage', rateOverride: 850 }), {
    id: 'activity-1',
    name: 'Montage',
  });
  assert.deepEqual(withoutHourlyCost({ id: 'user-1', name: 'Mika', hourlyCost: 450 }), {
    id: 'user-1',
    name: 'Mika',
  });
});
