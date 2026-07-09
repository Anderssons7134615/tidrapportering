import { z } from 'zod';

export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export const dateOnlySchema = z.string().transform((value, ctx) => {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Datum måste anges som ett giltigt YYYY-MM-DD' });
    return z.NEVER;
  }
  return parsed;
});

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date): Date {
  const result = startOfUtcDay(date);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

export function getWeekStartUtc(date: Date): Date {
  const result = startOfUtcDay(date);
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - day + (day === 0 ? -6 : 1));
  return result;
}

export function getWeekEndUtc(weekStart: Date): Date {
  const result = startOfUtcDay(weekStart);
  result.setUTCDate(result.getUTCDate() + 6);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

export function addUtcDays(date: Date, days: number): Date {
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function getDateOnlyInTimeZone(date = new Date(), timeZone = 'Europe/Stockholm'): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const parsed = parseDateOnly(`${values.year}-${values.month}-${values.day}`);

  if (!parsed) throw new Error(`Kunde inte bestämma kalenderdatum för tidszonen ${timeZone}`);
  return parsed;
}
