import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareIntegrationProvision } from './integrationProvision.js';

test('förbereder endast hashad integrationsnyckel för exakt ett företag', () => {
  const key = 'a'.repeat(48);

  const result = prepareIntegrationProvision({
    key,
    companyIds: ['company-1'],
    existingKey: false,
  });

  assert.deepEqual(result, {
    companyId: 'company-1',
    name: 'Hermes read-only adapter',
    active: true,
    keyHash: '97daac0ee9998dfcad6c9c0970da5ca411c86233a944c25b47566f6a7bc1ddd5',
  });
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('avvisar kort nyckel, dubblett och tvetydig företagsscope före skrivning', () => {
  assert.throws(() => prepareIntegrationProvision({ key: 'kort', companyIds: ['company-1'], existingKey: false }));
  assert.throws(() => prepareIntegrationProvision({ key: 'a'.repeat(48), companyIds: ['company-1'], existingKey: true }));
  assert.throws(() => prepareIntegrationProvision({ key: 'a'.repeat(48), companyIds: [], existingKey: false }));
  assert.throws(() => prepareIntegrationProvision({ key: 'a'.repeat(48), companyIds: ['company-1', 'company-2'], existingKey: false }));
});
