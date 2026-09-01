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

test('den 20:e ligger kvar i samma löneperiod hela kalenderdagen', () => {
  const referenceDates = [
    new Date(2026, 8, 20, 0, 0, 0, 0),
    new Date(2026, 8, 20, 23, 59, 59, 999),
  ];

  for (const date of referenceDates) {
    assert.deepEqual(latestClosedPayrollPeriod(date), {
      from: '2026-07-21',
      to: '2026-08-20',
    });
    assert.deepEqual(currentPayrollPeriod(date), {
      from: '2026-08-21',
      to: '2026-09-20',
    });
  }
});

test('den 21:e växlar till nästa löneperiod hela kalenderdagen', () => {
  const referenceDates = [
    new Date(2026, 8, 21, 0, 0, 0, 0),
    new Date(2026, 8, 21, 23, 59, 59, 999),
  ];

  for (const date of referenceDates) {
    assert.deepEqual(latestClosedPayrollPeriod(date), {
      from: '2026-08-21',
      to: '2026-09-20',
    });
    assert.deepEqual(currentPayrollPeriod(date), {
      from: '2026-09-21',
      to: '2026-10-20',
    });
  }
});
