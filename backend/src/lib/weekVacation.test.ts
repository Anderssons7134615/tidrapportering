import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeekVacationRows } from './weekVacation.js';

test('builds one vacation row for each weekday', () => {
  const rows = buildWeekVacationRows(new Date('2026-07-22T00:00:00.000Z'), 8);

  assert.deepEqual(
    rows.map((row) => row.date.toISOString().slice(0, 10)),
    ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']
  );
  assert.equal(rows.reduce((total, row) => total + row.hours, 0), 40);
});

test('keeps weekday dates stable across the spring DST change', () => {
  const rows = buildWeekVacationRows(new Date('2026-03-25T00:00:00.000Z'), 7.5);

  assert.deepEqual(
    rows.map((row) => row.date.toISOString().slice(0, 10)),
    ['2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27']
  );
  assert.equal(rows.reduce((total, row) => total + row.hours, 0), 37.5);
});
