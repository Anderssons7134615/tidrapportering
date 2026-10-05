import type { InvoiceDraft, InvoiceHeader, SupplierInvoice, OrderAssignment, InvoiceOrder } from '../types/supplierInvoice';

export type InvoiceForm = Omit<InvoiceHeader, 'netOre' | 'vatOre' | 'roundingOre' | 'grossOre'> & {
  net: string; vat: string; rounding: string; gross: string;
  allocations: Array<{ projectId: string; amount: string; note: string }>;
  orderAssignments: OrderAssignment[] | null;
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
    orderAssignments: invoice.suggestions?.orderAssignments || null,
  };
}
export function suggestOrderProjects(orders: InvoiceOrder[], projects: Array<{ id: string; code: string }>): OrderAssignment[] {
  return orders.map((order) => {
    const code = /^(\d+)(?:\s|$)/.exec(order.customerReference || '')?.[1];
    const matches = code ? projects.filter((project) => project.code === code) : [];
    return { orderNumber: order.orderNumber, projectId: matches.length === 1 ? matches[0].id : null };
  });
}
export function fillInvoiceSuggestions(current: InvoiceForm, suggested: SupplierInvoice['suggestions']): InvoiceForm {
  return { ...current, supplierName: current.supplierName || suggested.supplierName || null, invoiceNumber: current.invoiceNumber || suggested.invoiceNumber || null,
    issueDate: current.issueDate || suggested.issueDate || null, dueDate: current.dueDate || suggested.dueDate || null,
    documentType: !current.net && !current.gross ? suggested.documentType || current.documentType : current.documentType,
    net: current.net || moneyInput(suggested.netOre), vat: current.vat || moneyInput(suggested.vatOre), gross: current.gross || moneyInput(suggested.grossOre),
    rounding: !current.net && !current.gross ? moneyInput(suggested.roundingOre ?? 0) : current.rounding };
}
export function allocateOrders(orders: InvoiceOrder[], assignments: OrderAssignment[]): InvoiceForm['allocations'] {
  const groups = new Map<string, { netOre: number; orders: string[] }>();
  for (const assignment of assignments) {
    if (!assignment.projectId) continue;
    const order = orders.find((order) => order.orderNumber === assignment.orderNumber);
    if (!order) throw new Error('Orderdelen saknas. Läs in fakturan igen.');
    const group = groups.get(assignment.projectId) || { netOre: 0, orders: [] };
    group.netOre += order.netOre; group.orders.push(order.orderNumber);
    groups.set(assignment.projectId, group);
  }
  return [...groups].map(([projectId, group]) => ({ projectId, amount: moneyInput(group.netOre), note: `Order: ${group.orders.join(', ')}`.slice(0, 500) }));
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
