import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceDraftSchema, invoiceIdentity, parseInvoiceMoney, validateInvoiceAmounts, validateInvoiceConfirmation } from './supplierInvoiceRules.js';
import { extractInvoicePdf, suggestInvoiceFields } from './invoicePdf.js';
import { validateOrderAssignments } from './invoiceOrders.js';

export const validDraft = () => invoiceDraftSchema.parse({ revision: 1, supplierName: 'Testleverantör', supplierOrgNumber: '556000-0000', invoiceNumber: 'TEST-1', documentType: 'INVOICE', issueDate: '2026-10-02', dueDate: null, currency: 'SEK', netOre: 10000, vatOre: 2500, roundingOre: 0, grossOre: 12500, note: null, allocations: [{ projectId: 'p1', netOre: 6000, note: null }] });

test('öresbelopp är exakta och oklar notation eller för stora belopp avvisas', () => {
  assert.equal(parseInvoiceMoney('1 234,56 kr'), 123456);
  assert.equal(parseInvoiceMoney('−0,01'), -1);
  assert.equal(parseInvoiceMoney('0,14-'), -14);
  assert.equal(parseInvoiceMoney('-0,14-'), null);
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

// Synthetic multi-page collection invoice; no customer data from the real PDF.
const orderPage = (id: string, reference: string | null, total?: string) => `BEVEGO\nFaktura 990009\nFakt.datum 26-10-01 Ordernummer ${id}\n${reference === null ? '' : `Ert ordernummer\n${reference}\nGodsmärke\n`}\n${total ? `Ordertotal................ ${total}` : ''}`;
const collectionText = [orderPage('880001', '0042 TEST', '10,01'), orderPage('880002', '', undefined), orderPage('880002', null, '20,00'), orderPage('880003', 'LAGER', '30,00')].join('\f') + `\nSumma före moms\n60,01\nSumma moms\n15,00\nÖresutjämning\n0,01-\nFakt.belopp\nSEK 75,00\nOrdernummer Er referens Ert ordernr. Order total\n880001 TEST 0042 TEST 10,01\n880002 TEST 20,00\n880003 TEST LAGER 30,00`;

test('sammanställning bevarar order över sidgräns och saknad referens, med efterställt minus', () => {
  const { fields } = suggestInvoiceFields(collectionText);
  assert.deepEqual([fields.netOre, fields.vatOre, fields.roundingOre, fields.grossOre], [6001, 1500, -1, 7500]);
  assert.deepEqual(fields.orders, [
    { orderNumber: '880001', customerReference: '0042 TEST', pages: [1], netOre: 1001 },
    { orderNumber: '880002', customerReference: null, pages: [2, 3], netOre: 2000 },
    { orderNumber: '880003', customerReference: 'LAGER', pages: [4], netOre: 3000 },
  ]);
  const credit = suggestInvoiceFields(collectionText.replaceAll('Faktura ', 'Kreditfaktura ')).fields;
  assert.equal(credit.roundingOre, 1);
  assert.deepEqual(credit.orders.map((row) => row.netOre), [-1001, -2000, -3000]);
  const blank = suggestInvoiceFields(collectionText.replace('\f', '\f\f')).fields;
  assert.deepEqual(blank.orders.map((order) => order.pages), [[1], [3, 4], [5]]);
});

test('orderförslag avvisas vid saknad/dubbel order, olika referens, valuta eller beloppskonflikt', () => {
  for (const text of [
    collectionText.replace('880002 TEST 20,00', '880002 TEST 20,01'),
    collectionText + '\n880003 TEST LAGER 30,00',
    collectionText.replace('880003 TEST LAGER 30,00', ''),
    collectionText.replace('SEK 75,00', 'EUR 75,00'),
    collectionText.replace('SEK 75,00', 'SEK 75,01'),
    collectionText.replace('Faktura 990009', 'Faktura 990008'),
    collectionText.replace('20,00\f', '20,00\nOrdertotal.... 20,00\f'),
    collectionText.replace('Ert ordernummer\n\nGodsmärke', 'Ert ordernummer\n0042\nGodsmärke').replace('Ordernummer 880002\n\n', 'Ordernummer 880002\nErt ordernummer\n0043\nGodsmärke\n'),
  ]) assert.equal(suggestInvoiceFields(text).fields.orders.length, 0, text);
});

test('orderfördelning kräver samtliga order exakt en gång och samma öressummor per projekt', () => {
  const orders = suggestInvoiceFields(collectionText).fields.orders;
  const choices = orders.map((row, index) => ({ orderNumber: row.orderNumber, projectId: index === 2 ? null : 'pa' }));
  assert.doesNotThrow(() => validateOrderAssignments(orders, choices, [{ projectId: 'pa', netOre: 3001 }], 6001));
  assert.throws(() => validateOrderAssignments(orders, [choices[0], choices[0], choices[2]], [], 6001));
  assert.throws(() => validateOrderAssignments(orders, choices, [{ projectId: 'pa', netOre: 3000 }], 6001));
  assert.throws(() => validateOrderAssignments(orders, choices, [{ projectId: 'pa', netOre: 3001 }], 6000));
  assert.throws(() => validateOrderAssignments(orders, choices.map((row) => ({ ...row, orderNumber: 'unknown' })), [], 6001));
});
