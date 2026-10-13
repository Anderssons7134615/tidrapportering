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
after(() => db.$disconnect());
async function setup(t: TestContext) {
  const company = await db.company.create({ data: { name: `TEST CALC ${randomUUID()}` } });
  const user = await db.user.create({ data: { companyId: company.id, name: 'TEST', email: `${randomUUID()}@test.invalid`, password: 'TEST', role: 'ADMIN' } });
  const project = await db.project.create({ data: { companyId: company.id, name: 'TEST', code: 'TEST', fixedPrice: 1234, budgetHours: 7 } });
  const app = Fastify();
  app.decorate('authenticate', async (req: any) => { req.user = user; });
  app.setErrorHandler((e: any, req, reply) => reply.code(e instanceof ZodError ? 400 : e.statusCode || 500).send({ error: e.message }));
  await app.register(createProjectCalculationRoutes(db));
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
