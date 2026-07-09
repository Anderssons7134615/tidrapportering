const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

export function escapeCsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function createCsvRow(values: unknown[], delimiter: string): string {
  return values.map(escapeCsvCell).join(delimiter);
}
