import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDestructiveSeedAllowed } from './seedSafety.js';

test('destructive seed is blocked in production even with an override', () => {
  assert.throws(() => assertDestructiveSeedAllowed({ NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'true' }), /endast tillåtet/);
  assert.throws(() => assertDestructiveSeedAllowed({ ALLOW_DESTRUCTIVE_SEED: 'true' }), /endast tillåtet/);
});

test('destructive seed requires an explicit local acknowledgement', () => {
  assert.throws(() => assertDestructiveSeedAllowed({ NODE_ENV: 'development' }), /ALLOW_DESTRUCTIVE_SEED/);
  assert.doesNotThrow(() => assertDestructiveSeedAllowed({ NODE_ENV: 'development', ALLOW_DESTRUCTIVE_SEED: 'true' }));
});
