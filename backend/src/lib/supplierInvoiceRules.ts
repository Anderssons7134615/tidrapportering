import { z } from 'zod';
import { dateOnlySchema } from './dateOnly.js';

export const INVOICE_MAX_ORE = 2_000_000_000;
export const INVOICE_MAX_BYTES = 10 * 1024 * 1024;
const money = z.number().int().min(-INVOICE_MAX_ORE).max(INVOICE_MAX_ORE);
const nullableText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);

export class InvoiceError extends Error {
  constructor(message: string, public statusCode = 400, public code = 'INVOICE_INVALID') { super(message); }
}

export const invoiceDraftSchema = z.object({
  revision: z.number().int().positive(),
  supplierName: nullableText(200),
  supplierOrgNumber: nullableText(40),
  invoiceNumber: nullableText(80),
  documentType: z.enum(['INVOICE', 'CREDIT']),
  issueDate: dateOnlySchema.nullable(),
  dueDate: dateOnlySchema.nullable(),
  currency: z.literal('SEK'),
  netOre: money.nullable(),
  vatOre: money.nullable(),
  roundingOre: z.number().int().min(-100).max(100),
  grossOre: money.nullable(),
  note: nullableText(2000),
  allocations: z.array(z.object({ projectId: z.string().min(1).max(100), netOre: money, note: nullableText(500) })).max(100),
  orderAssignments: z.array(z.object({ orderNumber: z.string().min(1).max(40), projectId: z.string().min(1).max(100).nullable() }).strict()).max(100).nullable().optional(),
}).strict();
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;

export function invoiceIdentity(supplierName: string | null, orgNumber: string | null, invoiceNumber: string | null) {
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('sv');
  // A name may be abbreviated differently on a second copy. Confirmation
  // requires the supplier's organization/VAT number to keep identity stable.
  const organization = orgNumber ? normalize(orgNumber).replace(/[^A-Z0-9]/g, '').replace(/^SE(\d{10})01$/, '$1') : null;
  return {
    supplierKey: organization || null,
    numberKey: invoiceNumber ? normalize(invoiceNumber) : null,
  };
}

export function validateInvoiceAmounts(draft: Pick<InvoiceDraft, 'documentType' | 'netOre' | 'vatOre' | 'grossOre' | 'roundingOre' | 'allocations'>) {
  const sign = draft.documentType === 'CREDIT' ? -1 : 1;
  for (const value of [draft.netOre, draft.vatOre, draft.grossOre, ...draft.allocations.map((row) => row.netOre)]) {
    if (value != null && value * sign < 0) throw new InvoiceError(sign < 0 ? 'Kreditbelopp ska vara negativa eller noll.' : 'Fakturabelopp ska vara positiva eller noll.');
  }
  if (new Set(draft.allocations.map((row) => row.projectId)).size !== draft.allocations.length) throw new InvoiceError('Varje projekt får bara finnas en gång i fördelningen.');
  const allocatedOre = draft.allocations.reduce((sum, row) => sum + row.netOre, 0);
  if (Math.abs(allocatedOre) > Math.abs(draft.netOre ?? 0)) throw new InvoiceError('Projektfördelningen är större än fakturans netto.');
  return { allocatedOre, unallocatedOre: draft.netOre == null ? null : draft.netOre - allocatedOre };
}

export function validateInvoiceConfirmation(draft: Pick<InvoiceDraft, 'supplierName' | 'supplierOrgNumber' | 'invoiceNumber' | 'issueDate' | 'currency' | 'netOre' | 'vatOre' | 'grossOre' | 'roundingOre' | 'documentType' | 'allocations'>) {
  if (!draft.supplierName || !draft.invoiceNumber || !draft.issueDate) throw new InvoiceError('Leverantör, fakturanummer och fakturadatum måste fyllas i.');
  const identity = invoiceIdentity(draft.supplierName, draft.supplierOrgNumber, draft.invoiceNumber);
  if (!identity.supplierKey || identity.supplierKey.length < 5) throw new InvoiceError('Leverantörens organisationsnummer eller VAT-nummer behövs för dubblettkontroll.');
  if (draft.currency !== 'SEK') throw new InvoiceError('Endast fakturor i SEK stöds.');
  if (draft.netOre == null || draft.vatOre == null || draft.grossOre == null) throw new InvoiceError('Netto, moms och totalbelopp måste kontrolleras.');
  if (draft.netOre + draft.vatOre + draft.roundingOre !== draft.grossOre) throw new InvoiceError('Netto, moms och öresavrundning stämmer inte med totalbeloppet.');
  return validateInvoiceAmounts(draft);
}

/** Parse money without binary floating point rounding; never infer a VAT rate. */
export function parseInvoiceMoney(value: string): number | null {
  let normalized = value.trim().replace(/(?:SEK|kr)\.?$/i, '').trim().replace(/[\s\u00a0]/g, '').replace(/−/g, '-');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  if (/^\d+(?:\.\d{1,2})?-$/.test(normalized)) normalized = `-${normalized.slice(0, -1)}`;
  const match = /^(-?)(\d{1,9})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const amount = (Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))) * (match[1] ? -1 : 1);
  return Math.abs(amount) <= INVOICE_MAX_ORE ? amount : null;
}
