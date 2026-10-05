import { Worker } from 'node:worker_threads';
import { parseDateOnly } from './dateOnly.js';
import { INVOICE_MAX_BYTES, InvoiceError, parseInvoiceMoney } from './supplierInvoiceRules.js';
import { suggestBevegoOrders } from './invoiceOrders.js';

export const INVOICE_PARSER_VERSION = 'pdfjs-6.3.289/orders-1';
let activeWorkers = 0;

export async function extractInvoicePdf(bytes: Buffer, timeoutMs = 10_000): Promise<{ text: string; pages: number }> {
  if (!bytes.length || bytes.length > INVOICE_MAX_BYTES || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new InvoiceError('Välj en PDF-fil som är högst 10 MB.');
  if (activeWorkers >= 2) throw new InvoiceError('PDF-tolkningen är upptagen. Fyll i uppgifterna manuellt.', 429, 'PDF_BUSY');
  activeWorkers++;
  let worker: Worker | undefined;
  try {
    return await new Promise((resolve, reject) => {
      const fromSource = import.meta.url.endsWith('.ts');
      worker = new Worker(new URL(`./invoicePdfWorker.${fromSource ? 'ts' : 'js'}`, import.meta.url), {
        workerData: { bytes }, execArgv: fromSource ? ['--import', 'tsx'] : [],
        resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 }, stdout: true, stderr: true,
      });
      worker.stdout.resume();
      worker.stderr.resume();
      let settled = false;
      const finish = (error?: Error, result?: { text: string; pages: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(result!);
      };
      const timer = setTimeout(() => {
        finish(new InvoiceError('PDF-tolkningen tog för lång tid. Fyll i uppgifterna manuellt.', 400, 'PDF_TIMEOUT'));
      }, timeoutMs);
      worker.once('message', (result: { error?: string; text: string; pages: number }) => {
        if (result.error) finish(new InvoiceError(result.error === 'PAGE_LIMIT' ? 'PDF:en har fler än 25 sidor. Fyll i uppgifterna manuellt.' : 'Texten kunde inte läsas. Kontrollera originalet och fyll i uppgifterna manuellt.', 400, result.error));
        else finish(undefined, { text: result.text, pages: result.pages });
      });
      worker.once('error', () => finish(new InvoiceError('PDF:en kunde inte tolkas. Fyll i uppgifterna manuellt.')));
      worker.once('exit', () => finish(new InvoiceError('PDF-tolkningen avslutades. Fyll i uppgifterna manuellt.')));
    });
  } finally {
    if (worker) await worker.terminate();
    activeWorkers--;
  }
}

export function suggestInvoiceFields(text: string) {
  const lines = text.replace(/\u00a0/g, ' ').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const warnings: string[] = [];
  const labeled = (label: string, value: string) => {
    const candidates = lines.flatMap((line, index) => {
      const match = new RegExp(`(?:^|\\s)(?:${label})\\s*:?\\s*(${value})\\s*(?:SEK|kr)?\\s*$`, 'i').exec(line)
        ?? (new RegExp(`^(?:${label})\\s*:?$`, 'i').test(line) ? new RegExp(`^(${value})\\s*(?:SEK|kr)?$`, 'i').exec(lines[index + 1] || '') : null);
      return match ? [match[1].trim()] : [];
    });
    const unique = [...new Set(candidates)];
    return unique.length === 1 ? unique[0] : null;
  };
  const money = '-?[\\d .]+(?:[,\\.]\\d{1,2})';
  const dateValue = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{2}[/.]\\d{2}[/.]\\d{4})';
  const date = (value: string | null) => {
    if (!value) return null;
    const normalized = value.replace(/^(\d{2})[/.](\d{2})[/.](\d{4})$/, '$3-$2-$1');
    return parseDateOnly(normalized) ? normalized : null;
  };
  const amount = (label: string) => { const value = labeled(label, money); return value ? parseInvoiceMoney(value) : null; };
  const documentType = /\b(?:kreditfaktura|kreditnota|credit note)\b/i.test(text) ? 'CREDIT' as const : 'INVOICE' as const;
  const signed = (value: number | null) => value == null ? null : documentType === 'CREDIT' ? -Math.abs(value) : value;
  const printedGross = amount('att betala|summa att betala|totalbelopp|belopp inkl\\.? moms');
  const printedRounding = amount('öresavrundning|avrundning') ?? 0;
  const number = labeled('fakturanummer|fakturanr\\.?|faktura nr\\.?|kreditfakturanr\\.?', '[A-Z0-9][A-Z0-9/ -]{1,79}');
  const fields = {
    supplierName: /\bbevego\b/i.test(text) ? 'Bevego' : null,
    // Organization numbers can also belong to the buyer. Always enter/check
    // the supplier's number explicitly instead of guessing the first number.
    supplierOrgNumber: null,
    invoiceNumber: number && /\d/.test(number) ? number : null,
    documentType,
    issueDate: date(labeled('fakturadatum|kreditdatum', dateValue)),
    dueDate: date(labeled('förfallodatum|förf\\.? datum', dateValue)),
    currency: /\b(?:EUR|USD|NOK|DKK|GBP)\b/i.test(text) ? null : /\b(?:SEK|kr)\b/i.test(text) ? 'SEK' : null,
    netOre: signed(amount('nettobelopp|netto|summa exkl\\.? moms|belopp exkl\\.? moms')),
    vatOre: signed(amount('momsbelopp|moms')),
    roundingOre: documentType === 'CREDIT' && printedGross != null && printedGross > 0 ? -printedRounding : printedRounding,
    grossOre: signed(printedGross),
  };
  if (fields.supplierName === 'Bevego') {
    // PDF text order puts all four summary labels before their values. Match
    // the complete table, never an order subtotal or the bank's currency.
    const flat = lines.join(' ').replace(/\s+/g, ' ');
    const unique = (values: string[]) => [...new Set(values)].length === 1 ? values[0] : null;
    const number = unique([...flat.matchAll(/\b(?:Faktura|Kreditfaktura)\s+(\d{2,20})(?=\s|$)/gi)].map((match) => match[1]));
    if (number) fields.invoiceNumber = number;
    else if (/\b(?:Faktura|Kreditfaktura)\s+\d/i.test(flat)) fields.invoiceNumber = null;
    const bevegoDate = (label: string) => {
      const values = [...flat.matchAll(new RegExp(`${label}\\s+(\\d{2}-\\d{2}-\\d{2})(?=\\s|$)`, 'gi'))].map((match) => match[1]);
      const value = unique(values);
      // This supplier format uses YY-MM-DD; only suggest dates in 2000–2099.
      return value ? date(`20${value}`) : null;
    };
    fields.issueDate = bevegoDate('Fakt\\.datum') ?? fields.issueDate;
    const dueDates = lines.flatMap((line, index) => /\bFF-datum\s*$/i.test(line)
      ? [...(lines[index + 1] || '').matchAll(/\b(\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]) : []);
    const due = unique(dueDates);
    if (dueDates.length) fields.dueDate = due ? date(`20${due}`) : null;
    const amountToken = '(-?\\d[\\d.]*,\\d{2}-?)';
    const table = new RegExp(`Summa före moms Summa moms Öresutjämning Fakt\\.belopp\\s+${amountToken}\\s+${amountToken}\\s+${amountToken}\\s+(SEK|EUR|USD|NOK|DKK|GBP)\\s+${amountToken}(?=\\s|$)`, 'gi');
    const interleaved = new RegExp(`Summa före moms\\s+${amountToken}\\s+Summa moms\\s+${amountToken}\\s+Öresutjämning\\s+${amountToken}\\s+Fakt\\.belopp\\s+(SEK|EUR|USD|NOK|DKK|GBP)\\s+${amountToken}(?=\\s|$)`, 'gi');
    const tables = [...flat.matchAll(table), ...flat.matchAll(interleaved)].map((match) => match.slice(1).join('|'));
    const summary = unique(tables);
    if (summary) {
      const [net, vat, rounding, currency, gross] = summary.split('|');
      const printed = parseInvoiceMoney(gross);
      fields.netOre = signed(parseInvoiceMoney(net));
      fields.vatOre = signed(parseInvoiceMoney(vat));
      fields.grossOre = signed(printed);
      fields.roundingOre = (parseInvoiceMoney(rounding) ?? 0) * (documentType === 'CREDIT' && printed != null && printed > 0 ? -1 : 1);
      fields.currency = currency.toUpperCase() === 'SEK' ? 'SEK' : null;
    } else if (tables.length > 1) {
      fields.netOre = fields.vatOre = fields.grossOre = null;
      warnings.push('Flera olika fakturatotaler hittades. Kontrollera att originalet innehåller en enda faktura.');
    }
  }
  const uncertain = [
    !fields.invoiceNumber && 'fakturanummer', !fields.issueDate && 'fakturadatum',
    !fields.dueDate && 'förfallodatum', fields.netOre == null && 'netto',
    fields.vatOre == null && 'moms', fields.grossOre == null && 'totalbelopp',
  ].filter(Boolean);
  if (uncertain.length) warnings.push(`Saknas eller är osäkert: ${uncertain.join(', ')}. Kontrollera originalet.`);
  if (fields.netOre != null && fields.vatOre != null && fields.grossOre != null
    && fields.netOre + fields.vatOre + fields.roundingOre !== fields.grossOre) {
    warnings.push('Osäkra belopp: netto, moms och avrundning stämmer inte med totalbeloppet. Kontrollera samtliga belopp mot originalet.');
  }
  if (!text.trim()) warnings.push('PDF:en saknar läsbar text. Fyll i uppgifterna från originalet.');
  if (!fields.invoiceNumber || fields.netOre == null || fields.grossOre == null) warnings.push('Alla fakturauppgifter kunde inte hittas. Fyll i det som saknas.');
  if (fields.currency !== 'SEK') warnings.push('Valutan behöver kontrolleras. Endast SEK kan bekräftas.');
  warnings.push('Uppgifterna är förslag. Kontrollera alltid nummer, datum och belopp mot originalet.');
  const orderResult = suggestBevegoOrders(text, fields);
  warnings.push(...orderResult.warnings);
  return { fields: { ...fields, orders: orderResult.orders }, warnings };
}
