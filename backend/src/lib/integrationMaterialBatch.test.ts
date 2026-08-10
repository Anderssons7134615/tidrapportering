import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMaterialBatchPayloadHash,
  materialBatchBodySchema,
  parseIdempotencyKey,
} from './integrationMaterialBatch.js';

const validBody = {
  projectCode: '0083',
  rows: [
    {
      articleId: '22222222-2222-4222-8222-222222222222',
      quantity: 12.5,
      date: '2026-08-10',
      note: ' Plan 2 ',
    },
  ],
};

test('materialbatchen är strikt, datumstyrd och begränsad till 50 rader', () => {
  const parsed = materialBatchBodySchema.parse(validBody);
  assert.equal(parsed.rows[0].note, 'Plan 2');

  assert.throws(() => materialBatchBodySchema.parse({ ...validBody, purchasePrice: 1 }));
  assert.throws(() => materialBatchBodySchema.parse({
    ...validBody,
    rows: Array.from({ length: 51 }, () => validBody.rows[0]),
  }));
  assert.throws(() => materialBatchBodySchema.parse({
    ...validBody,
    rows: [{ ...validBody.rows[0], date: '2026-02-30' }],
  }));
  assert.throws(() => materialBatchBodySchema.parse({
    ...validBody,
    rows: [{ ...validBody.rows[0], unitPrice: 1 }],
  }));
});

test('payloadhashen är stabil för samma normaliserade batch och ändras med innehållet', () => {
  const first = materialBatchBodySchema.parse(validBody);
  const same = materialBatchBodySchema.parse({
    ...validBody,
    rows: [{ ...validBody.rows[0], note: 'Plan 2' }],
  });
  const changed = materialBatchBodySchema.parse({
    ...validBody,
    rows: [{ ...validBody.rows[0], quantity: 13 }],
  });

  assert.equal(createMaterialBatchPayloadHash(first), createMaterialBatchPayloadHash(same));
  assert.notEqual(createMaterialBatchPayloadHash(first), createMaterialBatchPayloadHash(changed));
});

test('idempotensnyckeln är obligatorisk och har ett loggsäkert format', () => {
  assert.equal(parseIdempotencyKey('request_20260810-0083.1'), 'request_20260810-0083.1');
  assert.throws(() => parseIdempotencyKey(undefined));
  assert.throws(() => parseIdempotencyKey('kort'));
  assert.throws(() => parseIdempotencyKey('hemlig nyckel med blanksteg'));
  assert.throws(() => parseIdempotencyKey(['request_20260810-0083.1']));
});
