import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProvisionKey, parseProvisionKeyFileArgument, prepareIntegrationProvision } from './integrationProvision.js';

test('förbereder endast hashad integrationsnyckel för exakt ett företag', () => {
  const key = 'a'.repeat(48);

  const result = prepareIntegrationProvision({
    key,
    companyIds: ['company-1'],
  });

  assert.deepEqual(result, {
    companyId: 'company-1',
    name: 'Hermes read-only adapter',
    active: true,
    permission: 'READ_ONLY',
    keyHash: '97daac0ee9998dfcad6c9c0970da5ca411c86233a944c25b47566f6a7bc1ddd5',
  });
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('avvisar kort nyckel och tvetydig företagsscope före skrivning', () => {
  assert.throws(() => prepareIntegrationProvision({ key: 'kort', companyIds: ['company-1'] }));
  assert.throws(() => prepareIntegrationProvision({ key: 'a'.repeat(48), companyIds: [] }));
  assert.throws(() => prepareIntegrationProvision({ key: 'a'.repeat(48), companyIds: ['company-1', 'company-2'] }));
});

test('stdin-provisionering accepterar exakt 64 URL-säkra ASCII-byte utan radslut', () => {
  const key = Buffer.from('a'.repeat(63) + '_', 'ascii');
  assert.equal(parseProvisionKey(key), key.toString('ascii'));

  assert.throws(() => parseProvisionKey(Buffer.from('a'.repeat(63), 'ascii')));
  assert.throws(() => parseProvisionKey(Buffer.from('a'.repeat(64) + '\n', 'ascii')));
  assert.throws(() => parseProvisionKey(Buffer.from('a'.repeat(63) + '+', 'ascii')));
});

test('provisionering accepterar endast en explicit temporär nyckelfil', () => {
  assert.equal(parseProvisionKeyFileArgument([]), null);
  assert.equal(parseProvisionKeyFileArgument(['--key-file', 'C:\\Temp\\key.bin']), 'C:\\Temp\\key.bin');
  assert.throws(() => parseProvisionKeyFileArgument(['--key-file']));
  assert.throws(() => parseProvisionKeyFileArgument(['--other', 'key.bin']));
});
