import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMaterialCatalogFile } from './materialCatalogImport.js';

test('prepares Bevego AF articles with compact employee names and separate prices', async () => {
  const csv = [
    'Artikelnummer;Beskrivning;Bruttopris;Artikelgrupp;Enhet;Rabattprocent;Nettopris',
    'AF2015;RÖRSLANG AF-2-015 ARMAFLEX 2000 MM;98,50;630;M;72,00;27,58',
    'AF4015;RÖRSLANG AF-4-015 ARMAFLEX 2000 MM;182,30;630;M;72,00;51,04',
  ].join('\r\n');

  const result = await parseMaterialCatalogFile(
    Buffer.from(csv, 'latin1'),
    'Prislista_Bevego_352554_20260529.csv',
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.sourceType, 'BEVEGO_CSV');
  assert.equal(result.rows[0].name, 'AF215');
  assert.equal(result.rows[0].insulationThicknessMm, 13);
  assert.equal(result.rows[0].pipeDimensionMm, 15);
  assert.equal(result.rows[0].listPrice, 98.5);
  assert.equal(result.rows[0].purchasePrice, 27.58);
  assert.equal(result.rows[0].supplier, 'Bevego');
  assert.equal(result.rows[0].priceUpdatedAt?.toISOString(), '2026-05-29T00:00:00.000Z');
  assert.equal(result.rows[1].name, 'AF415');
  assert.equal(result.rows[1].insulationThicknessMm, 19);
});

test('prepares pipe sections with the dimension and thickness in the employee name', async () => {
  const csv = [
    'Artikelnummer;Beskrivning;Bruttopris;Artikelgrupp;Enhet;Rabattprocent;Nettopris',
    'IRTL02230;RÖRSKÅL CLIMPIPE ALU2 ISOVER 22-30-82;126,20;611;M;56,00;55,53',
  ].join('\r\n');

  const result = await parseMaterialCatalogFile(Buffer.from(csv, 'latin1'), 'bevego.csv');

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].name, 'Rörskål 22-30');
  assert.equal(result.rows[0].category, 'Rörskål');
  assert.equal(result.rows[0].pipeDimensionMm, 22);
  assert.equal(result.rows[0].insulationThicknessMm, 30);
  assert.equal(result.rows[0].outerDiameterMm, 82);
  assert.equal(result.rows[0].listPrice, 126.2);
  assert.equal(result.rows[0].purchasePrice, 55.53);
});

test('reports missing required Bevego headers before importing', async () => {
  const result = await parseMaterialCatalogFile(
    Buffer.from('Artikel;Pris\r\nAF215;20', 'latin1'),
    'bevego.csv',
  );

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /Artikelnummer och Beskrivning/);
});
