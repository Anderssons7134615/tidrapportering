import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, App, auth, offline, render, cleanup, fireEvent, waitFor, within, act;
let QueryClient, QueryClientProvider, MemoryRouter;
let clients = [], requests = [], records;
const originalFetch = globalThis.fetch;
const makeProject = (i, active = true) => ({ id: `p-${i}`, code: String(i).padStart(4, '0'), name: `Provprojekt ${i}`, active, status: 'ONGOING', site: 'Provplats', customer: { id: 'c1', name: 'Provkund' }, notes: 'Äldre beskrivning', employeeCanSeeResults: false, hours: { reported: 1.25, approved: 0.75 }, tasks: [], updates: [], updatedAt: '2026-10-01T12:00:00Z' });
before(async () => {
  dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, FormData: dom.window.FormData, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  HTMLElement.prototype.scrollIntoView = function () {};
  ({ render, cleanup, fireEvent, waitFor, within, act } = await import('@testing-library/react'));
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 10_000 });
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ MemoryRouter } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: App } = await vite.ssrLoadModule('/src/App.tsx'));
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
  offline = await vite.ssrLoadModule('/src/stores/offlineStore.ts');
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); requests = []; globalThis.fetch = originalFetch; });
after(async () => { await vite.close(); dom.window.close(); });
function setup({ path = '/projects', role = 'ADMIN', count = 3, handler } = {}) {
  records = Array.from({ length: count }, (_, i) => makeProject(i, i % 2 === 0));
  const user = { id: 'u1', role, name: 'Provperson', companyId: 'c-a', companyName: 'QA – inte företagsdata' };
  auth.useAuthStore.setState({ token: 'synthetic-local-only', user });
  offline.useOfflineStore.setState({ isOnline: false, pendingEntries: [] });
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost'); const path = parsed.pathname; const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path, method, body });
    const override = await handler?.(path, method, body);
    if (override instanceof Response) return override;
    if (override !== undefined) return Response.json(override);
    if (path === '/api/project-workspace') return Response.json({ items: records });
    // Baseline route, removed once the new workspace owns /projects.
    if (path === '/api/project-control/projects') return Response.json({ items: records.filter(p => p.active).map(p => ({ ...p, nextTask: null, overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, waitingCount: 0 })), summary: { active: 2 } });
    if (path === '/api/users') return Response.json([{ ...user, active: true }]);
    if (path === '/api/projects/p-0/updates' && method === 'POST') { const update = { id: 'n1', projectId: 'p-0', type: body.type, content: body.content, occurredAt: '2026-10-24T12:00:00Z' }; records[0].updates.unshift(update); return Response.json(update); }
    if (path === '/api/projects/p-0/time-entries') return Response.json([{ id: 'e1', userId: 'u1', hours: 0.75, date: '2026-10-01', status: 'APPROVED', user: { name: 'Provperson' }, activity: { name: 'Provaktivitet' } }]);
    throw new Error(`Blocked unexpected request ${method} ${path}`);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  client.setQueryData(['auth', 'me'], user); clients.push(client);
  return { view: render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App)))), client };
}

test('real projects route is the workspace and includes all 251 original project IDs, including archives, without writes', async () => {
  const { view } = setup({ count: 251 });
  await view.findByRole('heading', { name: 'Projektarbetsyta' });
  const directory = within(view.getByRole('region', { name: 'Projektlista' }));
  await waitFor(() => assert.equal(directory.getAllByRole('link').length, 251));
  assert.deepEqual(new Set(directory.getAllByRole('link').map(link => link.getAttribute('href').split('?')[0])), new Set(records.map(p => `/projects/${p.id}`)));
  assert.equal(requests.every(request => request.method === 'GET'), true);
  assert.equal(requests.some(request => /economy|project-portfolio|materials|supplier-invoices|project-control/.test(request.path)), false);
});

test('opening a project keeps its older notes and shows only hours, with no financial API calls', async () => {
  const { view } = setup({ path: '/projects/p-0' });
  await view.findByRole('heading', { name: 'Provprojekt 0' });
  assert.ok(view.getByText('Äldre beskrivning'));
  assert.match(view.getByRole('region', { name: 'Projektets timmar' }).textContent, /1,25 h.*rapporterat.*0,75 h.*attesterat/i);
  assert.equal(view.queryByText(/kr\/tim|Timkostnad|Beräknat resultat|Inköp och lager|Fast pris/i), null);
  fireEvent.click(view.getByRole('tab', { name: 'Tid', exact: true }));
  await view.findByText('Provaktivitet');
  assert.equal(requests.some(request => /summary|portfolio|economy|materials|supplier-invoices/.test(request.path)), false);
});

test('note failures retain text, success is reread against the same project and does not modify any time row', async () => {
  let fail = true;
  const { view } = setup({ path: '/projects/p-0', handler: (path, method) => path.endsWith('/updates') && method === 'POST' && fail ? Response.json({ error: 'Tillfälligt anteckningsfel' }, { status: 503 }) : undefined });
  fireEvent.click(await view.findByRole('button', { name: 'Lägg till anteckning', exact: true }));

  const dialog = within(view.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Anteckning'), { target: { value: 'Kontrollera mått före montage' } });

  fireEvent.click(dialog.getByRole('button', { name: 'Spara anteckning' }));

  await dialog.findByText('Tillfälligt anteckningsfel');

  assert.equal(dialog.getByLabelText('Anteckning').value, 'Kontrollera mått före montage');
  fail = false; fireEvent.click(dialog.getByRole('button', { name: 'Spara anteckning' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog')), false));
  await view.findByText('Kontrollera mått före montage');
  assert.equal(requests.filter(request => request.method !== 'GET').every(request => request.path === '/api/projects/p-0/updates'), true);
  assert.ok(requests.filter(request => request.path === '/api/project-workspace').length >= 2);
});

test('old economy link resolves to the workspace without loading any economy route', async () => {
  const { view } = setup({ path: '/project-economy' });
  await view.findByRole('heading', { name: 'Projektarbetsyta' });
  assert.equal(requests.some(request => /economy|portfolio|materials/.test(request.path)), false);
});

test('editing a workspace project never renders or submits hidden prices, budgets or billing model', async () => {
  const history = { fixedPrice: 98765, defaultRate: 650, budgetHours: 100, billingModel: 'FIXED' };
  const { view } = setup({ path: '/projects/p-0', handler: (path, method, body) => {
    if (path === '/api/customers') return [{ id: 'c1', name: 'Provkund' }];
    if (path === '/api/projects/p-0' && method === 'PUT') { Object.assign(records[0], body); return { ...records[0], ...history }; }
  } });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera Provprojekt 0' }));
  const form = within(view.getByRole('dialog'));
  assert.equal(form.queryAllByLabelText(/Timpris|Anbud|Budget timmar|Debitering/i).length, 0);
  fireEvent.change(form.getByLabelText('Projektnamn'), { target: { value: 'Nytt projektnamn' } });
  fireEvent.click(form.getByRole('button', { name: 'Spara ändringar' }));
  await waitFor(() => assert.ok(requests.some(r => r.method === 'PUT')));
  assert.deepEqual(requests.find(r => r.method === 'PUT').body, { name: 'Nytt projektnamn' });
  assert.deepEqual(history, { fixedPrice: 98765, defaultRate: 650, budgetHours: 100, billingModel: 'FIXED' });
});

test('task search matches an individual task note without showing unrelated tasks', async () => {
  let initial = true;
  const { view } = setup({ path: '/projects?view=tasks&q=Unik uppgiftsnot', handler: path => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].tasks = [{ id: 't1', title: 'Kontrollera skydd', note: 'Unik uppgiftsnot', status: 'TODO', assigneeId: 'u1', assignee: { name: 'Provperson' }, dueDate: '2099-01-01' }, { id: 't2', title: 'Annan uppgift', status: 'TODO', assigneeId: 'u1', assignee: { name: 'Provperson' }, dueDate: '2099-01-01' }]; }
  } });
  await view.findByRole('button', { name: 'Kontrollera skydd', exact: true });
  assert.equal(view.queryAllByRole('button', { name: 'Annan uppgift', exact: true }).length, 0);
});

test('global notes filter individual content and include matching older project notes', async () => {
  let initial = true;
  const { view } = setup({ path: '/projects?view=notes&q=Brandskydd', handler: path => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].notes = 'Unik äldre anteckning'; records[0].updates = [{ id: 'n1', type: 'NOTE', content: 'Brandskydd kontrollerat', occurredAt: '2026-10-01' }, { id: 'n2', type: 'NOTE', content: 'Parkering flyttad', occurredAt: '2026-10-02' }]; }
  } });
  await view.findByText('Brandskydd kontrollerat');
  assert.equal(view.queryAllByText('Parkering flyttad').length, 0);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Unik äldre anteckning' } });
  await view.findByText('Unik äldre anteckning');
  assert.ok(view.getByText('Äldre projektanteckning'));
  assert.equal(view.queryAllByText('Brandskydd kontrollerat').length, 0);
});

test('show all events moves keyboard focus to the newly selected notes tab', async () => {
  let initial = true;
  const { view } = setup({ path: '/projects/p-0', handler: path => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].updates = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, type: 'NOTE', content: `Provhändelse ${i}`, occurredAt: '2026-10-01' })); }
  } });
  const button = await view.findByRole('button', { name: 'Visa alla 4 händelser' });
  button.focus(); fireEvent.click(button);
  const tab = view.getByRole('tab', { name: 'Anteckningar', exact: true });
  await waitFor(() => assert.equal(document.activeElement === tab, true));
});

test('late user options never silently replace an existing task assignee', async () => {
  let initial = true, releaseUsers;
  const { view } = setup({ path: '/projects/p-0?tab=tasks', handler: (path, method, body) => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].tasks = [{ id: 't2', projectId: 'p-0', title: 'Tilldelad annan person', status: 'TODO', assigneeId: 'u2', assignee: { id: 'u2', name: 'Andra personen' }, priority: 'NORMAL', dueDate: '2099-10-29' }]; }
    if (path === '/api/users') return new Promise(resolve => { releaseUsers = resolve; });
    if (path === '/api/project-tasks/t2' && method === 'PATCH') { Object.assign(records[0].tasks[0], body); return records[0].tasks[0]; }
  } });
  fireEvent.click(await view.findByRole('button', { name: 'Tilldelad annan person' }));
  const dialog = within(view.getByRole('dialog'));
  await waitFor(() => assert.equal(typeof releaseUsers, 'function'));
  await act(async () => releaseUsers([{ id: 'u1', name: 'Första personen', role: 'ADMIN', active: true }, { id: 'u2', name: 'Andra personen', role: 'EMPLOYEE', active: true }]));
  await dialog.findByRole('option', { name: 'Första personen' });
  assert.equal(dialog.getByLabelText('Ansvarig').value, 'u2');
  fireEvent.change(dialog.getByLabelText('Vad ska göras?'), { target: { value: 'Ändrad rubrik' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Spara uppgift' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog')), false));
  assert.equal(requests.find(r => r.method === 'PATCH').body.assigneeId, 'u2');
});

test('an assignee absent from active options remains selected instead of falling back to another person', async () => {
  let initial = true;
  const { view } = setup({ path: '/projects/p-0?tab=tasks', handler: path => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].tasks = [{ id: 't2', projectId: 'p-0', title: 'Historisk ansvarig', status: 'TODO', assigneeId: 'u2', assignee: { id: 'u2', name: 'Andra personen' }, priority: 'NORMAL', dueDate: '2099-10-29' }]; }
    if (path === '/api/users') return [{ id: 'u1', name: 'Första personen', role: 'ADMIN', active: true }, { id: 'u2', name: 'Andra personen', role: 'EMPLOYEE', active: false }];
  } });
  fireEvent.click(await view.findByRole('button', { name: 'Historisk ansvarig' }));
  const dialog = within(view.getByRole('dialog'));
  await dialog.findByRole('option', { name: 'Första personen' });
  assert.equal(dialog.getByLabelText('Ansvarig').value, 'u2');
  assert.ok(dialog.getByRole('option', { name: 'Andra personen (nuvarande ansvarig)' }));
  assert.equal(requests.some(r => r.method !== 'GET'), false);
});

test('employees retain task status and explicit waiting-date editing through the real workspace route', async () => {
  let initial = true;
  const { view } = setup({ role: 'EMPLOYEE', path: '/projects/p-0?tab=tasks', handler: (path, method, body) => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].hours = { reported: null, approved: null }; records[0].tasks = [{ id: 'own-task', projectId: 'p-0', title: 'Egen uppföljning', status: 'TODO', assigneeId: 'u1', assignee: { name: 'Provperson' }, dueDate: '2099-10-29', priority: 'NORMAL' }]; }
    if (path === '/api/project-tasks/own-task/status' && method === 'PATCH') { Object.assign(records[0].tasks[0], body); return records[0].tasks[0]; }
  } });
  fireEvent.click(await view.findByRole('button', { name: 'Egen uppföljning', exact: true }));
  let dialog = within(view.getByRole('dialog', { name: 'Redigera uppgift' }));
  assert.equal(dialog.getByLabelText('Vad ska göras?').disabled, true);
  fireEvent.change(dialog.getByLabelText('Status'), { target: { value: 'IN_PROGRESS' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Spara uppgift' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog')), false));
  await waitFor(() => assert.equal(records[0].tasks[0].status, 'IN_PROGRESS'));
  fireEvent.click(view.getByRole('button', { name: 'Egen uppföljning', exact: true }));
  dialog = within(view.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Status'), { target: { value: 'WAITING' } });
  fireEvent.change(dialog.getByLabelText('Deadline / uppföljning'), { target: { value: '2099-11-02' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Spara uppgift' }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog')), false));
  assert.deepEqual(requests.filter(r => r.method === 'PATCH').map(r => r.body), [{ status: 'IN_PROGRESS' }, { status: 'WAITING', dueDate: '2099-11-02' }]);
  assert.equal(requests.some(r => r.path === '/api/users'), false);
});

test('failed task completion retains status; confirmed completion rereads and keeps keyboard focus in the list', async () => {
  let initial = true, fail = true;
  const { view } = setup({ path: '/projects/p-0', handler: (path, method, body) => {
    if (path === '/api/project-workspace' && initial) { initial = false; records[0].tasks = [{ id: 't1', projectId: 'p-0', title: 'Kontrollera montage', status: 'TODO', assigneeId: 'u1', assignee: { name: 'Provperson' }, dueDate: '2026-10-29' }]; }
    if (path === '/api/project-tasks/t1/status') {
      if (fail) return Response.json({ error: 'Status kunde inte sparas' }, { status: 503 });
      Object.assign(records[0].tasks[0], body); return records[0].tasks[0];
    }
  } });
  const checkbox = await view.findByRole('checkbox', { name: /Avklarad: Kontrollera montage/ });
  checkbox.focus(); fireEvent.click(checkbox);
  await view.findByRole('alert');
  assert.equal(checkbox.checked, false);
  fail = false;
  await waitFor(() => assert.equal(checkbox.disabled, false));
  checkbox.focus(); fireEvent.click(checkbox);
  await waitFor(() => assert.equal(view.queryAllByRole('checkbox', { name: /Avklarad: Kontrollera montage/ }).length, 0));
  assert.equal(document.activeElement.getAttribute('aria-label'), 'Uppgiftslista');
  assert.equal(requests.filter(r => r.method === 'PATCH').every(r => r.path === '/api/project-tasks/t1/status'), true);
});

test('task creation requires an explicit person and date and coalesces repeated submits before React rerenders', async () => {
  const { view } = setup({ path: '/projects/p-0', handler: (path, method, body) => {
    if (path === '/api/projects/p-0/tasks' && method === 'POST') {
      const task = { ...body, id: 'task-new', projectId: 'p-0', assignee: { id: 'u1', name: 'Provperson' } };
      records[0].tasks.push(task); return task;
    }
  } });
  fireEvent.click(await view.findByRole('button', { name: 'Ny uppgift' }));
  const dialog = within(view.getByRole('dialog'));
  await dialog.findByRole('option', { name: 'Provperson' });
  assert.equal(dialog.getByLabelText('Ansvarig').value, '');
  assert.equal(dialog.getByLabelText('Deadline / uppföljning').value, '');
  fireEvent.change(dialog.getByLabelText('Vad ska göras?'), { target: { value: 'Kontrollera skydd' } });
  fireEvent.change(dialog.getByLabelText('Ansvarig'), { target: { value: 'u1' } });
  fireEvent.change(dialog.getByLabelText('Deadline / uppföljning'), { target: { value: '2026-10-29' } });
  const form = view.getByRole('dialog').querySelector('form');
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog')), false));
  await view.findByText('Kontrollera skydd');
  assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  assert.deepEqual(requests.find(r => r.method === 'POST').body, { title: 'Kontrollera skydd', assigneeId: 'u1', dueDate: '2026-10-29', priority: 'NORMAL', status: 'TODO' });
});

test('user editor hides internal costs and omits them when saving unrelated user details', async () => {
  const user = { id: 'u1', name: 'Provperson', email: 'qa@example.test', role: 'EMPLOYEE', active: true, hourlyCost: 456.75, allowIncompleteWeekApproval: true };
  const { view } = setup({ path: '/users', handler: (path, method, body) => {
    if (path === '/api/users') return [user];
    if (path === '/api/users/u1' && method === 'PUT') { Object.assign(user, body); return user; }
  } });
  await view.findByRole('heading', { name: 'Användare' });
  assert.equal(view.queryAllByText(/Intern timkostnad|456,75/).length, 0);
  fireEvent.click(view.getByRole('button', { name: 'Redigera användare' }));
  const form = within(view.getByRole('dialog'));
  assert.equal(form.queryAllByLabelText(/Intern timkostnad/).length, 0);
  fireEvent.change(form.getByLabelText('Namn *'), { target: { value: 'Nytt provnamn' } });
  fireEvent.click(form.getByRole('button', { name: 'Spara', exact: true }));
  await waitFor(() => assert.ok(requests.some(r => r.method === 'PUT')));
  assert.equal(Object.hasOwn(requests.find(r => r.method === 'PUT').body, 'hourlyCost'), false);
  assert.equal(user.hourlyCost, 456.75);
  assert.equal(user.allowIncompleteWeekApproval, true);
});

test('settings omit hidden VAT without changing the CSV separator or reminder policy', async () => {
  const settings = { companyName: 'QA', vatRate: 25, csvDelimiter: ';', reminderTime: '16:00', reminderEnabled: true };
  const { view } = setup({ path: '/settings', handler: (path, method, body) => {
    if (path === '/api/push-subscriptions') return [];
    if (path === '/api/settings') { if (method === 'PUT') Object.assign(settings, body); return settings; }
  } });
  await view.findByLabelText('Företagsnamn');
  assert.equal(view.queryAllByLabelText('Momssats (%)').length, 0);
  fireEvent.change(view.getByLabelText('Företagsnamn'), { target: { value: 'QA nytt namn' } });
  fireEvent.click(view.getByRole('button', { name: 'Spara inställningar' }));
  await waitFor(() => assert.ok(requests.some(r => r.method === 'PUT')));
  assert.equal(Object.hasOwn(requests.find(r => r.method === 'PUT').body, 'vatRate'), false);
  assert.equal(settings.vatRate, 25);
  assert.equal(settings.csvDelimiter, ';');
  assert.equal(settings.reminderEnabled, true);
});
