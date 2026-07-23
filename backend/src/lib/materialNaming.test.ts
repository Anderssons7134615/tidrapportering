import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMaterialIdentity } from './materialNaming.js';

test('derives AF2 identity from a supplier description', () => {
  const identity = deriveMaterialIdentity({
    description: 'Armaflex slang AF-2-015 svart',
  });

  assert.equal(identity.displayName, 'AF215');
  assert.equal(identity.category, 'Armaflex');
  assert.equal(identity.productFamily, 'Armaflex');
  assert.equal(identity.manufacturer, 'Armacell');
  assert.equal(identity.pipeDimensionMm, 15);
  assert.equal(identity.insulationThicknessMm, 13);
  assert.equal(identity.outerDiameterMm, null);

  for (const searchTerm of ['AF215', 'AF-2-015', 'Armaflex', '13 mm', 'dim 15']) {
    assert.ok(identity.searchTerms.includes(searchTerm), `missing search term: ${searchTerm}`);
  }
});

test('derives the same AF2 identity when the code is only in the article number', () => {
  const identity = deriveMaterialIdentity({
    description: 'Slang för teknisk isolering',
    articleNumber: 'AF-2-015',
  });

  assert.equal(identity.displayName, 'AF215');
  assert.equal(identity.productFamily, 'Armaflex');
  assert.equal(identity.pipeDimensionMm, 15);
  assert.equal(identity.insulationThicknessMm, 13);
});

test('derives AF4 identity with 19 mm insulation', () => {
  const identity = deriveMaterialIdentity({
    description: 'AF-4-015',
  });

  assert.equal(identity.displayName, 'AF415');
  assert.equal(identity.category, 'Armaflex');
  assert.equal(identity.productFamily, 'Armaflex');
  assert.equal(identity.pipeDimensionMm, 15);
  assert.equal(identity.insulationThicknessMm, 19);
});

test('derives pipe section dimensions from the supplier description', () => {
  const identity = deriveMaterialIdentity({
    description: 'ISOVER RÖRSKÅL CLIMPIPE ALU2 22-30-82',
    articleNumber: 'IRTL02230',
  });

  assert.equal(identity.displayName, 'Rörskål 22-30');
  assert.equal(identity.category, 'Rörskål');
  assert.equal(identity.productFamily, 'Rörskål');
  assert.equal(identity.manufacturer, 'Isover');
  assert.equal(identity.pipeDimensionMm, 22);
  assert.equal(identity.insulationThicknessMm, 30);
  assert.equal(identity.outerDiameterMm, 82);
});

test('keeps every fallback token while making an uppercase description readable', () => {
  const identity = deriveMaterialIdentity({
    description: '  SPECIALPRODUKT   XZ-99   50MM  ',
    articleNumber: 'ART-7788',
  });

  assert.equal(identity.displayName, 'Specialprodukt XZ-99 50MM');
  assert.equal(identity.category, 'Övrigt');
  assert.equal(identity.productFamily, null);
  assert.equal(identity.pipeDimensionMm, null);
  assert.ok(identity.searchTerms.includes('SPECIALPRODUKT XZ-99 50MM'));
  assert.ok(identity.searchTerms.includes('ART-7788'));
});
