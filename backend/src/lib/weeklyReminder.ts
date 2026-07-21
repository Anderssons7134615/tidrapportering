import { getDateOnlyInTimeZone } from './dateOnly.js';

const REMINDER_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidReminderTime(value: string): boolean {
  return REMINDER_TIME_PATTERN.test(value);
}

export function isWeeklyReminderDue(
  now: Date,
  reminderTime: string,
  timeZone = 'Europe/Stockholm'
): boolean {
  if (!isValidReminderTime(reminderTime)) return false;

  const localDate = getDateOnlyInTimeZone(now, timeZone);
  if (localDate.getUTCDay() !== 5) return false;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
  const [scheduledHour, scheduledMinute] = reminderTime.split(':').map(Number);

  return currentMinutes >= scheduledHour * 60 + scheduledMinute;
}
