import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentPayrollPeriod,
  latestClosedPayrollPeriod,
  previousClosedPayrollPeriod,
} from '../src/utils/payrollPeriod.ts';

const referenceDate = new Date(2026, 8, 1);

test('snabbperioderna räknas från en stabil referensdag', () => {
  assert.deepEqual(latestClosedPayrollPeriod(referenceDate), {
    from: '2026-07-21',
    to: '2026-08-20',
  });
  assert.deepEqual(currentPayrollPeriod(referenceDate), {
    from: '2026-08-21',
    to: '2026-09-20',
  });
  assert.deepEqual(previousClosedPayrollPeriod(referenceDate), {
    from: '2026-06-21',
    to: '2026-07-20',
  });
});

test('föregående stängda löneperiod ändras inte efter att den valts', () => {
  const firstSelection = previousClosedPayrollPeriod(referenceDate);
  const secondSelection = previousClosedPayrollPeriod(referenceDate);

  assert.deepEqual(secondSelection, firstSelection);
});
