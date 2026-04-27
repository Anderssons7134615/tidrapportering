export function formatHours(value?: number | null) {
  return `${(value || 0).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
}

export function formatCurrency(value?: number | null) {
  return `${(value || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`;
}

export function formatPercent(value?: number | null) {
  if (value == null) return '-';
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} %`;
}

export function parseSwedishNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('sv-SE');
}

export function getDisabledReason(rules: Array<[boolean, string]>) {
  return rules.find(([failed]) => failed)?.[1] || null;
}
