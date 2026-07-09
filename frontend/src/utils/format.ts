export function formatHours(value?: number | null) {
  return `${(value || 0).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
}

export function formatPercent(value?: number | null) {
  if (value == null) return '-';
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} %`;
}

export function formatCurrency(value?: number | null) {
  if (value == null) return '-';
  return value.toLocaleString('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  });
}

export function parseSwedishNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseDateOnlyLocal(value: string | Date) {
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return new Date(value);

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toDateInputValue(value: string | Date) {
  const date = parseDateOnlyLocal(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  return parseDateOnlyLocal(value).toLocaleDateString('sv-SE');
}

export function getDisabledReason(rules: Array<[boolean, string]>) {
  return rules.find(([failed]) => failed)?.[1] || null;
}
