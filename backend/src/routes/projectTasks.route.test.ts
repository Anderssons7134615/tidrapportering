import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { createProjectTaskRoutes } from './projectTasks.js';

const actor = {
  ADMIN: { id: 'admin-1', email: 'admin@test', role: 'ADMIN', companyId: 'company-a', sessionVersion: 0 },
  EMPLOYEE: { id: 'employee-1', email: 'employee@test', role: 'EMPLOYEE', companyId: 'company-a', sessionVersion: 0 },
  ACCOUNTANT: { id: 'accountant-1', email: 'accountant@test', role: 'ACCOUNTANT', companyId: 'company-a', sessionVersion: 0 },
} as const;

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
  await app.register(createProjectTaskRoutes(db), { prefix: '/api' });
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
    timeEntry: { groupBy: async () => [] },
    projectMaterial: { groupBy: async () => [] },
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
    timeEntry: { groupBy: async () => [] }, projectMaterial: { groupBy: async () => [] }, projectUpdate: { groupBy: async () => [] },
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
    timeEntry: { groupBy: async () => [] }, projectMaterial: { groupBy: async () => [] }, projectUpdate: { groupBy: async () => [] },
  };
  const app = await appWith(db);
  const response = await app.inject({ method: 'GET', url: '/api/project-control/projects?deadline=OVERDUE', headers: { 'x-test-role': 'ADMIN' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().summary, { active: 2, overdue: 1, dueToday: 0, upcoming: 0 });
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
  await app.close();
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
