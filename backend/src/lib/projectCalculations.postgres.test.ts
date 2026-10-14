import test, { after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { calculationFixture } from './projectCalculationFixture.js';
import { inspectCalculationV1 } from './projectCalculations.js';

const localUrl = 'postgresql://time_write_test:time_write_test@127.0.0.1:65434/tidapp_time_write_test';
if (process.env.TIME_WRITE_TEST_DATABASE_URL !== localUrl) throw new Error('Only the synthetic local fixture is allowed.');
process.env.DATABASE_URL = localUrl;
const { prisma: db } = await import('./prisma.js');
const { createProjectCalculationRoutes } = await import('../routes/projectCalculations.js');
const { createCalculationEditorRoutes } = await import('../routes/calculationEditor.js');
after(() => db.$disconnect());
async function setup(t: TestContext) {
  const company = await db.company.create({ data: { name: `TEST CALC ${randomUUID()}` } });
  const user = await db.user.create({ data: { companyId: company.id, name: 'TEST', email: `${randomUUID()}@test.invalid`, password: 'TEST', role: 'ADMIN' } });
  const project = await db.project.create({ data: { companyId: company.id, name: 'TEST', code: 'TEST', fixedPrice: 1234, budgetHours: 7 } });
  const app = Fastify();
  app.decorate('authenticate', async (req: any) => { req.user = user; });
  app.setErrorHandler((e: any, req, reply) => reply.code(e instanceof ZodError ? 400 : e.statusCode || 500).send({ error: e.message }));
  await app.register(createProjectCalculationRoutes(db));
  await app.register(createCalculationEditorRoutes(db));
  t.after(() => app.close());
  const input = calculationFixture(); input.document.id = randomUUID();
  const body = (value = input) => ({ calculation: value, expectedFingerprint: inspectCalculationV1(value).fingerprint, reviewed: true });
  const submit = (value = input, target = project.id) => app.inject({ method: 'POST', url: `/${target}/import`, payload: body(value) });
  return { company, user, project, app, input, body, submit };
}

test('real import: concurrent retries create one immutable snapshot and audit without altering project economics', async t => {
  const c = await setup(t);
  const results = await Promise.all([c.submit(), c.submit()]);
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 201]);
  const id = results[0].json().id; assert.equal(id, results[1].json().id);
  assert.equal(await db.projectCalculation.count({ where: { companyId: c.company.id } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityType: 'ProjectCalculation', entityId: id } }), 1);
  const detail = await c.app.inject({ url: `/${c.project.id}/${id}` });
  assert.equal(detail.statusCode, 200); assert.equal(detail.json().document.manualBid, 90000);
  assert.equal(detail.json().totals.calculatedPrice, 1554.67);
  const project = await db.project.findUniqueOrThrow({ where: { id: c.project.id } });
  assert.equal(project.fixedPrice, 1234); assert.equal(project.budgetHours, 7);
  assert.equal(await db.projectMaterial.count({ where: { projectId: project.id } }), 0);
  assert.equal(await db.supplierInvoiceAllocation.count({ where: { projectId: project.id } }), 0);
  await assert.rejects(db.projectCalculation.update({ where: { id }, data: { name: 'tampered' } }), /immutable/);
  await assert.rejects(db.projectCalculation.delete({ where: { id } }), /immutable/);
});

function editable(input: ReturnType<typeof calculationFixture>) {
  const { id, revision, totals, status, archived, createdAt, updatedAt, ...document } = input.document;
  return document;
}
test('editor: concurrent create/update retries, stale writes, lock retries and immutable result', async t => {
  const c = await setup(t), draftId = randomUUID(); const document = editable(c.input);
  const url = `/${c.project.id}/editor/${draftId}`;
  const save = (expectedRevision: number, value = document) => c.app.inject({ method: 'PUT', url, payload: { expectedRevision, document: value } });
  const first = await Promise.all([save(0), save(0)]);
  assert.deepEqual(first.map(r => r.statusCode), [200, 200]);
  assert.equal(first[0].json().revision, 1); assert.equal(first[0].json().id, draftId);
  assert.equal(await db.auditLog.count({ where: { entityType: 'ProjectCalculationDraft', entityId: draftId } }), 1);
  document.lines[0].materials[0].unitCost = 123.45;
  const updated = await Promise.all([save(1), save(1)]); assert.deepEqual(updated.map(r => r.statusCode), [200, 200]);
  assert.equal(updated[0].json().revision, 2);
  assert.equal((await save(0)).statusCode, 409);
  const value = updated[0].json();
  const lock = () => c.app.inject({ method: 'POST', url: `${url}/lock`, payload: { expectedRevision: 2, expectedFingerprint: value.fingerprint, reviewed: true } });
  const locked = await Promise.all([lock(), lock()]); assert.deepEqual(locked.map(r => r.statusCode), [200, 200]);
  assert.equal(locked[0].json().id, locked[1].json().id);
  assert.equal(await db.projectCalculation.count({ where: { projectId: c.project.id } }), 1);
  assert.equal((await save(2)).statusCode, 409);
  await assert.rejects(db.projectCalculationDraft.update({ where: { id: draftId }, data: { lockedCalculationId: null } }), /immutable/);
  const final = (await c.app.inject({ url: `/${c.project.id}/${locked[0].json().id}` })).json();
  assert.equal(final.document.lines[0].materials[0].unitCost, 123.45);
  assert.equal(final.document.status, 'draft'); // Technical lock must not claim an offer was sent.
  await db.project.update({ where: { id: c.project.id }, data: { active: false } });
  assert.equal((await lock()).statusCode, 200);
  assert.equal((await save(1)).statusCode, 200); // Lost successful save remains acknowledgeable.
  assert.equal((await c.app.inject({ url })).json().lockedCalculationId, final.id);
  assert.equal((await c.app.inject({ url: `/${c.project.id}/editor` })).json().length, 0);
  const project = await db.project.findUniqueOrThrow({ where: { id: c.project.id } });
  assert.equal(project.fixedPrice, 1234); assert.equal(project.budgetHours, 7);
});

test('editor: project/company isolation, inactive replay, reserved import identity and changed preview', async t => {
  const c = await setup(t), foreign = await setup(t), id = randomUUID();
  const document = editable(c.input); const payload = { expectedRevision: 0, document };
  const url = `/${c.project.id}/editor/${id}`;
  assert.equal((await foreign.app.inject({ method: 'PUT', url, payload })).statusCode, 404);
  const value = (await c.app.inject({ method: 'PUT', url, payload })).json();
  assert.equal((await foreign.app.inject({ url })).statusCode, 404);
  const other = await db.project.create({ data: { companyId: c.company.id, code: randomUUID(), name: 'TEST Other' } });
  assert.equal((await c.app.inject({ method: 'PUT', url: `/${other.id}/editor/${id}`, payload })).statusCode, 409);
  assert.equal((await c.app.inject({ url: `/${other.id}/editor/${id}` })).json(), null);
  const lock = { expectedRevision: 1, expectedFingerprint: 'b'.repeat(64), reviewed: true };
  assert.equal((await c.app.inject({ method: 'POST', url: `${url}/lock`, payload: lock })).statusCode, 409);
  assert.equal((await c.app.inject({ method: 'POST', url: `${url}/lock`, payload: { ...lock, reviewed: false } })).statusCode, 400);
  const imported = { format: 'andersson-kalkyl-v1' as const, document: value.document };
  assert.equal((await c.submit(imported)).statusCode, 400);
  await db.project.update({ where: { id: c.project.id }, data: { active: false } });
  assert.equal((await c.app.inject({ method: 'PUT', url, payload })).statusCode, 200);
  assert.equal((await c.app.inject({ method: 'PUT', url, payload: { ...payload, expectedRevision: 1 } })).statusCode, 409);
});

test('editor: racing save against lock never locks a different revision', async t => {
  const c = await setup(t), id = randomUUID(), document = editable(c.input), url = `/${c.project.id}/editor/${id}`;
  const row = (await c.app.inject({ method: 'PUT', url, payload: { expectedRevision: 0, document } })).json();
  const changed = structuredClone(document); changed.name = 'Newer';
  const result = await Promise.all([
    c.app.inject({ method: 'PUT', url, payload: { expectedRevision: 1, document: changed } }),
    c.app.inject({ method: 'POST', url: `${url}/lock`, payload: { expectedRevision: 1, expectedFingerprint: row.fingerprint, reviewed: true } }),
  ]);
  assert.deepEqual(result.map(r => r.statusCode).sort(), [200, 409]);
  const current = await db.projectCalculationDraft.findUniqueOrThrow({ where: { id } });
  if (current.lockedCalculationId) {
    const locked = await db.projectCalculation.findUniqueOrThrow({ where: { id: current.lockedCalculationId } });
    assert.equal(locked.fingerprint, row.fingerprint); assert.equal(current.revision, 1);
  } else { assert.equal(current.revision, 2); assert.equal(current.name, 'Newer'); }
});

test('editor: audit failure rolls back draft saving and final locking', async t => {
  const c = await setup(t), id = randomUUID(), document = editable(c.input), url = `/${c.project.id}/editor/${id}`;
  const name = `editor_audit_${randomUUID().replaceAll('-', '')}`;
  await db.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${c.user.id}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
  try {
    assert.equal((await c.app.inject({ method: 'PUT', url, payload: { expectedRevision: 0, document } })).statusCode, 500);
    assert.equal(await db.projectCalculationDraft.count({ where: { id } }), 0);
  } finally { await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "AuditLog"`); }
  const row = (await c.app.inject({ method: 'PUT', url, payload: { expectedRevision: 0, document } })).json();
  await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
  try {
    assert.equal((await c.app.inject({ method: 'POST', url: `${url}/lock`, payload: { expectedRevision: 1, expectedFingerprint: row.fingerprint, reviewed: true } })).statusCode, 500);
    assert.equal((await db.projectCalculationDraft.findUniqueOrThrow({ where: { id } })).lockedCalculationId, null);
    assert.equal(await db.projectCalculation.count({ where: { projectId: c.project.id } }), 0);
  } finally { await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "AuditLog"`); await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`); }
});

test('real import: changed identity payload, foreign projects, inactive project and stale preview are rejected; new revision is preserved separately', async t => {
  const c = await setup(t), foreign = await setup(t);
  const original = (await c.submit()).json();
  const changed = structuredClone(c.input); changed.document.terms = 'changed';
  assert.equal((await c.submit(changed)).statusCode, 409);
  assert.equal((await c.submit(c.input, foreign.project.id)).statusCode, 404);
  assert.equal((await foreign.app.inject({ url: `/${c.project.id}/${original.id}` })).statusCode, 404);
  assert.equal((await foreign.app.inject({ url: `/${c.project.id}` })).statusCode, 404);
  const stale = c.body(changed); stale.expectedFingerprint = c.body().expectedFingerprint;
  assert.equal((await c.app.inject({ method: 'POST', url: `/${c.project.id}/import`, payload: stale })).statusCode, 409);
  assert.equal((await c.app.inject({ method: 'POST', url: `/${c.project.id}/import`, payload: { ...c.body(), reviewed: false } })).statusCode, 400);
  const secondProject = await db.project.create({ data: { companyId: c.company.id, name: 'TEST2', code: 'TEST2' } });
  assert.equal((await c.submit(c.input, secondProject.id)).statusCode, 409);
  changed.document.revision = 2;
  assert.equal((await c.submit(changed)).statusCode, 201);
  assert.equal((await c.app.inject({ url: `/${c.project.id}` })).json().length, 2);
  assert.equal((await c.app.inject({ url: `/${c.project.id}/${original.id}` })).json().document.terms, '');
  await db.project.update({ where: { id: c.project.id }, data: { active: false } });
  changed.document.revision = 3;
  assert.equal((await c.submit(changed)).statusCode, 409);
  assert.equal((await c.app.inject({ url: `/${c.project.id}/${original.id}` })).statusCode, 200);
  await assert.rejects(db.projectCalculation.create({ data: { companyId: c.company.id, projectId: foreign.project.id, createdByUserId: c.user.id, sourceId: randomUUID(), sourceRevision: 1, fingerprint: 'test', name: 'test', snapshot: {} } }), /Foreign key constraint/);
  await assert.rejects(db.projectCalculation.create({ data: { companyId: c.company.id, projectId: c.project.id, createdByUserId: foreign.user.id, sourceId: randomUUID(), sourceRevision: 1, fingerprint: 'test', name: 'test', snapshot: {} } }), /Foreign key constraint/);
});

test('real import rolls back the snapshot if audit fails', async t => {
  const c = await setup(t);
  const name = `calc_audit_${randomUUID().replaceAll('-', '')}`;
  await db.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${c.user.id}' AND NEW."entityType" = 'ProjectCalculation' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
  try {
    assert.equal((await c.submit()).statusCode, 500);
    assert.equal(await db.projectCalculation.count({ where: { companyId: c.company.id } }), 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
  }
});
