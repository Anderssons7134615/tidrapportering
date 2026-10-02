import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { createProjectTaskRoutes } from './projectTasks.js';

const actor = {
  ADMIN: { id: 'admin-1', email: 'admin@test', role: 'ADMIN', companyId: 'company-a', sessionVersion: 0 },
  SUPERVISOR: { id: 'supervisor-1', email: 'supervisor@test', role: 'SUPERVISOR', companyId: 'company-a', sessionVersion: 0 },
  EMPLOYEE: { id: 'employee-1', email: 'employee@test', role: 'EMPLOYEE', companyId: 'company-a', sessionVersion: 0 },
  ACCOUNTANT: { id: 'accountant-1', email: 'accountant@test', role: 'ACCOUNTANT', companyId: 'company-a', sessionVersion: 0 },
} as const;

test('archive list is company scoped and restricted to managers', async () => {
  let where: any;
  const app = await appWith({ project: { findMany: async (args: any) => { where = args.where; return []; } } });
  try {
    const employee = await app.inject({ method: 'GET', url: '/api/project-control/projects?active=false', headers: { 'x-test-role': 'EMPLOYEE' } });
    assert.equal(employee.statusCode, 403);
    assert.equal(where, undefined);
    const admin = await app.inject({ method: 'GET', url: '/api/project-control/projects?active=false', headers: { 'x-test-role': 'ADMIN' } });
    assert.equal(admin.statusCode, 200);
    assert.deepEqual(where, { companyId: 'company-a', active: false });
    const invalid = await app.inject({ method: 'GET', url: '/api/project-control/projects?active=maybe', headers: { 'x-test-role': 'ADMIN' } });
    assert.equal(invalid.statusCode, 400);
  } finally { await app.close(); }
});

async function appWith(db: any) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    const role = String(request.headers['x-test-role'] || 'EMPLOYEE') as keyof typeof actor;
    request.user = actor[role];
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ error: error.issues[0]?.message });
    return reply.status(500).send({ error: error instanceof Error ? error.message : 'Okänt testfel' });
  });
  await app.register(createProjectTaskRoutes({ supplierInvoice: { count: async () => 0 }, ...db }), { prefix: '/api' });
  return app;
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1', companyId: 'company-a', projectId: 'project-1', title: 'Följ upp leverans', note: null,
    assigneeId: 'employee-1', assignee: { id: 'employee-1', name: 'Medarbetare' }, priority: 'NORMAL', status: 'TODO',
    dueDate: new Date('2026-08-13T00:00:00.000Z'), createdByUserId: 'admin-1', createdByUser: { id: 'admin-1', name: 'Admin' },
    completedAt: null, archivedAt: null, createdAt: new Date('2026-08-01T08:00:00.000Z'), updatedAt: new Date('2026-08-01T08:00:00.000Z'),
    ...overrides,
  };
}

test('accountant is blocked from the work queue but can read the company portfolio', async () => {
  let portfolioWhere: unknown;
  const db = {
    project: { findMany: async (args: any) => { portfolioWhere = args.where; return []; } },
    timeEntry: { findMany: async () => [] }, projectMaterial: { findMany: async () => [] },
  };
  const app = await appWith(db);
  const queue = await app.inject({ method: 'GET', url: '/api/project-control/projects', headers: { 'x-test-role': 'ACCOUNTANT' } });
  assert.equal(queue.statusCode, 403);
  const portfolio = await app.inject({ method: 'GET', url: '/api/project-portfolio', headers: { 'x-test-role': 'ACCOUNTANT' } });
  assert.equal(portfolio.statusCode, 200);
  assert.deepEqual(portfolioWhere, { companyId: 'company-a', active: true });
  await app.close();
});

test('employee status mutation is scoped to both company and own assignment', async () => {
  let taskWhere: any;
  const db = { projectTask: { findFirst: async (args: any) => { taskWhere = args.where; return null; } } };
  const app = await appWith(db);
  const response = await app.inject({ method: 'PATCH', url: '/api/project-tasks/another-task/status', headers: { 'x-test-role': 'EMPLOYEE' }, payload: { status: 'IN_PROGRESS' } });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(taskWhere, { id: 'another-task', companyId: 'company-a', assigneeId: 'employee-1', archivedAt: null });
  await app.close();
});

test('employee queue shows all active projects with own open tasks first', async () => {
  let projectWhere: any;
  let taskWhere: any;
  const projects = [
    { id: 'project-1', code: '1001', name: 'Eget arbete', site: null, status: 'ONGOING', active: true, updatedAt: new Date('2026-08-01T08:00:00.000Z'), customer: null },
    { id: 'project-2', code: '1002', name: 'Projekt utan egen uppgift', site: null, status: 'ONGOING', active: true, updatedAt: new Date('2026-08-20T08:00:00.000Z'), customer: null },
  ];
  const ownTask = task({ priority: 'LOW', dueDate: new Date('2099-08-13T00:00:00.000Z') });
  const colleagueTask = task({
    id: 'task-2', projectId: 'project-2', assigneeId: 'employee-2',
    assignee: { id: 'employee-2', name: 'Kollega' },
  });
  const db = {
    project: { findMany: async (args: any) => { projectWhere = args.where; return projects; } },
    projectTask: { findMany: async (args: any) => {
      taskWhere = args.where;
      return [ownTask, colleagueTask].filter((item) => !args.where.assigneeId || item.assigneeId === args.where.assigneeId);
    } },
    timeEntry: { groupBy: async () => [], findMany: async () => [] },
    projectMaterial: { groupBy: async () => [], findMany: async () => [] },
    projectUpdate: { groupBy: async () => [] },
  };
  const app = await appWith(db);

  const queue = await app.inject({ method: 'GET', url: '/api/project-control/projects', headers: { 'x-test-role': 'EMPLOYEE' } });
  assert.equal(queue.statusCode, 200);
  assert.deepEqual(queue.json().items.map((item: any) => item.id), ['project-1', 'project-2']);
  assert.equal(queue.json().summary.active, 2);
  assert.deepEqual(projectWhere, { companyId: 'company-a', active: true });
  assert.deepEqual(taskWhere, {
    companyId: 'company-a', assigneeId: 'employee-1',
    projectId: { in: ['project-1', 'project-2'] }, archivedAt: null,
  });
  assert.deepEqual(queue.json().items.find((item: any) => item.id === 'project-2').tasks, []);

  const search = await app.inject({ method: 'GET', url: '/api/project-control/projects?q=projekt', headers: { 'x-test-role': 'EMPLOYEE' } });
  assert.equal(search.statusCode, 200);
  assert.deepEqual(search.json().items.map((item: any) => item.id), ['project-1', 'project-2']);
  assert.equal(search.json().summary.active, 2);

  await app.close();
});

test('project search treats Prisma LIKE wildcard characters as literal text', async () => {
  let projectWhere: any;
  const db = {
    project: { findMany: async (args: any) => { projectWhere = args.where; return []; } },
  };
  const app = await appWith(db);

  const response = await app.inject({ method: 'GET', url: '/api/project-control/projects?q=%25_%5C', headers: { 'x-test-role': 'ADMIN' } });
  assert.equal(response.statusCode, 200);
  assert.equal(projectWhere.OR[0].code.contains, '\\%\\_\\\\');
  assert.equal(projectWhere.OR[1].name.contains, '\\%\\_\\\\');
  assert.equal(projectWhere.OR[2].site.contains, '\\%\\_\\\\');
  assert.equal(projectWhere.OR[3].customer.name.contains, '\\%\\_\\\\');

  await app.close();
});

test('employee can change own status but only send a follow-up date for waiting', async () => {
  const current = task();
  let updateData: any;
  const db = {
    projectTask: { findFirst: async () => current },
    $transaction: async (callback: any) => callback({
      projectTask: { update: async (args: any) => { updateData = args.data; return task({ ...args.data, status: args.data.status }); } },
      auditLog: { create: async () => ({}) },
    }),
  };
  const app = await appWith(db);
  const changed = await app.inject({ method: 'PATCH', url: '/api/project-tasks/task-1/status', headers: { 'x-test-role': 'EMPLOYEE' }, payload: { status: 'IN_PROGRESS' } });
  assert.equal(changed.statusCode, 200);
  assert.equal(updateData.dueDate, undefined);
  const invalid = await app.inject({ method: 'PATCH', url: '/api/project-tasks/task-1/status', headers: { 'x-test-role': 'EMPLOYEE' }, payload: { status: 'IN_PROGRESS', dueDate: '2026-08-20' } });
  assert.equal(invalid.statusCode, 400);
  const waitingWithoutDate = await app.inject({ method: 'PATCH', url: '/api/project-tasks/task-1/status', headers: { 'x-test-role': 'EMPLOYEE' }, payload: { status: 'WAITING' } });
  assert.equal(waitingWithoutDate.statusCode, 400);
  const waitingInPast = await app.inject({ method: 'PATCH', url: '/api/project-tasks/task-1/status', headers: { 'x-test-role': 'EMPLOYEE' }, payload: { status: 'WAITING', dueDate: '2020-01-01' } });
  assert.equal(waitingInPast.statusCode, 400);
  await app.close();
});

test('deadline filter excludes completed tasks and projects without matching open work', async () => {
  const db = {
    project: { findMany: async () => [{ id: 'project-1', code: '1001', name: 'Projekt', site: null, status: 'ONGOING', active: true, updatedAt: new Date(), customer: null }] },
    projectTask: { findMany: async () => [task({ status: 'DONE', completedAt: new Date() })] },
    timeEntry: { groupBy: async () => [], findMany: async () => [] }, projectMaterial: { groupBy: async () => [], findMany: async () => [] }, projectUpdate: { groupBy: async () => [] },
  };
  const app = await appWith(db);
  const response = await app.inject({ method: 'GET', url: '/api/project-control/projects?deadline=TODAY', headers: { 'x-test-role': 'ADMIN' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().items, []);
  await app.close();
});

test('deadline filter keeps overview counts stable and returns only matching tasks', async () => {
  const db = {
    project: { findMany: async () => [
      { id: 'project-1', code: '1001', name: 'Projekt ett', site: null, status: 'ONGOING', active: true, updatedAt: new Date(), customer: null },
      { id: 'project-2', code: '1002', name: 'Projekt två', site: null, status: 'ONGOING', active: true, updatedAt: new Date(), customer: null },
    ] },
    projectTask: { findMany: async () => [
      task({ id: 'overdue', dueDate: new Date('2020-01-01T00:00:00.000Z') }),
      task({ id: 'later', dueDate: new Date('2099-01-01T00:00:00.000Z') }),
    ] },
    timeEntry: { groupBy: async () => [], findMany: async () => [] }, projectMaterial: { groupBy: async () => [], findMany: async () => [] }, projectUpdate: { groupBy: async () => [] },
  };
  const app = await appWith(db);
  const response = await app.inject({ method: 'GET', url: '/api/project-control/projects?deadline=OVERDUE', headers: { 'x-test-role': 'ADMIN' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().summary, { active: 2, overdue: 1, dueToday: 0, upcoming: 0, invoiceDraftCount: 0 });
  assert.deepEqual(response.json().items.map((item: any) => ({ id: item.id, tasks: item.tasks.map((itemTask: any) => itemTask.id) })), [{ id: 'project-1', tasks: ['overdue'] }]);
  await app.close();
});

test('portfolio separates reported from approved and calculates money from approved entries only', async () => {
  const project = { id: 'project-1', code: '1001', name: 'Projekt', status: 'ONGOING', active: true, customer: null, billingModel: 'HOURLY', fixedPrice: null, budgetHours: 20 };
  const entryBase = { projectId: 'project-1', billable: true, financialSnapshotCapturedAt: new Date(), approvedBillingRateSnapshot: 100, approvedHourlyCostSnapshot: 50, user: { hourlyCost: 999 }, project: { defaultRate: 999, customer: null }, activity: { rateOverride: 999 } };
  const db = {
    project: { findMany: async () => [project] },
    timeEntry: { findMany: async () => [{ ...entryBase, id: 'approved', status: 'APPROVED', hours: 5 }, { ...entryBase, id: 'draft', status: 'DRAFT', hours: 10 }] },
    projectMaterial: { findMany: async () => [] },
  };
  const app = await appWith(db);
  const response = await app.inject({ method: 'GET', url: '/api/project-portfolio', headers: { 'x-test-role': 'ACCOUNTANT' } });
  assert.equal(response.statusCode, 200);
  const [row] = response.json();
  assert.deepEqual({ reported: row.reportedHours, approved: row.approvedHours, unapproved: row.unapprovedHours, revenue: row.revenue, laborCost: row.laborCost, result: row.result }, { reported: 15, approved: 5, unapproved: 10, revenue: 500, laborCost: 250, result: 250 });
  assert.equal('confirmedPurchaseNetOre' in row, false);
  await app.close();
});

test('work queue includes scoped economy only for managers, never in employee JSON', async () => {
  const sourceWhere: any[] = [];
  const project = { id: 'project-1', code: '42', name: 'Projekt', site: null, status: 'ONGOING', active: true, updatedAt: new Date(), customer: null, budgetHours: 8, billingModel: 'HOURLY', fixedPrice: null };
  const db = {
    project: { findMany: async ({ where }: any) => { assert.equal(where.companyId, 'company-a'); return [project]; } },
    projectTask: { findMany: async () => [] }, projectUpdate: { groupBy: async () => [] },
    timeEntry: { groupBy: async () => [], findMany: async ({ where }: any) => {
      sourceWhere.push(where);
      return [{ projectId: 'project-1', hours: 4, status: 'APPROVED', billable: true, financialSnapshotCapturedAt: new Date(), approvedBillingRateSnapshot: 800, approvedHourlyCostSnapshot: null }];
    } },
    projectMaterial: { groupBy: async () => [], findMany: async ({ where }: any) => { sourceWhere.push(where); return []; } },
  };
  const app = await appWith(db);
  try {
    for (const role of ['ADMIN', 'SUPERVISOR']) {
      const response = await app.inject({ method: 'GET', url: '/api/project-control/projects', headers: { 'x-test-role': role } });
      assert.equal(response.statusCode, 200);
      const { economy } = response.json().items[0];
      assert.equal(economy.basis, 'APPROVED_TIME_AND_REPORTED_MATERIAL');
      assert.equal(economy.approvedHours, 4);
      assert.equal(economy.laborCost, null);
      assert.equal(economy.result, null);
    }
    assert.equal(sourceWhere.length, 4);
    assert.ok(sourceWhere.every((where) => where.project.companyId === 'company-a' && where.projectId.in[0] === 'project-1'));
    const response = await app.inject({ method: 'GET', url: '/api/project-control/projects', headers: { 'x-test-role': 'EMPLOYEE' } });
    const row = response.json().items[0];
    for (const field of ['economy', 'fixedPrice', 'budgetHours', 'billingModel', 'revenue', 'result', 'laborCost']) assert.equal(field in row, false, field);
    assert.equal(sourceWhere.length, 4, 'employee must not query monetary source records');
  } finally { await app.close(); }
});

test('company invoice drafts remain visible with no matching projects, only to managers', async () => {
  const calls: unknown[] = [];
  const app = await appWith({ project: { findMany: async () => [] }, supplierInvoice: { count: async (args: unknown) => { calls.push(args); return 3; } } });
  try {
    for (const role of ['ADMIN', 'SUPERVISOR']) {
      const response = await app.inject({ url: '/api/project-control/projects?q=missing&active=false', headers: { 'x-test-role': role } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().summary.invoiceDraftCount, 3);
      assert.deepEqual(response.json().items, []);
    }
    const employee = await app.inject({ url: '/api/project-control/projects', headers: { 'x-test-role': 'EMPLOYEE' } });
    assert.equal(employee.statusCode, 200);
    assert.equal('invoiceDraftCount' in employee.json().summary, false);
    assert.deepEqual(calls, Array(2).fill({ where: { companyId: 'company-a', status: 'DRAFT' } }));
  } finally { await app.close(); }
});

test('portfolio purchases are signed ore, company scoped and excluded from accountant data and results', async () => {
  const calls: any[] = [];
  const project = { id: 'p1', code: '42', name: 'Projekt', status: 'ONGOING', billingModel: 'HOURLY', customer: null };
  const app = await appWith({
    project: { findMany: async () => [project, { ...project, id: 'p2' }] },
    timeEntry: { findMany: async () => [] }, projectMaterial: { findMany: async () => [] },
    supplierInvoiceAllocation: { groupBy: async (args: any) => { calls.push(args); return [{ projectId: 'p1', _sum: { netOre: -12345 } }]; } },
  });
  try {
    for (const role of ['ADMIN', 'SUPERVISOR']) {
      const response = await app.inject({ url: '/api/project-portfolio', headers: { 'x-test-role': role } });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().map((row: any) => row.confirmedPurchaseNetOre), [-12345, 0]);
      assert.ok(response.json().every((row: any) => row.materialCost === 0 && row.result === 0));
    }
    assert.deepEqual(calls[0], { by: ['projectId'], where: { companyId: 'company-a', projectId: { in: ['p1', 'p2'] }, invoice: { companyId: 'company-a', status: 'CONFIRMED' } }, _sum: { netOre: true } });
    const accountant = await app.inject({ url: '/api/project-portfolio', headers: { 'x-test-role': 'ACCOUNTANT' } });
    assert.equal(accountant.statusCode, 200);
    assert.ok(accountant.json().every((row: any) => !('confirmedPurchaseNetOre' in row)));
    assert.equal((await app.inject({ url: '/api/project-portfolio', headers: { 'x-test-role': 'EMPLOYEE' } })).statusCode, 403);
    assert.equal(calls.length, 2);
  } finally { await app.close(); }
});

test('manager cannot assign a task to a user outside the company', async () => {
  let assigneeWhere: unknown;
  const db = {
    project: { findFirst: async () => ({ id: 'project-1' }) },
    user: { findFirst: async (args: any) => { assigneeWhere = args.where; return null; } },
  };
  const app = await appWith(db);
  const response = await app.inject({ method: 'POST', url: '/api/projects/project-1/tasks', headers: { 'x-test-role': 'ADMIN' }, payload: { title: 'Beställ material', assigneeId: '22222222-2222-4222-8222-222222222222', priority: 'HIGH', status: 'TODO', dueDate: '2026-08-14' } });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(assigneeWhere, { id: '22222222-2222-4222-8222-222222222222', companyId: 'company-a', active: true, role: { in: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] } });
  await app.close();
});

test('manager cannot move the follow-up date of an existing waiting task into the past', async () => {
  const db = { projectTask: { findFirst: async () => task({ status: 'WAITING', dueDate: new Date('2026-08-20T00:00:00.000Z') }) } };
  const app = await appWith(db);
  const response = await app.inject({ method: 'PATCH', url: '/api/project-tasks/task-1', headers: { 'x-test-role': 'ADMIN' }, payload: { dueDate: '2020-01-01' } });
  assert.equal(response.statusCode, 400);
  await app.close();
});
