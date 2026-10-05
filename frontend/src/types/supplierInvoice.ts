export type InvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'VOID';
export interface InvoiceHeader {
  supplierName: string | null;
  supplierOrgNumber: string | null;
  invoiceNumber: string | null;
  documentType: 'INVOICE' | 'CREDIT';
  issueDate: string | null;
  dueDate: string | null;
  currency: 'SEK';
  netOre: number | null;
  vatOre: number | null;
  roundingOre: number;
  grossOre: number | null;
  note: string | null;
}
export interface InvoiceDraft extends InvoiceHeader {
  revision: number;
  allocations: Array<{ projectId: string; netOre: number; note: string | null }>;
  orderAssignments?: OrderAssignment[] | null;
}
export interface InvoiceOrder { orderNumber: string; customerReference: string | null; pages: number[]; netOre: number }
export interface OrderAssignment { orderNumber: string; projectId: string | null }
export interface SupplierInvoice extends InvoiceHeader {
  id: string;
  revision: number;
  status: InvoiceStatus;
  statusReason: string | null;
  suggestions: Partial<Omit<InvoiceHeader, 'currency'>> & { currency?: string | null; orders?: InvoiceOrder[]; orderAssignments?: OrderAssignment[] | null };
  parseWarnings: string[];
  document: { originalName: string; byteSize: number; sha256: string } | null;
  allocations: Array<{ projectId: string; netOre: number; note: string | null; project: { name: string; code: string } }>;
  allocatedOre: number;
  unallocatedOre: number | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface InvoiceList {
  items: SupplierInvoice[];
  total: number;
  page: number;
  pageSize: number;
  confirmedProjectNetOre: number | null;
}
