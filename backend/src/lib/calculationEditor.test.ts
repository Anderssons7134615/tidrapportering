import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { calculationFixture } from './projectCalculationFixture.js';
import { editorBodySchema, editorPreview, checkReadyToLock } from './calculationEditor.js';

export function editorFixture() {
  const { id, revision, totals, status, archived, createdAt, updatedAt, ...document } = calculationFixture().document;
  return { expectedRevision: 0, document };
}
test('editor computes totals server-side and preserves master/multi-material input', () => {
  const input = editorFixture(); const id = randomUUID();
  input.document.lines[0].referenceId = 'master-M1';
  const result = editorPreview(id, input);
  assert.equal(result.document.id, `tidapp-${id}`); assert.equal(result.document.revision, 1);
  assert.equal(result.document.status, 'draft'); assert.equal(result.document.lines[0].materials.length, 2);
  assert.equal(result.totals.directCost, 1125.23);
  assert.equal(editorPreview(id, input).fingerprint, result.fingerprint);
  assert.throws(() => editorBodySchema.parse({ ...input, document: { ...input.document, totals: result.totals } }));
  const duplicated = structuredClone(input); duplicated.document.lines.push(duplicated.document.lines[0]);
  assert.throws(() => editorPreview(id, duplicated));
});
test('lock requires described positive quantities but can save an unfinished draft', () => {
  const input = editorFixture(); input.document.lines[0].quantity = 0;
  const value = editorPreview(randomUUID(), input);
  assert.throws(() => checkReadyToLock(value.document), /mängd/);
  input.document.lines[0].quantity = 10; input.document.lines[0].materials[0].unitCost = -1;
  assert.throws(() => editorPreview(randomUUID(), input));
  input.document.lines[0].materials[0].unitCost = NaN;
  assert.throws(() => editorPreview(randomUUID(), input));
});
