import { addMonths, format } from 'date-fns';

function toDateInput(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function latestClosedPayrollPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentCutoff = new Date(year, month, 20);
  const isAfterCutoffDay = referenceDate.getDate() > 20;
  const end = isAfterCutoffDay ? currentCutoff : new Date(year, month - 1, 20);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 21);
  return { from: toDateInput(start), to: toDateInput(end) };
}

export function currentPayrollPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const isAfterCutoffDay = referenceDate.getDate() > 20;
  const start = isAfterCutoffDay ? new Date(year, month, 21) : new Date(year, month - 1, 21);
  const nextMonth = addMonths(start, 1);
  const end = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20);
  return { from: toDateInput(start), to: toDateInput(end) };
}

export function previousPayrollPeriod(fromDate: string) {
  const [year, month, day] = fromDate.split('-').map(Number);
  const currentStart = new Date(year, month - 1, day);
  const end = new Date(currentStart.getFullYear(), currentStart.getMonth(), 20);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 21);
  return { from: toDateInput(start), to: toDateInput(end) };
}

export function previousClosedPayrollPeriod(referenceDate = new Date()) {
  return previousPayrollPeriod(latestClosedPayrollPeriod(referenceDate).from);
}
