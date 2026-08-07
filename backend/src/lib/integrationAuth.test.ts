import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateIntegrationKey,
  extractIntegrationKey,
  hashIntegrationKey,
} from './integrationAuth.js';

test('hashar integrationsnyckeln deterministiskt utan att returnera klartext', () => {
  const key = 'tidapp_read_test_key_123';
  const hash = hashIntegrationKey(key);

  assert.equal(hash, hashIntegrationKey(key));
  assert.notEqual(hash, key);
  assert.match(hash, /^[a-f0-9]{64}$/);
});

test('accepterar endast en enkel X-TidApp-Integration-Key-header', () => {
  assert.equal(extractIntegrationKey({ 'x-tidapp-integration-key': 'abc' }), 'abc');
  assert.equal(extractIntegrationKey({ 'x-tidapp-integration-key': ['abc'] }), null);
  assert.equal(extractIntegrationKey({}), null);
  assert.equal(extractIntegrationKey({ 'x-tidapp-integration-key': '   ' }), null);
});

test('godkänner en aktiv integrationsnyckel och returnerar endast dess företagsscope', async () => {
  const key = 'tidapp_read_test_key_123';
  const scope = await authenticateIntegrationKey(
    {
      findByHash: async (keyHash) => keyHash === hashIntegrationKey(key)
        ? { id: 'key-1', companyId: 'company-1', active: true }
        : null,
    },
    key,
  );

  assert.deepEqual(scope, { id: 'key-1', companyId: 'company-1' });
});

test('avvisar saknad, okänd och inaktiv integrationsnyckel', async () => {
  const repository = {
    findByHash: async () => ({ id: 'key-1', companyId: 'company-1', active: false }),
  };

  assert.equal(await authenticateIntegrationKey(repository, null), null);
  assert.equal(await authenticateIntegrationKey(repository, 'okänd'), null);
});
