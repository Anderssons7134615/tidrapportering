import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMaterialArticleLookup,
  findMaterialArticleMatch,
  registerMaterialArticle,
  type MaterialArticleIdentity,
} from './materialCatalogMatching.js';

test('keeps different supplier article numbers separate when employee names match', () => {
  const lookup = createMaterialArticleLookup<MaterialArticleIdentity>([]);
  const first = {
    articleNumber: 'AF2015',
    supplier: 'Bevego',
    name: 'AF215',
    unit: 'M',
  };
  const second = {
    articleNumber: 'AF2015E',
    supplier: 'Bevego',
    name: 'AF215',
    unit: 'M',
  };

  registerMaterialArticle(lookup, first);

  assert.equal(findMaterialArticleMatch(lookup, second), undefined);
});

test('matches a numbered supplier row to the same legacy article number', () => {
  const legacy = {
    articleNumber: 'AF2015',
    supplier: null,
    name: 'Old AF name',
    unit: 'M',
  };
  const lookup = createMaterialArticleLookup([legacy]);

  assert.equal(findMaterialArticleMatch(lookup, {
    articleNumber: 'af2015',
    supplier: 'Bevego',
    name: 'AF215',
    unit: 'M',
  }), legacy);
});

test('uses name and unit only when no article number exists', () => {
  const existing = {
    articleNumber: null,
    supplier: null,
    name: 'Custom insulation',
    unit: 'm',
  };
  const lookup = createMaterialArticleLookup([existing]);

  assert.equal(findMaterialArticleMatch(lookup, {
    articleNumber: null,
    supplier: null,
    name: ' custom insulation ',
    unit: 'M',
  }), existing);
});
