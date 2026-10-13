import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDocumentV1, inspectCalculationV1 } from './projectCalculations.js';
import { calculationFixture } from './projectCalculationFixture.js';

test('Rust golden: multiple components, waste, money, manual bid and VAT stay distinct', () => {
  const result = inspectCalculationV1(calculationFixture());
  assert.deepEqual(result.totals, {
    materialBaseCost: 596.12, materialCostWithWaste: 655.73, materialCustomerPrice: 819.67,
    laborHours: 1.5, internalLaborCost: 469.5, customerLaborPrice: 735, directCost: 1125.23,
    calculatedPrice: 1554.67, contribution: 429.43, contributionMarginPercent: 27.62,
    bidContribution: 88874.77, bidMarginPercent: 98.75, bidVat: 22500, bidIncludingVat: 112500,
  });
  assert.equal(result.document.manualBid, 90000);
});

test('Rust golden: master unit rounding, non-master total rounding and material-only rows', () => {
  const { document } = calculationFixture();
  document.customerHourlyRate = 500; document.wastePercent = 0; document.manualBid = 0;
  const row = document.lines[0]; row.referenceId = 'master-M1'; row.laborMinutesPerUnit = 3.42;
  row.materials = [{ ...row.materials[0], unitCost: 151.05, usagePerWorkUnit: 1 }];
  assert.equal(calculateDocumentV1(document).totals.calculatedPrice, 2173.10);
  row.referenceId = 'prisa-original';
  assert.equal(calculateDocumentV1(document).totals.calculatedPrice, 2173.13);
  row.referenceId = 'master-material-A'; row.laborMinutesPerUnit = 0;
  const totals = calculateDocumentV1(document).totals;
  assert.equal(totals.materialBaseCost, 1510.50); assert.equal(totals.laborHours, 0);
  assert.equal(totals.bidVat, null);
});

test('validation rejects changed totals, unknown version, duplicate rows, nonfinite/negative inputs and contradictory material-free flags', () => {
  for (const mutate of [
    (x: any) => { x.document.totals.calculatedPrice += 0.01; },
    (x: any) => { x.format = 'future-format'; },
    (x: any) => { x.document.lines.push(x.document.lines[0]); },
    (x: any) => { x.document.lines[0].quantity = -1; },
    (x: any) => { x.document.lines[0].quantity = Infinity; },
    (x: any) => { x.document.lines[0].materialCostExcluded = true; },
    (x: any) => { x.document.quoteDate = '2026-02-30'; },
    (x: any) => { x.document.customerHourlyRate = 1e8; x.document.lines[0].quantity = 1e8; },
  ]) { const input = calculationFixture(); mutate(input); assert.throws(() => inspectCalculationV1(input)); }
});

test('same document with different JSON key order has the same fingerprint; content changes do not', () => {
  const input = calculationFixture();
  const reversed = { ...input, document: Object.fromEntries(Object.entries(input.document).reverse()) };
  assert.equal(inspectCalculationV1(input).fingerprint, inspectCalculationV1(reversed).fingerprint);
  const changed = structuredClone(input); changed.document.terms = 'Ändrade villkor';
  assert.notEqual(inspectCalculationV1(input).fingerprint, inspectCalculationV1(changed).fingerprint);
});
