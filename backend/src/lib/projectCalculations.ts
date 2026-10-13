import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseDateOnly } from './dateOnly.js';

const text = z.string().max(2000);
const id = z.string().min(1).max(150);
const amount = z.number().finite().min(0).max(100_000_000);
const date = z.string().refine(value => value === '' || Boolean(parseDateOnly(value)), 'Ogiltigt datum');
const material = z.object({
  id, materialArticleId: text, articleNumber: text, description: text,
  unit: z.string().max(30), unitCost: amount, usagePerWorkUnit: amount,
  materialImportId: text, supplierName: text, sourceText: text,
}).strict();
const line = z.object({
  id, referenceId: text, category: text, referenceArticle: text, dimension: text,
  workItem: text, internalDescription: text, customerDescription: text,
  quantity: amount, workUnit: z.string().max(30), materialCostExcluded: z.boolean(),
  materials: z.array(material).max(30), laborMinutesPerUnit: amount,
  timeSource: z.enum(['historicalPrisa', 'ownEstimate', 'measuredProduction', 'manualOverride']),
  referenceMinutesPerUnit: amount.nullable(), pipeDiameterMm: amount.nullable(), insulationMm: amount.nullable(),
  masterMomentId: text.optional(), masterStatus: text.optional(), masterNotes: text.optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.materialCostExcluded && value.materials.length > 0) || (!value.materialCostExcluded && value.materials.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'Material saknas eller motsäger markeringen för materialfri rad.' });
  }
  if (new Set(value.materials.map(m => m.id)).size !== value.materials.length) ctx.addIssue({ code: 'custom', message: 'Dubbla material-id på raden.' });
});
const totalNumber = z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000);
export const totalsSchema = z.object({
  materialBaseCost: totalNumber, materialCostWithWaste: totalNumber, materialCustomerPrice: totalNumber,
  laborHours: totalNumber, internalLaborCost: totalNumber, customerLaborPrice: totalNumber, directCost: totalNumber,
  calculatedPrice: totalNumber, contribution: totalNumber, contributionMarginPercent: totalNumber,
  bidContribution: totalNumber, bidMarginPercent: totalNumber, bidVat: totalNumber.nullable(), bidIncludingVat: totalNumber.nullable(),
}).strict();
export const calculationDocumentSchema = z.object({
  id, revision: z.number().int().positive(), name: z.string().min(1).max(300).refine(value => value.trim().length > 0),
  customerName: text, customerContact: text, quoteNumber: z.string().max(150),
  quoteDate: date, validUntil: date, scope: z.string().max(20_000), terms: z.string().max(20_000),
  status: z.enum(['draft', 'quoted', 'accepted', 'archived']), archived: z.boolean(), totals: totalsSchema, manualBid: amount,
  customerHourlyRate: amount, internalHourlyCost: amount,
  materialMarkupPercent: z.number().finite().min(0).max(1000), wastePercent: z.number().finite().min(0).max(1000),
  vatPercent: z.number().finite().min(0).max(100),
  createdAt: z.string().max(50).optional(), updatedAt: z.string().max(50).optional(),
  lines: z.array(line).min(1).max(500),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.lines.map(l => l.id)).size !== value.lines.length) ctx.addIssue({ code: 'custom', message: 'Dubbla kalkylrader.' });
});
export const calculationImportSchema = z.object({
  format: z.literal('andersson-kalkyl-v1'), document: calculationDocumentSchema,
}).strict();
export type CalculationDocument = z.infer<typeof calculationDocumentSchema>;

export class CalculationError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

// Frozen schema/engine version 1. Future calculation changes require a NEW version;
// never reinterpret saved v1 snapshots with a different algorithm.
// Port of AnderssonKalkyl/src-tauri/src/calculation.rs::calculate_totals.
// Rust rounds half away from zero, including negative contribution margins.
export function calculateDocumentV1(document: CalculationDocument) {
  const round = (n: number) => Math.sign(n) * Math.round(Math.abs(n));
  const money = (cents: number) => round(cents) / 100;
  const rate = round(document.customerHourlyRate * 100);
  const cost = round(document.internalHourlyCost * 100);
  const bid = round(document.manualBid * 100);
  const vat = round(document.vatPercent * 100);
  const waste = 1 + round(document.wastePercent * 100) / 10_000;
  const markup = 1 + round(document.materialMarkupPercent * 100) / 10_000;
  const rows = document.lines.map(line => {
    const materialUnit = line.materials.reduce((sum, m) => sum + m.usagePerWorkUnit * m.unitCost * 100, 0);
    const base = line.quantity * materialUnit;
    const laborHours = line.quantity * line.laborMinutesPerUnit / 60;
    const unit = materialUnit * waste * markup + line.laborMinutesPerUnit / 60 * rate;
    const adjustment = line.referenceId.startsWith('master-')
      ? round(round(unit + 1e-7) * line.quantity + 1e-7) - unit * line.quantity : 0;
    return { id: line.id, base, laborHours, adjustment,
      materialCost: money(base * waste), calculatedPrice: money(base * waste * markup + laborHours * rate + adjustment) };
  });
  const base = rows.reduce((sum, row) => sum + row.base, 0);
  const hours = rows.reduce((sum, row) => sum + row.laborHours, 0);
  const material = base * waste;
  const customerMaterial = material * markup;
  const direct = material + hours * cost;
  const price = customerMaterial + hours * rate + rows.reduce((sum, row) => sum + row.adjustment, 0);
  const contribution = price - direct;
  const bidContribution = bid - direct;
  const totals = {
    materialBaseCost: money(base), materialCostWithWaste: money(material), materialCustomerPrice: money(customerMaterial),
    laborHours: round(hours * 10_000) / 10_000, internalLaborCost: money(hours * cost), customerLaborPrice: money(hours * rate),
    directCost: money(direct), calculatedPrice: money(price), contribution: money(contribution),
    contributionMarginPercent: price === 0 ? 0 : round(contribution / price * 10_000) / 100,
    bidContribution: money(bidContribution), bidMarginPercent: bid === 0 ? 0 : round(bidContribution / bid * 10_000) / 100,
    bidVat: bid === 0 ? null : money(bid * vat / 10_000),
    bidIncludingVat: bid === 0 ? null : money(bid + bid * vat / 10_000),
  };
  if (Object.values(totals).some(value => value !== null && (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000))) throw new CalculationError('Kalkylen innehåller för stora belopp eller mängder.');
  return { rows: rows.map(({ base, adjustment, ...row }) => row), totals };
}

export function inspectCalculationV1(input: unknown) {
  const { document } = calculationImportSchema.parse(input);
  const calculated = calculateDocumentV1(document);
  for (const key of Object.keys(calculated.totals) as Array<keyof typeof calculated.totals>) {
    const expected = document.totals[key];
    const actual = calculated.totals[key];
    if (expected === null || actual === null ? expected !== actual : Math.abs(expected - actual) > 1e-8) {
      throw new CalculationError('Kalkylens sparade summor stämmer inte med beräkningen. Importen stoppas; kontrollera källversionen.');
    }
  }
  // Zod reconstructs all objects in schema order, making key order immaterial.
  const fingerprint = createHash('sha256').update(JSON.stringify(document)).digest('hex');
  return { document, fingerprint, ...calculated };
}
