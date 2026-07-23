import ExcelJS from 'exceljs';
import { TextDecoder } from 'node:util';
import { deriveMaterialIdentity } from './materialNaming.js';

export type MaterialCatalogCategory =
  | 'Rörskål'
  | 'Armaflex'
  | 'Lamellmatta'
  | 'Plåt'
  | 'Tejp'
  | 'Brandtätning'
  | 'Skruv/nit'
  | 'Övrigt';

export interface MaterialCatalogRow {
  sourceRow: number;
  name: string;
  articleNumber: string | null;
  category: MaterialCatalogCategory;
  unit: string;
  supplier: string | null;
  manufacturer: string | null;
  originalDescription: string | null;
  productFamily: string | null;
  pipeDimensionMm: number | null;
  insulationThicknessMm: number | null;
  outerDiameterMm: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  purchasePrice: number | null;
  defaultUnitPrice: number | null;
  markupPercent: number | null;
  priceSource: string | null;
  priceUpdatedAt: Date | null;
  searchTerms: string | null;
  employeeVisible: boolean;
  active: boolean;
}

export interface MaterialCatalogParseResult {
  sourceType: 'BEVEGO_CSV' | 'TIDAPP_XLSX';
  rows: MaterialCatalogRow[];
  errors: Array<{ row: number; message: string }>;
}

const categories = new Set<MaterialCatalogCategory>([
  'Rörskål',
  'Armaflex',
  'Lamellmatta',
  'Plåt',
  'Tejp',
  'Brandtätning',
  'Skruv/nit',
  'Övrigt',
]);

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase('sv-SE');
}

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseActive(value: unknown): boolean {
  const text = normalizeText(value).toLocaleLowerCase('sv-SE');
  return !['nej', 'no', 'false', '0', 'inaktiv'].includes(text);
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  return rows;
}

function inferCategory(description: string, derivedCategory: string): MaterialCatalogCategory {
  if (categories.has(derivedCategory as MaterialCatalogCategory) && derivedCategory !== 'Övrigt') {
    return derivedCategory as MaterialCatalogCategory;
  }

  const normalized = description.toLocaleUpperCase('sv-SE');
  if (/ARMAFLEX|RÖRSLANG\s+AF[-\s]?\d/.test(normalized)) return 'Armaflex';
  if (/RÖRSKÅL/.test(normalized)) return 'Rörskål';
  if (/LAMELL/.test(normalized)) return 'Lamellmatta';
  if (/PLÅT/.test(normalized)) return 'Plåt';
  if (/TEJP/.test(normalized)) return 'Tejp';
  if (/BRAND|FOGMASSA|BRANDMASSA/.test(normalized)) return 'Brandtätning';
  if (/SKRUV|NIT/.test(normalized)) return 'Skruv/nit';
  return 'Övrigt';
}

function priceDateFromFilename(filename: string): Date | null {
  const match = filename.match(/((?:19|20)\d{2})(\d{2})(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeCategory(value: unknown, fallback: MaterialCatalogCategory): MaterialCatalogCategory {
  const text = normalizeText(value) as MaterialCatalogCategory;
  return categories.has(text) ? text : fallback;
}

function buildSearchTerms(values: Array<string | null | undefined>): string | null {
  const unique = Array.from(new Set(values.flatMap((value) => normalizeText(value).split(/\s+/)).filter(Boolean)));
  return unique.length ? unique.join(' ') : null;
}

function parseBevegoCsv(buffer: Buffer, filename: string): MaterialCatalogParseResult {
  const decoded = new TextDecoder('windows-1252').decode(buffer).replace(/^\uFEFF/, '');
  const records = parseDelimitedRows(decoded, ';');
  const headers = records[0]?.map(normalizeHeader) ?? [];
  const indexOf = (name: string) => headers.indexOf(normalizeHeader(name));

  const articleIndex = indexOf('Artikelnummer');
  const descriptionIndex = indexOf('Beskrivning');
  const listPriceIndex = indexOf('Bruttopris');
  const unitIndex = indexOf('Enhet');
  const discountIndex = indexOf('Rabattprocent');
  const purchasePriceIndex = indexOf('Nettopris');

  if (articleIndex < 0 || descriptionIndex < 0) {
    return {
      sourceType: 'BEVEGO_CSV',
      rows: [],
      errors: [{ row: 1, message: 'CSV-filen måste innehålla Artikelnummer och Beskrivning' }],
    };
  }

  const rows: MaterialCatalogRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const priceUpdatedAt = priceDateFromFilename(filename);

  records.slice(1).forEach((record, index) => {
    const sourceRow = index + 2;
    const articleNumber = normalizeText(record[articleIndex]);
    const description = normalizeText(record[descriptionIndex]);
    if (!articleNumber && !description) return;
    if (!articleNumber) errors.push({ row: sourceRow, message: 'Artikelnummer saknas' });
    if (!description) errors.push({ row: sourceRow, message: 'Beskrivning saknas' });
    if (!articleNumber || !description) return;

    const identity = deriveMaterialIdentity({ description, articleNumber });
    const category = inferCategory(description, identity.category);
    const listPrice = listPriceIndex >= 0 ? parseOptionalNumber(record[listPriceIndex]) : null;
    const discountPercent = discountIndex >= 0 ? parseOptionalNumber(record[discountIndex]) : null;
    const purchasePrice = purchasePriceIndex >= 0 ? parseOptionalNumber(record[purchasePriceIndex]) : null;

    if (listPrice != null && listPrice < 0) errors.push({ row: sourceRow, message: 'Listpris får inte vara negativt' });
    if (discountPercent != null && discountPercent < 0) errors.push({ row: sourceRow, message: 'Rabatt får inte vara negativ' });
    if (purchasePrice != null && purchasePrice < 0) errors.push({ row: sourceRow, message: 'Inköpspris får inte vara negativt' });

    rows.push({
      sourceRow,
      name: identity.displayName,
      articleNumber,
      category,
      unit: normalizeText(unitIndex >= 0 ? record[unitIndex] : '') || 'st',
      supplier: 'Bevego',
      manufacturer: identity.manufacturer,
      originalDescription: description,
      productFamily: identity.productFamily,
      pipeDimensionMm: identity.pipeDimensionMm,
      insulationThicknessMm: identity.insulationThicknessMm,
      outerDiameterMm: identity.outerDiameterMm,
      listPrice,
      discountPercent,
      purchasePrice,
      defaultUnitPrice: null,
      markupPercent: null,
      priceSource: filename,
      priceUpdatedAt,
      searchTerms: buildSearchTerms([identity.searchTerms, articleNumber, description]),
      employeeVisible: category !== 'Övrigt',
      active: true,
    });
  });

  return { sourceType: 'BEVEGO_CSV', rows, errors };
}

async function parseTidAppWorkbook(buffer: Buffer, filename: string): Promise<MaterialCatalogParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.getWorksheet('Materialmall')
    || workbook.getWorksheet('Materialregister')
    || workbook.worksheets[0];

  if (!worksheet) {
    return {
      sourceType: 'TIDAPP_XLSX',
      rows: [],
      errors: [{ row: 1, message: 'Excel-filen saknar blad' }],
    };
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(normalizeHeader(cell.value), columnNumber);
  });
  const column = (...names: string[]) => names.map((name) => headers.get(normalizeHeader(name))).find(Boolean);
  const articleColumn = column('Artikel');

  if (!articleColumn) {
    return {
      sourceType: 'TIDAPP_XLSX',
      rows: [],
      errors: [{ row: 1, message: 'Excel-filen måste innehålla kolumnen Artikel' }],
    };
  }

  const rows: MaterialCatalogRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    if (!values.some((value) => normalizeText(value))) return;

    const name = normalizeText(row.getCell(articleColumn).value);
    const articleNumberColumn = column('Artikelnummer');
    const articleNumber = articleNumberColumn ? normalizeText(row.getCell(articleNumberColumn).value) || null : null;
    const originalDescriptionColumn = column('Leverantörsbeskrivning', 'Originalbeskrivning', 'Beskrivning');
    const originalDescription = originalDescriptionColumn
      ? normalizeText(row.getCell(originalDescriptionColumn).value) || null
      : null;
    const identity = deriveMaterialIdentity({
      description: originalDescription || name,
      articleNumber,
    });
    const categoryColumn = column('Kategori');
    const category = safeCategory(
      categoryColumn ? row.getCell(categoryColumn).value : null,
      inferCategory(originalDescription || name, identity.category),
    );
    const unitColumn = column('Enhet');
    const unit = unitColumn ? normalizeText(row.getCell(unitColumn).value) || 'st' : 'st';
    const purchasePriceColumn = column('Inköpspris', 'Nettopris');
    const listPriceColumn = column('Bevego listpris', 'Listpris', 'Bruttopris');
    const salesPriceColumn = column('Försäljningspris');
    const discountColumn = column('Rabatt %', 'Rabattprocent');
    const markupColumn = column('Påslag %');
    const supplierColumn = column('Leverantör');
    const manufacturerColumn = column('Fabrikat', 'Tillverkare');
    const visibleColumn = column('Synlig för anställda');
    const activeColumn = column('Aktiv');

    const purchasePrice = purchasePriceColumn ? parseOptionalNumber(row.getCell(purchasePriceColumn).value) : null;
    const listPrice = listPriceColumn ? parseOptionalNumber(row.getCell(listPriceColumn).value) : null;
    const defaultUnitPrice = salesPriceColumn ? parseOptionalNumber(row.getCell(salesPriceColumn).value) : null;
    const discountPercent = discountColumn ? parseOptionalNumber(row.getCell(discountColumn).value) : null;
    const markupPercent = markupColumn ? parseOptionalNumber(row.getCell(markupColumn).value) : null;

    if (!name) errors.push({ row: rowNumber, message: 'Artikel saknas' });
    if (purchasePrice != null && purchasePrice < 0) errors.push({ row: rowNumber, message: 'Inköpspris får inte vara negativt' });
    if (listPrice != null && listPrice < 0) errors.push({ row: rowNumber, message: 'Listpris får inte vara negativt' });
    if (defaultUnitPrice != null && defaultUnitPrice < 0) errors.push({ row: rowNumber, message: 'Försäljningspris får inte vara negativt' });
    if (!name) return;

    rows.push({
      sourceRow: rowNumber,
      name,
      articleNumber,
      category,
      unit,
      supplier: supplierColumn ? normalizeText(row.getCell(supplierColumn).value) || null : null,
      manufacturer: manufacturerColumn
        ? normalizeText(row.getCell(manufacturerColumn).value) || identity.manufacturer
        : identity.manufacturer,
      originalDescription,
      productFamily: identity.productFamily,
      pipeDimensionMm: identity.pipeDimensionMm,
      insulationThicknessMm: identity.insulationThicknessMm,
      outerDiameterMm: identity.outerDiameterMm,
      listPrice,
      discountPercent,
      purchasePrice,
      defaultUnitPrice,
      markupPercent,
      priceSource: filename,
      priceUpdatedAt: priceDateFromFilename(filename),
      searchTerms: buildSearchTerms([identity.searchTerms, articleNumber, originalDescription, name]),
      employeeVisible: visibleColumn ? parseActive(row.getCell(visibleColumn).value) : true,
      active: activeColumn ? parseActive(row.getCell(activeColumn).value) : true,
    });
  });

  return { sourceType: 'TIDAPP_XLSX', rows, errors };
}

export async function parseMaterialCatalogFile(
  buffer: Buffer,
  filename: string,
): Promise<MaterialCatalogParseResult> {
  if (filename.toLocaleLowerCase('sv-SE').endsWith('.csv')) {
    return parseBevegoCsv(buffer, filename);
  }
  return parseTidAppWorkbook(buffer, filename);
}
