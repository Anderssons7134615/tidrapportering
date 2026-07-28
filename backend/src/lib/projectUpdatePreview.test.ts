import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectUpdatePayloadHash,
  isProjectUpdatePreviewToken,
  normalizeProjectCode,
  normalizeProjectUpdateContent,
  type ProjectUpdateDraft,
} from './projectUpdatePreview.js';

const draft: ProjectUpdateDraft = {
  companyId: 'company-1',
  projectId: 'project-1',
  projectCode: '0069',
  projectUpdatedAt: '2026-07-28T10:00:00.000Z',
  userId: 'user-1',
  type: 'STATUS',
  content: 'Pannrummet är färdigt.',
  occurredAt: '2026-07-28T12:00:00.000Z',
  source: 'CHATGPT',
  idempotencyKey: 'request-1',
};

test('project code normalization preserves leading zeroes', () => {
  assert.equal(normalizeProjectCode(' 0069 '), '0069');
  assert.notEqual(normalizeProjectCode('69'), normalizeProjectCode('0069'));
});

test('project update normalization only trims surrounding whitespace', () => {
  assert.equal(
    normalizeProjectUpdateContent('  Rad ett\nRad två  '),
    'Rad ett\nRad två'
  );
});

test('payload hash is stable and changes with the content', () => {
  const first = createProjectUpdatePayloadHash(draft);
  const second = createProjectUpdatePayloadHash({ ...draft });
  const changed = createProjectUpdatePayloadHash({ ...draft, content: 'Annat innehåll' });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test('preview token guard rejects incomplete payloads', () => {
  const token = {
    ...draft,
    scope: 'project-update-preview',
    payloadHash: createProjectUpdatePayloadHash(draft),
  };

  assert.equal(isProjectUpdatePreviewToken(token), true);
  assert.equal(isProjectUpdatePreviewToken({ ...token, projectCode: undefined }), false);
  assert.equal(isProjectUpdatePreviewToken({ ...token, type: 'UNKNOWN' }), false);
});
