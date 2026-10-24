import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { createPlanningRoutes } from './planning.js';
import { planningDocumentSchema } from '../lib/planning.js';

const document = { weeks: [{ startDate: '2026-10-19', note: '', people: [{ name: 'Testperson', days: ['Jobb', '', '', '', ''] }] }], jobs: [], issues: '' };
const requestKey = '00000000-0000-4000-8000-000000000001';
async function setup() {
  const boards: any[] = [], comments: any[] = [];
  const db: any = {
    planningBoard: {
      findUnique: async ({ where }: any) => boards.find(b => b.companyId === where.companyId) ?? null,
      create: async ({ data }: any) => { if (boards.some(b => b.companyId === data.companyId)) throw { code: 'P2002' }; const b = { ...data, id: `b${boards.length}`, revision: 1 }; boards.push(b); return b; },
      updateMany: async ({ where, data }: any) => { const b = boards.find(b => b.companyId === where.companyId && b.revision === where.revision); if (!b) return { count: 0 }; b.document = data.document; b.revision++; return { count: 1 }; },
    },
    planningComment: {
      findMany: async ({ where, take, skip }: any) => comments.filter(c => c.companyId === where.companyId).slice(skip, skip + take),
      findUnique: async ({ where }: any) => comments.find(c => Object.entries(where.companyId_authorId_requestKey).every(([k,v]) => c[k] === v)) ?? null,
      create: async ({ data }: any) => { if (comments.some(c => c.companyId === data.companyId && c.authorId === data.authorId && c.requestKey === data.requestKey)) throw { code: 'P2002' }; const c = { ...data, id: `c${comments.length}`, author: { id: data.authorId, name: 'Test' } }; comments.push(c); return c; },
    },
  };
  db.$transaction = (fn: any) => fn(db);
  const app = Fastify();
  app.decorate('authenticate', async (request: any, reply: any) => {
    if (!request.headers['x-role']) return reply.status(401).send();
    request.user = { id: `u-${request.headers['x-company'] || 'a'}`, companyId: request.headers['x-company'] || 'a', role: request.headers['x-role'] };
  });
  app.setErrorHandler((err, _req, reply) => reply.status(err instanceof ZodError ? 400 : 500).send());
  await app.register(createPlanningRoutes(db), { prefix: '/api/planning' });
  const call = (method: any, url = '', role = 'ADMIN', payload?: any, company = 'a') => app.inject({ method, url: `/api/planning${url}`, headers: { 'x-role': role, 'x-company': company }, ...(payload !== undefined ? { payload } : {}) });
  return { app, call, boards, comments };
}

test('planning authenticates and enforces admin edits, employee advice and company isolation', async () => {
  const { app, call, boards } = await setup();
  try {
    assert.equal((await app.inject('/api/planning')).statusCode, 401);
    for (const role of ['ACCOUNTANT', 'UNKNOWN']) {
      assert.equal((await call('GET', '', role)).statusCode, 403);
      assert.equal((await call('GET', '/comments', role)).statusCode, 403);
      assert.equal((await call('POST', '/comments', role, { content: 'Tips', requestKey })).statusCode, 403);
    }
    for (const role of ['EMPLOYEE', 'SUPERVISOR', 'ACCOUNTANT']) assert.equal((await call('PUT', '', role, { expectedRevision: 0, document })).statusCode, 403);
    assert.equal(boards.length, 0);
    assert.equal((await call('PUT', '', 'ADMIN', { expectedRevision: 0, document })).statusCode, 200);
    assert.deepEqual((await call('GET', '', 'EMPLOYEE')).json().document, document);
    assert.equal((await call('GET', '', 'EMPLOYEE', undefined, 'b')).body, 'null');
    assert.equal((await call('POST', '/comments', 'EMPLOYEE', { content: 'Tips', requestKey }, 'b')).statusCode, 404);
    assert.equal((await call('POST', '/comments', 'EMPLOYEE', { content: 'Tips', requestKey })).statusCode, 200);
    assert.equal((await call('GET', '/comments', 'SUPERVISOR')).json().items.length, 1);
    assert.deepEqual((await call('GET', '/comments', 'EMPLOYEE', undefined, 'b')).json().items, []);
    assert.equal((await call('PUT', '', 'ADMIN', { expectedRevision: 1, document }, 'b')).statusCode, 409);
    assert.equal(boards[0].revision, 1);
  } finally { await app.close(); }
});

test('stale saves cannot overwrite a newer plan; duplicate creation conflicts', async () => {
  const { app, call, boards } = await setup();
  try {
    await call('PUT', '', 'ADMIN', { expectedRevision: 0, document });
    assert.equal((await call('PUT', '', 'ADMIN', { expectedRevision: 0, document })).statusCode, 409);
    const changed = { ...document, issues: 'Ny plan' };
    const responses = await Promise.all([call('PUT', '', 'ADMIN', { expectedRevision: 1, document: changed }), call('PUT', '', 'ADMIN', { expectedRevision: 1, document })]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
    assert.equal(boards[0].document.issues, 'Ny plan'); assert.equal(boards[0].revision, 2);
  } finally { await app.close(); }
});

test('comment retry is idempotent, bound to author, and validates content', async () => {
  const { app, call, comments } = await setup();
  try {
    await call('PUT', '', 'ADMIN', { expectedRevision: 0, document });
    for (const content of ['', '  ', 'x'.repeat(5001)]) assert.equal((await call('POST', '/comments', 'EMPLOYEE', { content, requestKey })).statusCode, 400);
    assert.equal((await call('POST', '/comments', 'EMPLOYEE', { content: 'Tips', requestKey, authorId: 'someone-else' })).statusCode, 400);
    const responses = await Promise.all([call('POST', '/comments', 'EMPLOYEE', { content: 'Tips', requestKey }), call('POST', '/comments', 'EMPLOYEE', { content: 'Tips', requestKey })]);
    assert.deepEqual(responses.map(r => r.statusCode), [200,200]); assert.equal(comments.length, 1); assert.equal(comments[0].authorId, 'u-a');
    assert.equal((await call('POST', '/comments', 'EMPLOYEE', { content: 'Ändrat', requestKey })).statusCode, 409);
    assert.equal((await call('GET', '/comments?page=0', 'EMPLOYEE')).statusCode, 400);
  } finally { await app.close(); }
});

test('multiple daily assignments round-trip without changing legacy day text', async () => {
  const { app, call } = await setup();
  const multiple = {
    ...document,
    weeks: document.weeks.map(week => ({ ...week, people: week.people.map(person => ({ ...person,
      days: [...person.days], assignments: [['Jobb A', 'Jobb B', 'Ett jobb\nmed radbrytning'], [], [], [], []],
    })) })),
  };
  multiple.weeks[0].people[0].days[0] = '  Importerad text\nmed anteckning  ';
  try {
    const saved = await call('PUT', '', 'ADMIN', { expectedRevision: 0, document: multiple });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual((await call('GET', '', 'EMPLOYEE')).json().document, multiple);
    assert.equal(saved.json().revision, 1);
    assert.equal((await call('PUT', '', 'ADMIN', { expectedRevision: 0, document: multiple })).statusCode, 409);
    assert.equal((await call('GET', '', 'EMPLOYEE', undefined, 'b')).body, 'null');
    assert.equal((await call('PUT', '', 'EMPLOYEE', { expectedRevision: 1, document: multiple })).statusCode, 403);
  } finally { await app.close(); }
});

test('assignment fields enforce their own bounds without interpreting multiline names or day text', () => {
  const withAssignments = (assignments: unknown) => ({ ...document, weeks: [{ ...document.weeks[0], people: [{ ...document.weeks[0].people[0], assignments }] }] });
  for (const assignments of [null, [], [[], [], [], []], [[], [], [], [], [], []], ['A', [], [], [], []], [[null], [], [], [], []], [[' '], [], [], [], []], [['A', 'A'], [], [], [], []], [['x'.repeat(201)], [], [], [], []], [Array.from({ length: 201 }, (_, index) => String(index)), [], [], [], []]]) {
    assert.equal(planningDocumentSchema.safeParse(withAssignments(assignments)).success, false);
  }
  const maximum = [Array.from({ length: 200 }, (_, index) => `${index} ${'x'.repeat(190)}`), [], [], [], []];
  assert.equal(planningDocumentSchema.safeParse(withAssignments(maximum)).success, true);
  const names = [['A', 'B', 'A\nB', ' Naam '], [], [], [], []];
  assert.deepEqual(planningDocumentSchema.parse(withAssignments(names)).weeks[0].people[0].assignments, names);
  assert.equal(planningDocumentSchema.safeParse(document).success, true);
});

test('plan validates real Mondays, duplicate weeks, five weekdays and bounded fields', () => {
  assert.equal(planningDocumentSchema.safeParse(document).success, true);
  for (const startDate of ['2026-02-30', '2026-10-20', 'invalid']) assert.equal(planningDocumentSchema.safeParse({ ...document, weeks: [{ ...document.weeks[0], startDate }] }).success, false);
  assert.equal(planningDocumentSchema.safeParse({ ...document, weeks: [document.weeks[0], document.weeks[0]] }).success, false);
  assert.equal(planningDocumentSchema.safeParse({ ...document, weeks: [{ ...document.weeks[0], people: [{ name: '', days: [] }] }] }).success, false);
  assert.equal(planningDocumentSchema.safeParse({ ...document, issues: 'x'.repeat(20001) }).success, false);
});
