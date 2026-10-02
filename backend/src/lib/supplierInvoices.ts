import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { extractInvoicePdf, INVOICE_PARSER_VERSION, suggestInvoiceFields } from './invoicePdf.js';
import { InvoiceDraft, InvoiceError, INVOICE_MAX_BYTES, invoiceIdentity, validateInvoiceAmounts, validateInvoiceConfirmation } from './supplierInvoiceRules.js';

// Bytes are deliberately excluded from every ordinary invoice response.
export const invoiceSelect = {
  id: true, status: true, documentType: true, revision: true,
  supplierName: true, supplierOrgNumber: true, invoiceNumber: true,
  issueDate: true, dueDate: true, currency: true, netOre: true, vatOre: true, roundingOre: true, grossOre: true,
  note: true, suggestions: true, parseWarnings: true, parserVersion: true, statusReason: true,
  createdAt: true, updatedAt: true, confirmedAt: true,
  document: { select: { originalName: true, byteSize: true, sha256: true } },
  allocations: { select: { projectId: true, netOre: true, note: true, project: { select: { name: true, code: true } } }, orderBy: { projectId: 'asc' as const } },
} satisfies Prisma.SupplierInvoiceSelect;
type Record = Prisma.SupplierInvoiceGetPayload<{ select: typeof invoiceSelect }>;
type Actor = { id: string; companyId: string };
type Tx = Prisma.TransactionClient;

export function invoiceDto(row: Record) {
  const allocatedOre = row.allocations.reduce((sum, allocation) => sum + allocation.netOre, 0);
  return { ...row, allocatedOre, unallocatedOre: row.netOre == null ? null : row.netOre - allocatedOre };
}
function auditValue(row: Record | null) {
  if (!row) return null;
  const { suggestions, parseWarnings, ...value } = row;
  return JSON.stringify(value);
}
async function audit(tx: Tx, user: Actor, action: string, id: string, oldRow: Record | null, newRow: Record) {
  await tx.auditLog.create({ data: { userId: user.id, entityType: 'SupplierInvoice', entityId: id, action,
    oldValue: auditValue(oldRow), newValue: auditValue(newRow) } });
}
async function read(tx: Tx, companyId: string, id: string) {
  const row = await tx.supplierInvoice.findFirst({ where: { id, companyId }, select: invoiceSelect });
  if (!row) throw new InvoiceError('Fakturan hittades inte.', 404, 'INVOICE_NOT_FOUND');
  return row;
}
async function claim(tx: Tx, user: Actor, row: Record, revision: number, data: Prisma.SupplierInvoiceUncheckedUpdateManyInput = {}) {
  const changed = await tx.supplierInvoice.updateMany({ where: { id: row.id, companyId: user.companyId, revision, status: row.status }, data: { ...data, revision: { increment: 1 } } });
  if (changed.count !== 1) throw new InvoiceError('Fakturan har ändrats. Ladda om innan du fortsätter.', 409, 'INVOICE_CONFLICT');
}
function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new InvoiceError('Fakturan finns redan för denna leverantör. Sök på fakturanumret i Inköp.', 409, 'INVOICE_DUPLICATE');
  throw error;
}

export function createInvoiceService(db: typeof prisma = prisma, extract = extractInvoicePdf) {
  return {
    async upload(user: Actor, bytes: Buffer, originalName: string) {
      if (bytes.length > INVOICE_MAX_BYTES || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new InvoiceError('Välj en PDF-fil som är högst 10 MB.');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const existing = await db.supplierInvoiceDocument.findFirst({ where: { companyId: user.companyId, sha256 }, select: { invoiceId: true } });
      if (existing) return { invoice: invoiceDto(await read(db, user.companyId, existing.invoiceId)), duplicate: true };
      let suggestions: Prisma.InputJsonValue = {};
      let warnings: string[];
      try {
        const parsed = suggestInvoiceFields((await extract(bytes)).text);
        suggestions = parsed.fields; warnings = parsed.warnings;
      } catch (error) {
        warnings = [error instanceof InvoiceError ? error.message : 'PDF-texten kunde inte läsas. Fyll i uppgifterna från originalet.'];
      }
      try {
        const invoice = await db.$transaction(async (tx) => {
          const id = randomUUID();
          await tx.supplierInvoice.create({ data: { id, companyId: user.companyId, createdByUserId: user.id, suggestions,
            parseWarnings: warnings, parserVersion: INVOICE_PARSER_VERSION } });
          await tx.supplierInvoiceDocument.create({ data: { companyId: user.companyId, invoiceId: id, sha256, content: bytes,
            byteSize: bytes.length, originalName: originalName.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'faktura.pdf' } });
          const row = await read(tx, user.companyId, id);
          await audit(tx, user, 'CREATE', id, null, row);
          return invoiceDto(row);
        });
        return { invoice, duplicate: false };
      } catch (error) {
        // A simultaneous upload of the exact same file is an idempotent replay.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const match = await db.supplierInvoiceDocument.findFirst({ where: { companyId: user.companyId, sha256 }, select: { invoiceId: true } });
          if (match) return { invoice: invoiceDto(await read(db, user.companyId, match.invoiceId)), duplicate: true };
        }
        return duplicateError(error);
      }
    },
    async save(user: Actor, id: string, draft: InvoiceDraft) {
      validateInvoiceAmounts(draft);
      try {
        return await db.$transaction(async (tx) => {
          const old = await read(tx, user.companyId, id);
          if (old.status !== 'DRAFT') throw new InvoiceError('Öppna fakturan för rättelse innan den ändras.', 409);
          const { revision, allocations, ...header } = draft;
          await claim(tx, user, old, revision, { ...header, ...invoiceIdentity(header.supplierName, header.supplierOrgNumber, header.invoiceNumber) });
          const ids = allocations.map((row) => row.projectId);
          const projects = await tx.project.findMany({ where: { id: { in: ids }, companyId: user.companyId }, select: { id: true, active: true } });
          if (projects.length !== ids.length) throw new InvoiceError('Ett projekt i fördelningen hittades inte.');
          // Completed projects may receive late invoices, but archived projects
          // cannot receive a new allocation. Existing history can be corrected.
          if (projects.some((project) => !project.active && !old.allocations.some((row) => row.projectId === project.id))) throw new InvoiceError('Välj ett projekt som inte är arkiverat.');
          await tx.supplierInvoiceAllocation.deleteMany({ where: { invoiceId: id, companyId: user.companyId } });
          if (allocations.length) await tx.supplierInvoiceAllocation.createMany({ data: allocations.map((row) => ({ ...row, invoiceId: id, companyId: user.companyId })) });
          const row = await read(tx, user.companyId, id);
          await audit(tx, user, 'UPDATE', id, old, row);
          return invoiceDto(row);
        });
      } catch (error) { return duplicateError(error); }
    },
    async transition(user: Actor, id: string, revision: number, action: 'confirm' | 'reopen' | 'void', reason?: string) {
      return db.$transaction(async (tx) => {
        const old = await read(tx, user.companyId, id);
        if (old.status === 'VOID' || (action === 'confirm' && old.status !== 'DRAFT') || (action === 'reopen' && old.status !== 'CONFIRMED')) throw new InvoiceError('Fakturans status har ändrats. Ladda om och försök igen.', 409);
        if (action === 'confirm') {
          validateInvoiceConfirmation({ ...old, currency: 'SEK' });
          if (!old.document) throw new InvoiceError('Originalet saknas. Fakturan kan inte bekräftas.');
        } else if (!reason?.trim()) throw new InvoiceError('Ange varför fakturan ska rättas eller makuleras.');
        await claim(tx, user, old, revision, { status: action === 'confirm' ? 'CONFIRMED' : action === 'reopen' ? 'DRAFT' : 'VOID',
          confirmedByUserId: action === 'confirm' ? user.id : null, confirmedAt: action === 'confirm' ? new Date() : null,
          // Retain the human-readable identity and immutable original, but
          // release the active duplicate reservation for a corrected PDF.
          ...(action === 'void' ? { supplierKey: null, numberKey: null } : {}),
          statusReason: action === 'confirm' ? null : reason!.trim() });
        const row = await read(tx, user.companyId, id);
        await audit(tx, user, action.toUpperCase(), id, old, row);
        return invoiceDto(row);
      });
    },
  };
}
