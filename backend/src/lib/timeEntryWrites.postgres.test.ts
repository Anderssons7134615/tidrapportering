import test, { after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';

const localUrl = 'postgresql://time_write_test:time_write_test@127.0.0.1:65434/tidapp_time_write_test';
if (process.env.TIME_WRITE_TEST_DATABASE_URL !== localUrl) throw new Error('Only the disposable time-write fixture on 127.0.0.1:65434 is allowed.');
process.env.DATABASE_URL = localUrl;
const { prisma: db } = await import('./prisma.js');
const { createTimeEntryWriteService } = await import('./timeEntryWrites.js');
const { default: timeRoutes } = await import('../routes/timeEntries.js');
const { default: weekRoutes } = await import('../routes/weekLocks.js');
after(() => db.$disconnect());

async function setup(t: TestContext) {
  const identity = await db.$queryRaw<any[]>`SELECT current_database() AS db, current_user AS usr, host(inet_server_addr()) AS host, inet_server_port() AS port`;
  assert.deepEqual(identity, [{ db: 'tidapp_time_write_test', usr: 'time_write_test', host: '127.0.0.1', port: 65434 }]);
  const company = await db.company.create({ data: { name: 'SYNTHETIC TIME TEST' } });
  const user = await db.user.create({ data: { name: 'TEST', email: `${randomUUID()}@test.invalid`, password: 'TEST', role: 'ADMIN', companyId: company.id } });
  const actor = { id: user.id, companyId: company.id, role: user.role };
  const project = await db.project.create({ data: { companyId: company.id, code: 'TEST', name: 'TEST' } });
  const activity = await db.activity.create({ data: { companyId: company.id, code: 'WORK', name: 'TEST', category: 'WORK' } });
  await db.activity.create({ data: { companyId: company.id, code: 'SEM', name: 'Semester', category: 'ABSENCE' } });
  const input = { userId: user.id, projectId: project.id, activityId: activity.id, date: new Date('2026-10-05'), hours: 8, billable: true };
  const service = createTimeEntryWriteService(db);
  const app = Fastify();
  app.decorate('authenticate', async (req: any) => { req.user = { ...actor, role: req.headers['x-role'] || actor.role }; });
  await app.register(timeRoutes, { prefix: '/time' });
  await app.register(weekRoutes, { prefix: '/weeks' });
  t.after(() => app.close());
  const receipts = () => db.timeEntryWriteRequest.count({ where: { companyId: company.id } });
  const rows = () => db.timeEntry.count({ where: { userId: user.id } });
  const lock = () => db.weekLock.findFirstOrThrow({ where: { userId: user.id } });
  return { actor, user, company, project, activity, input, service, app, receipts, rows, lock };
}

test('time writes: concurrent duplicate create, mismatched intent, and deletion tombstone', async t => {
  const c = await setup(t); const key = randomUUID();
  const results = await Promise.all([c.service.create(c.actor, c.input, key), c.service.create(c.actor, c.input, key)]);
  assert.equal(results[0].id, results[1].id); assert.equal(await c.rows(), 1); assert.equal(await c.receipts(), 1);
  assert.equal(await db.auditLog.count({ where: { userId: c.user.id, action: 'CREATE' } }), 1);
  assert.equal(await db.obsidianSyncEvent.count({ where: { companyId: c.company.id } }), 1);
  await assert.rejects(c.service.create(c.actor, { ...c.input, hours: 7 }, key), { code: 'WRITE_KEY_CONFLICT' });
  const deleteKey = randomUUID();
  await c.service.remove(c.actor, results[0].id, 1, deleteKey);
  assert.equal((await c.service.remove(c.actor, results[0].id, 1, deleteKey)).outcome, 'REPLAYED');
  const replay = await c.service.create(c.actor, c.input, key);
  assert.equal(replay.outcome, 'REPLAYED'); assert.equal(replay.resourceExists, false); assert.equal(await c.rows(), 0);
});

test('time writes: stale edit and simultaneous edits never overwrite a winning revision', async t => {
  const c = await setup(t); const row = await c.service.create(c.actor, c.input, randomUUID());
  const changes = await Promise.allSettled([c.service.update(c.actor, row.id, { hours: 3 }, 1, randomUUID()), c.service.update(c.actor, row.id, { hours: 4 }, 1, randomUUID())]);
  assert.equal(changes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((changes.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code, 'REVISION_CONFLICT');
  assert.equal((await db.timeEntry.findUniqueOrThrow({ where: { id: row.id } })).revision, 2);
  await assert.rejects(c.service.remove(c.actor, row.id, 1, randomUUID()), { code: 'REVISION_CONFLICT' });
  const key = randomUUID();
  await c.service.update(c.actor, row.id, { note: 'unchanged intent' }, 2, key);
  await c.service.update(c.actor, row.id, { hours: 5 }, 3, randomUUID());
  assert.equal((await c.service.update(c.actor, row.id, { note: 'unchanged intent' }, 2, key)).outcome, 'REPLAYED');
});

test('time writes: audit and outbox failure roll back row, week lock and receipt', async t => {
  const c = await setup(t);
  // A test-only Prisma middleware failure occurs after the row has been written.
  let failure: string | null = 'AuditLog';
  db.$use(async (params, next) => {
    if (failure === params.model && params.action === 'create' && (params.args.data.userId === c.user.id || params.args.data.companyId === c.company.id)) throw new Error('SYNTHETIC_ROLLBACK');
    return next(params);
  });
  for (const model of ['AuditLog', 'ObsidianSyncEvent']) {
    failure = model;
    await assert.rejects(c.service.create(c.actor, c.input, randomUUID()), /SYNTHETIC_ROLLBACK/);
    assert.equal(await c.rows(), 0); assert.equal(await c.receipts(), 0);
    assert.equal(await db.weekLock.count({ where: { userId: c.user.id } }), 0);
  }
  failure = null;
});

test('time writes: vacation is atomic and replays five rows with one receipt', async t => {
  const c = await setup(t); const input = { weekStart: c.input.date, userId: c.user.id, hoursPerDay: 8, requestKey: randomUUID() };
  const first = await c.service.vacation(c.actor, input);
  const second = await c.service.vacation(c.actor, input);
  assert.deepEqual(second.resultIds, first.resultIds); assert.equal(await c.rows(), 5); assert.equal(await c.receipts(), 1);
  await assert.rejects(c.service.vacation(c.actor, { ...input, requestKey: randomUUID() }), { code: 'WEEK_NOT_EMPTY' });
  assert.equal(await c.receipts(), 1);
});

test('time writes: approved, unlocked, edited week can be approved again; revision follows every transition', async t => {
  const c = await setup(t);
  await c.service.vacation(c.actor, { weekStart: c.input.date, userId: c.user.id, hoursPerDay: 8, requestKey: randomUUID() });
  const lock = await c.lock(); const row = await db.timeEntry.findFirstOrThrow({ where: { userId: c.user.id } });
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/approve` })).statusCode, 200);
  await assert.rejects(c.service.update(c.actor, row.id, { hours: 7 }, 1, randomUUID()), { code: 'REVISION_CONFLICT' });
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/unlock` })).statusCode, 200);
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/unlock` })).statusCode, 409);
  await c.service.update(c.actor, row.id, { hours: 7 }, 3, randomUUID());
  const entries = await db.timeEntry.findMany({ where: { userId: c.user.id } });
  assert.ok(entries.every(entry => entry.status === 'SUBMITTED' && entry.revision === 4));
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/approve` })).statusCode, 200);
});

test('time writes: approve racing update preserves approved snapshots or returns conflict', async t => {
  const c = await setup(t);
  await c.service.vacation(c.actor, { weekStart: c.input.date, userId: c.user.id, hoursPerDay: 8, requestKey: randomUUID() });
  const lock = await c.lock(); const row = await db.timeEntry.findFirstOrThrow({ where: { userId: c.user.id } });
  const [approval, edit] = await Promise.allSettled([
    c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/approve` }),
    c.service.update(c.actor, row.id, { hours: 7 }, 1, randomUUID()),
  ]);
  assert.equal(approval.status, 'fulfilled');
  const response = (approval as PromiseFulfilledResult<any>).value;
  assert.ok([200, 409].includes(response.statusCode), response.body);
  const current = await db.timeEntry.findUniqueOrThrow({ where: { id: row.id } });
  if (response.statusCode === 200) {
    assert.equal(current.status, 'APPROVED'); assert.ok(current.financialSnapshotCapturedAt);
    // If the update completed first, approval must capture its new revision.
    assert.equal(current.revision, edit.status === 'fulfilled' ? 3 : 2);
  } else assert.equal(edit.status, 'fulfilled');
});

test('time writes: same key is isolated by actor/company and foreign references are rejected', async t => {
  const c = await setup(t); const other = await setup(t); const key = randomUUID();
  const a = await c.service.create(c.actor, c.input, key);
  const b = await other.service.create(other.actor, other.input, key);
  assert.notEqual(a.id, b.id);
  await assert.rejects(c.service.create(c.actor, { ...c.input, projectId: other.project.id }, randomUUID()), { code: 'INVALID_REFERENCE' });
  await assert.rejects(c.service.update(other.actor, a.id, { hours: 1 }, 1, randomUUID()), { code: 'NOT_FOUND' });
  await assert.rejects(c.service.create({ ...c.actor, role: 'ACCOUNTANT' }, c.input, randomUUID()), { code: 'FORBIDDEN' });
});

test('time write HTTP contract: revision required, stable acknowledgment and supervisor-safe response', async t => {
  const c = await setup(t);
  const operation = { operation: 'CREATE', requestKey: randomUUID(), payload: { ...c.input, date: '2026-10-05' } };
  const first = await c.app.inject({ method: 'POST', url: '/time/operations', payload: operation, headers: { 'x-role': 'SUPERVISOR' } });
  assert.equal(first.statusCode, 200, first.body);
  const row = first.json(); assert.equal(row.revision, 1); assert.equal(row.requestKey, operation.requestKey);
  assert.equal('approvedHourlyCostSnapshot' in row, false);
  assert.equal((await c.app.inject({ method: 'DELETE', url: `/time/${row.id}` })).statusCode, 428);
  const replay = await c.app.inject({ method: 'POST', url: '/time/operations', payload: operation, headers: { 'x-role': 'SUPERVISOR' } });
  assert.equal(replay.json().outcome, 'REPLAYED');
});

test('time writes: an unlocked week can be resubmitted and approved without editing time', async t => {
  const c = await setup(t);
  await c.service.vacation(c.actor, { weekStart: c.input.date, userId: c.user.id, hoursPerDay: 8, requestKey: randomUUID() });
  const lock = await c.lock();
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/approve` })).statusCode, 200);
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/unlock` })).statusCode, 200);
  const response = await c.app.inject({ method: 'POST', url: '/weeks/submit', payload: { weekStartDate: '2026-10-05' } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, 'SUBMITTED');
  const entries = await db.timeEntry.findMany({ where: { userId: c.user.id } });
  assert.ok(entries.every(row => row.hours === 8 && row.revision === 4 && row.status === 'SUBMITTED'));
  assert.equal((await c.app.inject({ method: 'POST', url: `/weeks/${lock.id}/approve` })).statusCode, 200);
});
