import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProjectIntegrationProvision } from './integrationProjectProvision.js';

test('projektintegrationen får endast en hashad PROJECT_CREATE-nyckel för ett företag', () => {
  const key = 'p'.repeat(63) + '_';
  const result = prepareProjectIntegrationProvision({ key, companyIds: ['company-1'] });
  assert.equal(result.permission, 'PROJECT_CREATE');
  assert.equal(result.name, 'Hermes project-create adapter');
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.throws(() => prepareProjectIntegrationProvision({ key: 'kort', companyIds: ['company-1'] }));
  assert.throws(() => prepareProjectIntegrationProvision({ key, companyIds: [] }));
});
