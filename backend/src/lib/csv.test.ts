import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsvRow, escapeCsvCell } from './csv.js';

test('CSV cells escape quotes and spreadsheet formulas', () => {
  assert.equal(escapeCsvCell('Anderssons "Väst"'), '"Anderssons ""Väst"""');
  assert.equal(escapeCsvCell('=1+1'), '"\'=1+1"');
  assert.equal(escapeCsvCell('  @SUM(A1:A2)'), '"\'  @SUM(A1:A2)"');
});

test('CSV rows use the configured delimiter for every cell', () => {
  assert.equal(createCsvRow(['Person', '8,5'], ';'), '"Person";"8,5"');
});
