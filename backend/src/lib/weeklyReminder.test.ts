import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidReminderTime, isWeeklyReminderDue } from './weeklyReminder.js';

test('reminder times must use a real 24-hour HH:mm value', () => {
  assert.equal(isValidReminderTime('15:30'), true);
  assert.equal(isValidReminderTime('7:30'), false);
  assert.equal(isValidReminderTime('24:00'), false);
  assert.equal(isValidReminderTime('15:72'), false);
});

test('weekly reminder is due on Friday at or after the configured Stockholm time', () => {
  assert.equal(isWeeklyReminderDue(new Date('2026-07-24T13:29:00Z'), '15:30'), false);
  assert.equal(isWeeklyReminderDue(new Date('2026-07-24T13:30:00Z'), '15:30'), true);
  assert.equal(isWeeklyReminderDue(new Date('2026-07-24T16:00:00Z'), '15:30'), true);
});

test('weekly reminder never becomes due on another weekday', () => {
  assert.equal(isWeeklyReminderDue(new Date('2026-07-23T14:00:00Z'), '15:30'), false);
  assert.equal(isWeeklyReminderDue(new Date('2026-07-25T14:00:00Z'), '15:30'), false);
});

test('weekly reminder follows Stockholm winter time as well as summer time', () => {
  assert.equal(isWeeklyReminderDue(new Date('2026-01-23T14:29:00Z'), '15:30'), false);
  assert.equal(isWeeklyReminderDue(new Date('2026-01-23T14:30:00Z'), '15:30'), true);
});
