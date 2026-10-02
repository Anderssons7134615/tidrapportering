import type { InvoiceDraft, InvoiceHeader, SupplierInvoice } from '../types/supplierInvoice';

export type InvoiceForm = Omit<InvoiceHeader, 'netOre' | 'vatOre' | 'roundingOre' | 'grossOre'> & {
  net: string; vat: string; rounding: string; gross: string;
  allocations: Array<{ projectId: string; amount: string; note: string }>;
};
export function moneyInput(ore: number | null | undefined) {
  return ore == null ? '' : (ore / 100).toFixed(2).replace('.', ',');
}
export function parseMoneyInput(value: string): number | null {
  if (!value.trim()) return null;
  const match = /^(-?)(\d{1,9})(?:[,.](\d{1,2}))?$/.exec(value.replace(/[\s\u00a0]/g, ''));
  if (!match) throw new Error('Ange belopp med högst två decimaler. Exempel: 1 234,50.');
  const ore = (Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))) * (match[1] ? -1 : 1);
  if (Math.abs(ore) > 2_000_000_000) throw new Error('Beloppet får vara högst 20 000 000 kr.');
  return ore;
}
export function invoiceToForm(invoice: SupplierInvoice): InvoiceForm {
  return {
    supplierName: invoice.supplierName, supplierOrgNumber: invoice.supplierOrgNumber, invoiceNumber: invoice.invoiceNumber,
    documentType: invoice.documentType, issueDate: invoice.issueDate?.slice(0, 10) || null, dueDate: invoice.dueDate?.slice(0, 10) || null,
    currency: 'SEK', note: invoice.note, net: moneyInput(invoice.netOre), vat: moneyInput(invoice.vatOre), rounding: moneyInput(invoice.roundingOre), gross: moneyInput(invoice.grossOre),
    allocations: invoice.allocations.map((row) => ({ projectId: row.projectId, amount: moneyInput(row.netOre), note: row.note || '' })),
  };
}
export function formToDraft(form: InvoiceForm, revision: number): InvoiceDraft {
  const { net, vat, rounding, gross, allocations, ...header } = form;
  return { ...header, issueDate: header.issueDate || null, dueDate: header.dueDate || null, revision, netOre: parseMoneyInput(net), vatOre: parseMoneyInput(vat), roundingOre: parseMoneyInput(rounding) ?? 0, grossOre: parseMoneyInput(gross),
    allocations: allocations.map((row) => {
      const amount = parseMoneyInput(row.amount);
      if (!row.projectId || amount == null) throw new Error('Välj projekt och ange belopp i varje fördelningsrad.');
      return { projectId: row.projectId, netOre: amount, note: row.note.trim() || null };
    }) };
}
