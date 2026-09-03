import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canModifyProjectMaterial,
  getFocusTrapAction,
  getProjectQueryAccess,
  getReportExportBlockReason,
} from '../src/utils/frontendGuards.ts';

test('mobile menu closes with Escape and wraps focus at both ends', () => {
  assert.equal(getFocusTrapAction('Escape', false, 2, 5), 'close');
  assert.equal(getFocusTrapAction('Tab', false, 4, 5), 'focus-first');
  assert.equal(getFocusTrapAction('Tab', true, 0, 5), 'focus-last');
  assert.equal(getFocusTrapAction('Tab', false, 2, 5), null);
});

test('project retry access never enables manager data for employees', () => {
  assert.deepEqual(
    getProjectQueryAccess({ hasProjectId: true, isManager: false }),
    { canLoadTimeEntries: false, canLoadManagerSummary: false }
  );
  assert.deepEqual(
    getProjectQueryAccess({ hasProjectId: true, isManager: false, hoursVisibleToCurrentUser: true }),
    { canLoadTimeEntries: true, canLoadManagerSummary: false }
  );
  assert.deepEqual(
    getProjectQueryAccess({ hasProjectId: true, isManager: true }),
    { canLoadTimeEntries: true, canLoadManagerSummary: true }
  );
});

test('employees can only modify their own uninvoiced material on active projects', () => {
  const ownRow = { projectActive: true, isManager: false, currentUserId: 'u1', createdByUserId: 'u1', invoiceStatus: 'NOT_INVOICED' };
  assert.equal(canModifyProjectMaterial(ownRow), true);
  assert.equal(canModifyProjectMaterial({ ...ownRow, createdByUserId: 'u2' }), false);
  assert.equal(canModifyProjectMaterial({ ...ownRow, currentUserId: undefined, createdByUserId: undefined }), false);
  assert.equal(canModifyProjectMaterial({ ...ownRow, invoiceStatus: 'INVOICED' }), false);
  assert.equal(canModifyProjectMaterial({ ...ownRow, projectActive: false }), false);
  assert.equal(canModifyProjectMaterial({ ...ownRow, isManager: true, createdByUserId: 'u2' }), true);
});

test('report export stays blocked until the current review data is ready', () => {
  assert.match(getReportExportBlockReason({ isFetching: true, isError: false, hasReviewData: true }), /laddats klart/);
  assert.match(getReportExportBlockReason({ isFetching: false, isError: true, hasReviewData: true }), /granskas/);
  assert.match(getReportExportBlockReason({ isFetching: false, isError: false, hasReviewData: false }), /granskas/);
  assert.equal(getReportExportBlockReason({ isFetching: false, isError: false, hasReviewData: true }), null);
});
