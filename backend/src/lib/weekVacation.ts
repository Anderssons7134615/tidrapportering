import { addUtcDays, getWeekStartUtc } from './dateOnly.js';

export function buildWeekVacationRows(weekDate: Date, hoursPerDay: number) {
  const weekStart = getWeekStartUtc(weekDate);

  return Array.from({ length: 5 }, (_, index) => ({
    date: addUtcDays(weekStart, index),
    hours: hoursPerDay,
  }));
}
