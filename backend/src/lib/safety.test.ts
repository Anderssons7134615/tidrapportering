import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canApproveWeek,
  canViewProjectFinancials,
  canViewProjectHours,
  getApprovedProjectHours,
  toPublicProjectHoursEntry,
  toPublicProjectMaterial,
  toPublicProjectTimeEntry,
  toPublicProjectSummaryEntry,
  withoutActivityRate,
  withoutHourlyCost,
} from './safety.js';

test('only admins can approve their own week', () => {
  assert.equal(canApproveWeek('ADMIN', 'reviewer-1', 'reviewer-1'), true);
  assert.equal(canApproveWeek('SUPERVISOR', 'reviewer-1', 'reviewer-1'), false);
  assert.equal(canApproveWeek('EMPLOYEE', 'reviewer-1', 'reviewer-1'), false);
  assert.equal(canApproveWeek('ACCOUNTANT', 'reviewer-1', 'reviewer-1'), false);
  assert.equal(canApproveWeek('SUPERVISOR', 'reviewer-2', 'reviewer-1'), true);
});

test('employee project visibility means approved project hours, never financials', () => {
  assert.equal(canViewProjectHours('EMPLOYEE', true), true);
  assert.equal(canViewProjectHours('EMPLOYEE', false), false);
  assert.equal(canViewProjectHours('SUPERVISOR', false), true);
  assert.equal(canViewProjectFinancials('EMPLOYEE'), false);
  assert.equal(canViewProjectFinancials('ACCOUNTANT'), false);
  assert.equal(canViewProjectFinancials('SUPERVISOR'), true);
});

test('employee project totals aggregate only approved entries', async () => {
  let aggregateArgs: unknown;
  const hours = await getApprovedProjectHours({
    timeEntry: {
      aggregate: async (args) => {
        aggregateArgs = args;
        return { _sum: { hours: null } };
      },
    },
  }, 'project-1');

  assert.deepEqual(aggregateArgs, {
    where: { projectId: 'project-1', status: 'APPROVED' },
    _sum: { hours: true },
  });
  assert.equal(hours, 0);
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

test('project time entry output omits colleague location, financial and sync data', () => {
  const entry = toPublicProjectTimeEntry({
    id: 'entry-1',
    userId: 'user-1',
    projectId: 'project-1',
    activityId: 'activity-1',
    date: new Date('2026-08-10T00:00:00.000Z'),
    hours: 8,
    billable: true,
    note: 'Montage',
    status: 'APPROVED',
    user: { id: 'user-1', name: 'Mika' },
    activity: { id: 'activity-1', name: 'Montage', code: 'MONT' },
    gpsLat: 57.7,
    gpsLng: 11.9,
    approvedHourlyCostSnapshot: 450,
    approvedBillingRateSnapshot: 850,
    invoiceStatus: 'INVOICED',
    offlineLocalId: 'local-1',
  } as Parameters<typeof toPublicProjectTimeEntry>[0]);

  for (const privateField of ['gpsLat', 'gpsLng', 'approvedHourlyCostSnapshot', 'approvedBillingRateSnapshot', 'invoiceStatus', 'offlineLocalId']) {
    assert.equal(privateField in entry, false, `${privateField} must not be public`);
  }
});

test('employee project hours output is limited to the documented work fields', () => {
  const entry = toPublicProjectHoursEntry({
    id: 'entry-1',
    userId: 'user-1',
    date: new Date('2026-08-10T00:00:00.000Z'),
    hours: 8,
    status: 'APPROVED',
    user: { id: 'user-1', name: 'Mika' },
    activity: { id: 'activity-1', name: 'Montage', code: 'MONT' },
    gpsLat: 57.7,
    approvedHourlyCostSnapshot: 450,
    note: 'Privat arbetsanteckning',
  } as Parameters<typeof toPublicProjectHoursEntry>[0]);

  assert.deepEqual(Object.keys(entry).sort(), ['activity', 'date', 'hours', 'id', 'status', 'user', 'userId']);
  assert.deepEqual(entry.user, { id: 'user-1', name: 'Mika' });
  assert.deepEqual(entry.activity, { id: 'activity-1', name: 'Montage', code: 'MONT' });
});

test('employee material output omits internal sync metadata and prices', () => {
  const material = toPublicProjectMaterial({
    id: 'material-1',
    quantity: 3,
    purchasePrice: 120,
    unitPrice: 250,
    invoiceStatus: 'INVOICED',
    invoiceReference: 'F-1',
    integrationOperationId: 'operation-1',
    integrationRowIndex: 7,
  }, false, false);

  assert.equal('integrationOperationId' in material, false);
  assert.equal('integrationRowIndex' in material, false);
  assert.equal(material.purchasePrice, null);
  assert.equal(material.unitPrice, null);
  assert.equal(material.lineTotal, null);
  assert.equal('invoiceStatus' in material, false);
  assert.equal('invoicedAt' in material, false);
  assert.equal('invoiceReference' in material, false);
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
