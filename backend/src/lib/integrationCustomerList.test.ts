import test from 'node:test';
import assert from 'node:assert/strict';
import { listIntegrationCustomers } from './integrationCustomerList.js';

test('customer integration list uses the key company and excludes financial fields', async () => {
  let options: unknown;
  const db = { customer: { findMany: async (args: unknown) => { options = args; return [{ id: 'one', name: 'Kund', active: false }]; } } };
  const result = await listIntegrationCustomers(db, 'company-from-key');
  assert.deepEqual(result, [{ id: 'one', name: 'Kund', active: false }]);
  assert.deepEqual((options as { where: unknown }).where, { companyId: 'company-from-key' });
  const select = (options as { select: Record<string, boolean> }).select;
  assert.deepEqual(Object.keys(select).sort(), ['active', 'address', 'contactPerson', 'email', 'id', 'name', 'phone']);
  assert.equal(select.defaultRate, undefined);
});
