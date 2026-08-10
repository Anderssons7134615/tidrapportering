import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectCreatePayloadHash, projectCreateBodySchema } from './integrationProjectCreate.js';

const validBody = {
  customerId: '22222222-2222-4222-8222-222222222222',
  name: ' Nytt isoleringsprojekt ',
  site: ' Bygget ',
};

test('projektskrivning är strikt och saknar pris-, kontakt- och statusfält', () => {
  const parsed = projectCreateBodySchema.parse(validBody);
  assert.equal(parsed.name, 'Nytt isoleringsprojekt');
  assert.equal(parsed.site, 'Bygget');
  assert.throws(() => projectCreateBodySchema.parse({ ...validBody, fixedPrice: 1 }));
  assert.throws(() => projectCreateBodySchema.parse({ ...validBody, status: 'ONGOING' }));
  assert.throws(() => projectCreateBodySchema.parse({ ...validBody, email: 'kontakt@example.com' }));
  assert.throws(() => projectCreateBodySchema.parse({ ...validBody, name: 'X' }));
});

test('projektpayloadens hash är stabil efter normalisering och ändras när innehållet ändras', () => {
  const first = projectCreateBodySchema.parse(validBody);
  const same = projectCreateBodySchema.parse({ ...validBody, name: 'Nytt isoleringsprojekt', site: 'Bygget' });
  const changed = projectCreateBodySchema.parse({ ...validBody, site: 'Andra bygget' });
  assert.equal(createProjectCreatePayloadHash(first), createProjectCreatePayloadHash(same));
  assert.notEqual(createProjectCreatePayloadHash(first), createProjectCreatePayloadHash(changed));
});
