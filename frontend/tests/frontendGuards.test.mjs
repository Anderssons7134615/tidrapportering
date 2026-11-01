import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('report export stays blocked until the current review data is ready', () => {
  assert.match(getReportExportBlockReason({ isFetching: true, isError: false, hasReviewData: true }), /laddats klart/);
  assert.match(getReportExportBlockReason({ isFetching: false, isError: true, hasReviewData: true }), /granskas/);
  assert.match(getReportExportBlockReason({ isFetching: false, isError: false, hasReviewData: false }), /granskas/);
  assert.equal(getReportExportBlockReason({ isFetching: false, isError: false, hasReviewData: true }), null);
});
