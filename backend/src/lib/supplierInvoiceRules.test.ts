import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceDraftSchema, invoiceIdentity, parseInvoiceMoney, validateInvoiceAmounts, validateInvoiceConfirmation } from './supplierInvoiceRules.js';
import { extractInvoicePdf, suggestInvoiceFields } from './invoicePdf.js';

export const validDraft = () => invoiceDraftSchema.parse({ revision: 1, supplierName: 'Testleverantör', supplierOrgNumber: '556000-0000', invoiceNumber: 'TEST-1', documentType: 'INVOICE', issueDate: '2026-10-02', dueDate: null, currency: 'SEK', netOre: 10000, vatOre: 2500, roundingOre: 0, grossOre: 12500, note: null, allocations: [{ projectId: 'p1', netOre: 6000, note: null }] });

test('öresbelopp är exakta och oklar notation eller för stora belopp avvisas', () => {
  assert.equal(parseInvoiceMoney('1 234,56 kr'), 123456);
  assert.equal(parseInvoiceMoney('−0,01'), -1);
  assert.equal(parseInvoiceMoney('1.234,56 SEK'), 123456);
  for (const value of ['NaN', '1e5', '0.001', '20 000 000,01', '1,2,3']) assert.equal(parseInvoiceMoney(value), null);
});
test('moms, avrundning, kredit och ofördelat belopp kontrolleras', () => {
  const draft = validDraft();
  assert.deepEqual(validateInvoiceConfirmation(draft), { allocatedOre: 6000, unallocatedOre: 4000 });
  assert.throws(() => validateInvoiceConfirmation({ ...draft, grossOre: 12501 }), /stämmer inte/);
  assert.doesNotThrow(() => validateInvoiceConfirmation({ ...draft, grossOre: 12501, roundingOre: 1 }));
  const credit = { ...draft, documentType: 'CREDIT' as const, netOre: -10000, vatOre: -2500, grossOre: -12500, allocations: [{ projectId: 'p1', netOre: -10000, note: null }] };
  assert.equal(validateInvoiceConfirmation(credit).unallocatedOre, 0);
  assert.throws(() => validateInvoiceAmounts({ ...credit, allocations: draft.allocations }), /negativa/);
  assert.throws(() => validateInvoiceAmounts({ ...draft, allocations: [{ ...draft.allocations[0], netOre: 10001 }] }), /större/);
  assert.throws(() => validateInvoiceAmounts({ ...draft, allocations: [draft.allocations[0], draft.allocations[0]] }), /en gång/);
  assert.throws(() => validateInvoiceConfirmation({ ...draft, supplierOrgNumber: null }), /organisationsnummer/);
});
test('organisationsnummer och svenskt VAT-nummer ger samma dubblettnyckel', () => {
  assert.deepEqual(invoiceIdentity('Leverantör AB', '556000-0000', ' ab  123 '), invoiceIdentity('LEV', 'SE556000000001', 'AB 123'));
});
test('PDF-förslag gissar inte moms och stoppar tvetydiga värden', () => {
  const parsed = suggestInvoiceFields('Bevego\nFakturanummer: 12345\nFakturadatum 2026-10-02\nNetto 1 000,00\nMoms 250,00\nAtt betala 1 250,00 SEK');
  assert.equal(parsed.fields.netOre, 100000);
  assert.equal(parsed.fields.vatOre, 25000);
  assert.equal(parsed.fields.issueDate, '2026-10-02');
  assert.equal(parsed.fields.supplierOrgNumber, null);
  assert.equal(suggestInvoiceFields('Netto 10,00\nNetto 20,00\nSEK').fields.netOre, null);
  assert.equal(suggestInvoiceFields('Netto 10,00 SEK').fields.vatOre, null);
  assert.equal(suggestInvoiceFields('Totalbelopp 10,00 eur').fields.currency, null);
});
test('kreditförslag vänder tryckt avrundning tillsammans med positiva kreditbelopp', () => {
  const fields = suggestInvoiceFields('Kreditfaktura\nNetto 1,00\nMoms 0,25\nÖresavrundning -0,25\nAtt betala 1,00 SEK').fields;
  assert.equal(fields.netOre, -100); assert.equal(fields.vatOre, -25); assert.equal(fields.roundingOre, 25); assert.equal(fields.grossOre, -100);
});

// Synthetic values; layout mirrors the locally checked Bevego document.
const bevegoText = `BEVEGO Faktura 990001 Ordernummer 880001 Fakt.datum 26-09-01
Betaln. villkor FF-datum
30 Dagar netto 26-10-01
Ordertotal 50,00
Moms 25,00 % av 50,00 12,50
Summa före moms Summa moms Öresutjämning Fakt.belopp
1.000,01 250,00 -0,01 SEK 1.250,00
IBAN SEK: TEST IBAN EUR: TEST`;

test('Bevegos sammanfattning skiljs från ordertotal och bankvaluta', () => {
  const { fields, warnings } = suggestInvoiceFields(bevegoText);
  assert.equal(fields.invoiceNumber, '990001');
  assert.equal(fields.issueDate, '2026-09-01');
  assert.equal(fields.dueDate, '2026-10-01');
  assert.equal(fields.currency, 'SEK');
  assert.deepEqual([fields.netOre, fields.vatOre, fields.roundingOre, fields.grossOre], [100001, 25000, -1, 125000]);
  assert.equal(warnings.some((warning) => /osäker|stämmer inte/.test(warning)), false);
  const credit = suggestInvoiceFields(bevegoText.replace('Faktura', 'Kreditfaktura')).fields;
  assert.deepEqual([credit.netOre, credit.vatOre, credit.roundingOre, credit.grossOre], [-100001, -25000, 1, -125000]);
  const negative = suggestInvoiceFields(bevegoText.replace('Faktura', 'Kreditfaktura').replace('1.000,01 250,00 -0,01 SEK 1.250,00', '-1.000,01 -250,00 0,01 SEK -1.250,00')).fields;
  assert.deepEqual([negative.netOre, negative.vatOre, negative.roundingOre, negative.grossOre], [-100001, -25000, 1, -125000]);
});

test('Bevego lämnar konflikter och oläsbara uppgifter osäkra', () => {
  const conflict = suggestInvoiceFields(`${bevegoText}\nFaktura 990002\nFakt.datum 26-09-02`);
  assert.equal(conflict.fields.invoiceNumber, null);
  assert.equal(conflict.fields.issueDate, null);
  assert.match(conflict.warnings.join(' '), /fakturanummer, fakturadatum/);
  const totals = suggestInvoiceFields(`${bevegoText}\nSumma före moms Summa moms Öresutjämning Fakt.belopp\n2.000,00 500,00 0,00 SEK 2.500,00`);
  assert.equal(totals.fields.netOre, null);
  assert.equal(totals.fields.grossOre, null);
  assert.match(totals.warnings.join(' '), /Flera olika fakturatotaler/);
  assert.match(suggestInvoiceFields(bevegoText.replace('1.250,00', '1.251,00')).warnings.join(' '), /stämmer inte/);
  assert.equal(suggestInvoiceFields(bevegoText.replace('26-09-01', '26-02-30')).fields.issueDate, null);
  assert.equal(suggestInvoiceFields(bevegoText.replace('-0,01 SEK', '-0,01 EUR')).fields.currency, null);
  assert.equal(suggestInvoiceFields('').fields.netOre, null);
  assert.match(suggestInvoiceFields('').warnings.join(' '), /saknar läsbar text/);
});

// Minimal synthetic PDF with no business data. A real parser worker must read it.
function testPdf(text = 'TEST INVOICE 123') {
  const stream = `BT /F1 10 Tf 12 TL 50 700 Td ${text.split('\n').map((line) => `<${Buffer.from(line, 'latin1').toString('hex')}> Tj T*`).join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test('PDF-worker läser text och frigör sin plats efter timeout och parserfel', async () => {
  const result = await extractInvoicePdf(testPdf());
  assert.match(result.text, /TEST INVOICE 123/); assert.equal(result.pages, 1);
  await assert.rejects(extractInvoicePdf(testPdf(), 1), /för lång tid/);
  await assert.rejects(extractInvoicePdf(Buffer.from('%PDF-broken')), /kunde inte/);
  assert.match((await extractInvoicePdf(testPdf())).text, /TEST/);
});

test('syntetisk Bevego-PDF passerar worker och ger kontrollerade förslag', async () => {
  const result = await extractInvoicePdf(testPdf(bevegoText));
  const { fields } = suggestInvoiceFields(result.text);
  assert.equal(fields.invoiceNumber, '990001');
  assert.equal(fields.grossOre, 125000);
  assert.equal(fields.netOre, 100001);
  assert.equal(fields.currency, 'SEK');
});
