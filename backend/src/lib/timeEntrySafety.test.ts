import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimeEntryDeletionError, toEmployeeTimeEntry } from './timeEntrySafety.js';

test('employee time-entry DTO excludes financial, invoice, GPS and sync metadata', () => {
  const entry = toEmployeeTimeEntry({
    id: 'entry-1', userId: 'user-1', projectId: 'project-1', activityId: 'activity-1', date: new Date('2026-08-14T00:00:00.000Z'), hours: 8, billable: true, status: 'APPROVED', note: 'Montage',
    project: { id: 'project-1', name: 'Projekt', code: '1001', customer: { id: 'customer-1', name: 'Kund' } }, activity: { id: 'activity-1', name: 'Montage', code: 'MONT', category: 'WORK' },
    attachments: [{ id: 'attachment-1', timeEntryId: 'entry-1', filename: 'bild.jpg', originalName: 'bild.jpg', mimeType: 'image/jpeg', size: 10, createdAt: new Date() }],
    gpsLat: 57.7, gpsLng: 11.9, invoiceStatus: 'INVOICED', approvedHourlyCostSnapshot: 500, approvedBillingRateSnapshot: 900, financialSnapshotCapturedAt: new Date(), invoiceReference: 'F-1', offlineActorUserId: 'user-1', offlineLocalId: 'local-1', offlinePayloadHash: 'hash',
  });
  for (const field of ['gpsLat', 'gpsLng', 'invoiceStatus', 'invoiceReference', 'approvedHourlyCostSnapshot', 'approvedBillingRateSnapshot', 'financialSnapshotCapturedAt', 'offlineActorUserId', 'offlineLocalId', 'offlinePayloadHash']) assert.equal(field in entry, false, `${field} must not reach an employee`);
  assert.equal('path' in entry.attachments![0], false);
  assert.equal(entry.project?.customer?.name, 'Kund');
});

test('approved time entries cannot be deleted', () => {
  assert.equal(getTimeEntryDeletionError('APPROVED'), 'Veckan måste låsas upp innan raden tas bort');
  assert.equal(getTimeEntryDeletionError('SUBMITTED'), null);
});
