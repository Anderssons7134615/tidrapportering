import test from 'node:test';
import assert from 'node:assert/strict';
import { getDateOnlyInTimeZone, getWeekEndUtc, getWeekStartUtc, parseDateOnly, toDateKey } from './dateOnly.js';

test('parseDateOnly rejects normalized and malformed dates', () => {
  assert.equal(parseDateOnly('2026-02-30'), null);
  assert.equal(parseDateOnly('2026-2-3'), null);
  assert.equal(parseDateOnly('not-a-date'), null);
});

test('Stockholm business date follows the local midnight boundary', () => {
  assert.equal(toDateKey(getDateOnlyInTimeZone(new Date('2026-01-01T23:30:00Z'))), '2026-01-02');
  assert.equal(toDateKey(getDateOnlyInTimeZone(new Date('2026-07-09T22:30:00Z'))), '2026-07-10');
});

test('week boundaries stay on Swedish calendar dates independent of local timezone', () => {
  const thursday = parseDateOnly('2026-07-09');
  assert.ok(thursday);

  const weekStart = getWeekStartUtc(thursday);
  assert.equal(toDateKey(weekStart), '2026-07-06');
  assert.equal(getWeekEndUtc(weekStart).toISOString(), '2026-07-12T23:59:59.999Z');
});
