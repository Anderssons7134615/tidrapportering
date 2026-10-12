import test from 'node:test';
import assert from 'node:assert/strict';
import { movementSchema } from './inventory.js';

const base = { requestKey: '11111111-1111-4111-8111-111111111111', revision: 1, note: '' };
test('inventory accepts thousandths, rejects non-finite, negative and overprecise quantities', () => {
  for (const quantity of [0.001, 1, 1.125]) assert.equal(movementSchema.safeParse({ ...base, kind: 'RECEIPT', quantity }).success, true);
  for (const quantity of [0, -1, NaN, Infinity, 0.0001, 1000001]) assert.equal(movementSchema.safeParse({ ...base, kind: 'RECEIPT', quantity }).success, false);
  assert.equal(movementSchema.safeParse({ ...base, kind: 'COUNT', quantity: 0, note: 'Startinventering' }).success, true);
  assert.equal(movementSchema.safeParse({ ...base, kind: 'COUNT', quantity: 1 }).success, false);
});
test('inventory requires explicit project/source and rejects injected prices and company', () => {
  assert.equal(movementSchema.safeParse({ ...base, kind: 'ISSUE', quantity: 1 }).success, false);
  assert.equal(movementSchema.safeParse({ ...base, kind: 'RETURN', quantity: 1 }).success, false);
  for (const extra of [{ purchasePrice: 1 }, { companyId: 'foreign' }, { createdByUserId: 'someone' }]) {
    assert.equal(movementSchema.safeParse({ ...base, kind: 'RECEIPT', quantity: 1, ...extra }).success, false);
  }
});
