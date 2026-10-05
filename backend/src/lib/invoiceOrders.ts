import { InvoiceError, parseInvoiceMoney } from './supplierInvoiceRules.js';

export type InvoiceOrder = {
  orderNumber: string;
  customerReference: string | null;
  pages: number[];
  netOre: number;
};
type Header = { supplierName: string | null; invoiceNumber: string | null; documentType: string; currency: string | null; netOre: number | null; vatOre: number | null; roundingOre: number; grossOre: number | null };

/** Only release an order set when every printed order total agrees with the
 * closing summary and the invoice total. Never treat one page as one order. */
export function suggestBevegoOrders(text: string, header: Header): { orders: InvoiceOrder[]; warnings: string[] } {
  if (header.supplierName !== 'Bevego' || !/Ordertotal/i.test(text)) return { orders: [], warnings: [] };
  const uncertain = () => ({ orders: [], warnings: ['Orderdelarna kunde inte stämmas av säkert. Kontrollera originalet och fördela manuellt.'] });
  if (!header.invoiceNumber || header.currency !== 'SEK' || header.netOre == null || header.vatOre == null || header.grossOre == null
    || header.netOre + header.vatOre + header.roundingOre !== header.grossOre) return uncertain();
  const signed = (amount: number) => header.documentType === 'CREDIT' ? -Math.abs(amount) : amount;
  const groups = new Map<string, { pages: number[]; refs: Set<string>; totals: number[] }>();
  const pages = text.replace(/\u00a0/g, ' ').split('\f');
  for (const [index, page] of pages.entries()) {
    if (!page.trim()) continue;
    const ids = [...page.matchAll(/(?:^|\s)Fakt\.datum\s+\d{2}-\d{2}-\d{2}\s+Ordernummer\s+(\d{2,20})(?=\s|$)/gi)].map((match) => match[1]);
    if (ids.length !== 1) return uncertain();
    const id = ids[0];
    const group = groups.get(id) || { pages: [], refs: new Set<string>(), totals: [] };
    group.pages.push(index + 1);
    const ref = /\bErt ordernummer\s*\n([^\n]*)/i.exec(page)?.[1]?.trim();
    if (ref && !/^(?:Godsmärke|Vår referens|Fakt\.datum|Kundnummer)\b/i.test(ref)) {
      if (ref.length > 100) return uncertain();
      group.refs.add(ref);
    }
    for (const match of page.matchAll(/\bOrdertotal\.*\s+(-?\d[\d.]*,\d{2}-?)(?=\s|$)/gi)) {
      const value = parseInvoiceMoney(match[1]);
      if (value == null) return uncertain();
      group.totals.push(signed(value));
    }
    groups.set(id, group);
  }
  const summaryStart = /Ordernummer\s+Er referens\s+Ert ordernr\.\s+Order total\s*\n/i.exec(text);
  if (!summaryStart) return uncertain();
  const summary = new Map<string, number>();
  for (const line of text.slice(summaryStart.index + summaryStart[0].length).trim().split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^\s*(\d{2,20})\s+.*?(-?\d[\d.]*,\d{2}-?)\s*$/.exec(line);
    if (!match || summary.has(match[1])) return uncertain();
    const amount = parseInvoiceMoney(match[2]);
    if (amount == null) return uncertain();
    summary.set(match[1], signed(amount));
  }
  const orders: InvoiceOrder[] = [];
  for (const [orderNumber, group] of groups) {
    if (group.refs.size > 1 || group.totals.length !== 1 || summary.get(orderNumber) !== group.totals[0]) return uncertain();
    const netOre = group.totals[0];
    if ((header.documentType === 'CREDIT' ? netOre > 0 : netOre < 0)) return uncertain();
    orders.push({ orderNumber, customerReference: [...group.refs][0] || null, pages: group.pages, netOre });
  }
  if (!orders.length || orders.length > 100 || summary.size !== orders.length || orders.reduce((sum, order) => sum + order.netOre, 0) !== header.netOre) return uncertain();
  return { orders, warnings: [] };
}

export type OrderAssignment = { orderNumber: string; projectId: string | null };
export function matchInvoiceOrders(orders: InvoiceOrder[], projects: Array<{ id: string; code: string }>) {
  const orderAssignments = orders.map((order) => {
    const code = /^(\d+)(?:\s|$)/.exec(order.customerReference || '')?.[1];
    const matches = code ? projects.filter((project) => project.code === code) : [];
    return { orderNumber: order.orderNumber, projectId: matches.length === 1 ? matches[0].id : null };
  });
  const groups = new Map<string, { netOre: number; orders: string[] }>();
  for (const [index, assignment] of orderAssignments.entries()) {
    if (!assignment.projectId) continue;
    const group = groups.get(assignment.projectId) || { netOre: 0, orders: [] };
    group.netOre += orders[index].netOre;
    group.orders.push(assignment.orderNumber);
    groups.set(assignment.projectId, group);
  }
  const allocations = [...groups].map(([projectId, group]) => ({ projectId, netOre: group.netOre, note: `Order: ${group.orders.join(', ')}`.slice(0, 500) }));
  return { orderAssignments, allocations };
}

export function validateOrderAssignments(orders: InvoiceOrder[], assignments: OrderAssignment[], allocations: Array<{ projectId: string; netOre: number }>, netOre: number | null) {
  if (!orders.length || assignments.length !== orders.length || new Set(assignments.map((row) => row.orderNumber)).size !== orders.length
    || orders.reduce((sum, order) => sum + order.netOre, 0) !== netOre) throw new InvoiceError('Orderdelarna stämmer inte med fakturans netto. Kontrollera fördelningen.');
  const totals = new Map<string, number>();
  for (const row of assignments) {
    const order = orders.find((order) => order.orderNumber === row.orderNumber);
    if (!order) throw new InvoiceError('En orderdel hittades inte. Läs in fakturan igen.');
    if (row.projectId) totals.set(row.projectId, (totals.get(row.projectId) || 0) + order.netOre);
  }
  if (allocations.length !== totals.size || allocations.some((row) => totals.get(row.projectId) !== row.netOre)) throw new InvoiceError('Projektfördelningen stämmer inte med de valda orderdelarna.');
}
