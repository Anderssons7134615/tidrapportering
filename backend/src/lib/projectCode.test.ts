import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextProjectCodeFromCodes } from './projectCode.js';

test('continues the padded project series instead of an unrelated large number', () => {
  assert.equal(getNextProjectCodeFromCodes(['0066', '0067', '0068', '6756']), '0069');
});

test('keeps a padded prefixed series', () => {
  assert.equal(getNextProjectCodeFromCodes(['JOB-0008', 'JOB-0009']), 'JOB-0010');
});

test('falls back to a simple sequence when no padded series exists', () => {
  assert.equal(getNextProjectCodeFromCodes(['7', '9', 'annat']), '10');
});
