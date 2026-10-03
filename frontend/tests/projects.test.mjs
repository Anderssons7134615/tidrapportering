import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Projects, api, auth, cleanup, fireEvent, render, waitFor, within, QueryClient, QueryClientProvider, MemoryRouter, useLocation;
let requests = [];
let clients = [];
const originalFetch = globalThis.fetch;
const project = { id: 'project-1', code: '0042', name: 'Testprojekt', customerId: 'customer-1', customer: { id: 'customer-1', name: 'Testkund' }, site: 'Gammal plats', notes: 'Gammal anteckning', budgetHours: 80, billingModel: 'HOURLY', status: 'ONGOING', active: true };
let savedProject;
function CurrentPath() { return React.createElement('output', { 'data-testid': 'current-path' }, useLocation().pathname); }
const controlRow = (p) => ({ ...p, tasks: p.tasks || [], nextTask: null, overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, waitingCount: 0, lastActivityAt: null });

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, FormData: dom.window.FormData, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ cleanup, fireEvent, render, waitFor, within } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ MemoryRouter, useLocation } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Projects } = await vite.ssrLoadModule('/src/pages/Projects.tsx'));
  api = await vite.ssrLoadModule('/src/services/api.ts');
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});

afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients = []; requests = []; globalThis.fetch = originalFetch; });
after(async () => { await vite?.close(); dom?.window.close(); });

function renderProjects({ extraProjects = [], tasks = [], failArchive = '', failSave = false, role = 'ADMIN' } = {}) {
  savedProject = { ...project, tasks };
  let records = [savedProject, ...extraProjects.map((p) => ({ ...project, ...p }))];
  auth.useAuthStore.setState({ token: 'test-token', user: { id: 'admin-1', name: 'Testadmin', role } });
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost');
    const path = parsed.pathname;
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path, method, body });
    let data;
    if (path.endsWith('/project-control/projects')) {
      const items = records.filter((p) => p.active === (parsed.searchParams.get('active') !== 'false') && (!parsed.searchParams.get('q') || p.name.includes(parsed.searchParams.get('q')))).map(controlRow);
      data = { items, summary: { active: items.length, overdue: 0, dueToday: 0, upcoming: 0, invoiceDraftCount: 3 } };
    }
    else if (path.endsWith('/users')) data = [{ id: 'admin-1', name: 'Testadmin', role: 'ADMIN', active: true }];
    else if (path.endsWith('/customers')) data = [project.customer];
    else if (/\/projects\/project-\d+(\/restore)?$/.test(path)) {
      const id = path.match(/project-\d+/)[0];
      if ((method === 'DELETE' && id === failArchive) || (method === 'PUT' && failSave)) return new Response(JSON.stringify({ error: 'Tillfälligt serverfel, försök igen' }), { status: 503 });
      const record = records.find((p) => p.id === id);
      if (method === 'PUT') Object.assign(record, body);
      if (method === 'DELETE') record.active = false;
      if (method === 'POST') record.active = true;
      savedProject = records[0];
      data = record;
    } else if ((path === '/api/project-tasks/task-1' || path === '/api/project-tasks/task-1/status') && method === 'PATCH') data = { ...tasks[0], ...body };
    else throw new Error(`Unexpected test request ${method} ${path}`);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, null, React.createElement(Projects), React.createElement(CurrentPath))));
  return { view, client };
}

test('standard list is customer first, links to detail and hides summaries and management controls', async () => {
  const economy = { reportedHours: 12, unapprovedHours: 4, budgetHours: 10, budgetUsagePercent: 120, warnings: ['Inköpspris saknas på material'] };
  const { view } = renderProjects({ extraProjects: [{ id: 'project-2', name: 'Stort projekt', economy, tasks: [{ title: 'Hemlig detalj i listan' }] }] });
  const row = await view.findByRole('link', { name: /Testkund.*Testprojekt.*0042/ });
  assert.equal(row.getAttribute('href'), '/projects/project-1');
  assert.equal(row.firstElementChild.children[0].textContent, 'Testkund');
  assert.match(row.firstElementChild.children[1].textContent, /^Testprojekt/);
  assert.equal(row.querySelector('button,input'), null);
  assert.equal(view.queryAllByRole('checkbox').length, 0);
  assert.equal(view.queryByText('Inköpspris saknas på material'), null);
  assert.equal(view.queryByText('Nästa uppgift'), null);
  assert.equal(view.queryByText('Timmar och underlag'), null);
  assert.equal(view.container.querySelector('[aria-label="Projektstatus"]'), null);
  assert.equal(view.queryByRole('button', { name: 'Ny uppgift' }), null);
  assert.equal(view.queryByRole('button', { name: /Redigera|Arkivera valda/ }), null);
  fireEvent.click(row);
  await waitFor(() => assert.equal(view.getByTestId('current-path').textContent, '/projects/project-1'));
});

test('projects without a customer use Intern and the employee opens only permitted task tools', async () => {
  const task = { id: 'task-1', title: 'Min uppgift', assigneeId: 'admin-1', assignee: { id: 'admin-1', name: 'Testadmin' }, status: 'TODO', priority: 'NORMAL', dueDate: '2026-10-03' };
  const { view } = renderProjects({ role: 'EMPLOYEE', tasks: [task], extraProjects: [{ id: 'project-2', name: 'Internt arbete', customer: null }] });
  await view.findByRole('link', { name: /Intern.*Internt arbete/ });
  assert.equal(view.queryByRole('button', { name: 'Hantera' }), null);
  assert.equal(view.queryByRole('button', { name: 'Nytt projekt' }), null);
  await openTools(view);
  assert.equal(view.getByRole('button', { name: 'Uppgifter' }).getAttribute('aria-pressed'), 'true');
  assert.equal(view.queryAllByRole('checkbox').length, 0);
  assert.equal(view.queryByRole('button', { name: /Arkiverade|Ny uppgift|Redigera/ }), null);
  fireEvent.click(view.getByRole('button', { name: 'Visa uppgifter för Testprojekt' }));
  assert.ok(view.getByRole('button', { name: 'Min uppgift' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Status för Min uppgift' }), { target: { value: 'IN_PROGRESS' } });
  await waitFor(() => assert.ok(requests.some((r) => r.path === '/api/project-tasks/task-1/status' && r.method === 'PATCH')));
  assert.deepEqual(requests.find((r) => r.path === '/api/project-tasks/task-1/status').body, { status: 'IN_PROGRESS' });
  assert.equal(requests.some((r) => r.path === '/api/project-tasks/task-1'), false);
});

test('empty attention filter offers the visible reset action in compact mode', async () => {
  const { view } = renderProjects();
  await openTools(view);
  fireEvent.click(view.getByRole('button', { name: 'Behöver åtgärd' }));
  fireEvent.click(view.getByRole('button', { name: 'Hantera' }));
  await view.findByText('Inga projekt behöver åtgärd i detta urval');
  assert.ok(view.getByText('Välj Rensa för att visa aktiva projekt utan filter.'));
  assert.equal(view.queryByRole('button', { name: 'Aktiva', exact: true }), null);
  fireEvent.click(view.getByRole('button', { name: 'Rensa', exact: true }));
  await view.findByRole('link', { name: /Testkund.*Testprojekt/ });
});

test('switching view preserves search and archive filters remain visible and can be cleared', async () => {
  const { view } = renderProjects({ extraProjects: [{ id: 'project-2', name: 'Arkivprojekt', active: false }] });
  await view.findByRole('button', { name: 'Hantera' });
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Test' } });
  await view.findByRole('link', { name: /Testkund.*Testprojekt/ });
  await openTools(view);
  assert.equal(view.getByRole('searchbox').value, 'Test');
  fireEvent.click(view.getByRole('button', { name: 'Hantera' }));
  assert.equal(view.getByRole('searchbox').value, 'Test');
  fireEvent.change(view.getByRole('searchbox'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Filter', exact: true }));
  fireEvent.change(view.getByRole('combobox', { name: 'Visa aktiva eller arkiverade projekt' }), { target: { value: 'archived' } });
  await view.findByRole('link', { name: /Testkund.*Arkivprojekt/ });
  assert.match(view.container.textContent, /Visar:.*Arkiverade/);
  fireEvent.click(view.getByRole('button', { name: 'Rensa', exact: true }));
  await view.findByRole('link', { name: /Testkund.*Testprojekt/ });
  assert.equal(view.queryByRole('link', { name: /Arkivprojekt/ }), null);
});

test('invoice draft link is company-wide even with an empty project search and hidden from employees', async () => {
  const { view } = renderProjects();
  await openTools(view);
  const link = await view.findByRole('link', { name: 'Inköp · 3 utkast i företaget' });
  assert.equal(link.getAttribute('href'), '/purchases?status=DRAFT');
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Saknas' } });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('link', { name: /0042.*Testprojekt/ })), false));
  assert.ok(view.getByRole('link', { name: 'Inköp · 3 utkast i företaget' }));
  cleanup();
  const employee = renderProjects({ role: 'EMPLOYEE' });
  await openTools(employee.view);
  await employee.view.findByRole('link', { name: /0042.*Testprojekt/ });
  assert.equal(employee.view.queryByRole('link', { name: /Inköp/ }), null);
});

async function openTools(view) {
  fireEvent.click(await view.findByRole('button', { name: /^(Hantera|Uppgifter)$/ }));
}

async function openEditor(view) {
  await view.findByRole('link', { name: /0042.*Testprojekt/ });
  // The old UI hides this action in the task disclosure.
  if (!view.queryByRole('button', { name: /Redigera.*Testprojekt/ })) {
    fireEvent.click(view.getByRole('button', { name: /Visa uppgifter/ }));
  }
  fireEvent.click(view.getByRole('button', { name: /Redigera/ }));
  const dialog = await view.findByRole('dialog', { name: 'Redigera projekt' });
  await waitFor(() => assert.ok(within(dialog).getByRole('option', { name: 'Testkund' })));
  return within(dialog);
}

test('clearing optional project fields persists after save and reread', async () => {
  const { view } = renderProjects();
  await openTools(view);
  const dialog = await openEditor(view);
  for (const label of ['Arbetsplats', 'Anteckningar', 'Budget timmar']) fireEvent.change(dialog.getByLabelText(label), { target: { value: '' } });
  fireEvent.change(dialog.getByLabelText('Kund', { exact: true }), { target: { value: '' } });
  fireEvent.click(dialog.getByRole('button', { name: /^Spara/ }));
  await waitFor(() => assert.ok(requests.some((r) => r.method === 'PUT')));
  const reread = await api.projectsApi.get(project.id);
  for (const key of ['customerId', 'site', 'notes', 'budgetHours']) assert.equal(reread[key], null, `${key} must clear on the server`);
});

test('archive selection requires confirmation and restores the same project from the archive', async () => {
  const { view } = renderProjects();
  await openTools(view);
  fireEvent.click(await view.findByRole('checkbox', { name: /Markera 0042/ }));
  fireEvent.click(view.getByRole('button', { name: 'Arkivera valda' }));
  assert.equal(requests.some((r) => r.method === 'DELETE'), false);
  fireEvent.click(within(view.getByRole('dialog', { name: 'Arkivera 1 projekt?' })).getByRole('button', { name: 'Arkivera projekt', exact: true }));
  await view.findByText('Inga aktiva projekt');
  assert.equal(savedProject.active, false);
  fireEvent.click(view.getByRole('button', { name: 'Arkiverade', exact: true }));
  const restore = await view.findByRole('button', { name: /Återställ 0042/ });
  await waitFor(() => assert.equal(restore.disabled, false));
  fireEvent.click(restore);
  fireEvent.click(within(view.getByRole('dialog', { name: 'Återställ 1 projekt?' })).getByRole('button', { name: 'Återställ projekt', exact: true }));
  await view.findByText('Inga arkiverade projekt');
  assert.equal(savedProject.active, true);
  assert.equal(savedProject.status, project.status);
});

test('partial archive failures keep failed projects selected with a readable error', async () => {
  const { view } = renderProjects({ extraProjects: [{ id: 'project-2', code: '0043', name: 'Andra projektet' }], failArchive: 'project-2' });
  await openTools(view);
  fireEvent.click(await view.findByRole('checkbox', { name: 'Markera alla visade' }));
  fireEvent.click(view.getByRole('button', { name: 'Arkivera valda' }));
  fireEvent.click(within(view.getByRole('dialog', { name: 'Arkivera 2 projekt?' })).getByRole('button', { name: 'Arkivera projekt', exact: true }));
  assert.match((await view.findByRole('alert')).textContent, /0043.*Tillfälligt serverfel/);
  await waitFor(() => assert.equal(Boolean(view.queryByRole('checkbox', { name: /Markera 0042/ })), false));
  assert.equal(view.getByRole('checkbox', { name: /Markera 0043/ }).checked, true);
  assert.equal(requests.filter((r) => r.method === 'DELETE').length, 2);
});

test('failed saves keep the entered values and show the error inside the editor', async () => {
  const { view } = renderProjects({ failSave: true });
  await openTools(view);
  const dialog = await openEditor(view);
  fireEvent.change(dialog.getByLabelText('Projektnamn'), { target: { value: 'Behåll mitt utkast' } });
  fireEvent.click(dialog.getByRole('button', { name: /^Spara/ }));
  assert.match((await dialog.findByRole('alert')).textContent, /Tillfälligt serverfel/);
  assert.equal(dialog.getByLabelText('Projektnamn').value, 'Behåll mitt utkast');
  assert.equal(savedProject.name, project.name);
});

test('employee sees projects without archive or project editing actions', async () => {
  const { view } = renderProjects({ role: 'EMPLOYEE' });
  await openTools(view);
  await view.findByRole('link', { name: /0042.*Testprojekt/ });
  assert.equal(view.queryAllByRole('checkbox').length, 0);
  assert.equal(view.queryAllByRole('button', { name: /Redigera|Arkiverade|Nytt projekt/ }).length, 0);
});

test('changing search clears selection so hidden projects cannot be archived', async () => {
  const { view } = renderProjects({ extraProjects: [{ id: 'project-2', code: '0043', name: 'Andra projektet' }] });
  await openTools(view);
  fireEvent.click(await view.findByRole('checkbox', { name: /Markera 0042/ }));
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Andra' } });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('checkbox', { name: /Markera 0042/ })), false));
  assert.equal(Boolean(view.queryByRole('button', { name: 'Arkivera valda' })), false);
  assert.equal(requests.some((r) => r.method === 'DELETE'), false);
});

test('manager sees missing financial basis and filters projects needing action', async () => {
  const economy = { reportedHours: 12, approvedHours: 8, unapprovedHours: 4, budgetHours: 10, budgetUsagePercent: 120, warnings: ['Inköpspris saknas på material'] };
  const { view } = renderProjects({ extraProjects: [{ id: 'project-2', code: '0043', name: 'Följ upp', economy }] });
  await openTools(view);
  await view.findByText('Inköpspris saknas på material');
  assert.ok(view.getByText('Timbudget nådd'));
  fireEvent.click(view.getByRole('button', { name: 'Behöver åtgärd' }));
  assert.ok(view.getByRole('link', { name: /0043.*Följ upp/ }));
  assert.equal(view.queryByRole('link', { name: /0042.*Testprojekt/ }), null);
  fireEvent.click(view.getByRole('checkbox', { name: 'Markera alla visade' }));
  assert.ok(view.getByText('1 valda'));
  fireEvent.click(view.getByRole('button', { name: 'Aktiva', exact: true }));
  assert.ok(view.getByRole('link', { name: /0042.*Testprojekt/ }));
  assert.equal(view.getByRole('button', { name: 'Behöver åtgärd' }).getAttribute('aria-pressed'), 'false');
});

test('employee never renders economic fields even if an old cache contains them', async () => {
  const { view } = renderProjects({ role: 'EMPLOYEE', extraProjects: [{ id: 'project-2', code: '0043', name: 'Följ upp', economy: { reportedHours: 12, approvedHours: 8, unapprovedHours: 4, budgetHours: 10, budgetUsagePercent: 120, warnings: ['Timkostnad saknas'] } }] });
  await openTools(view);
  await view.findByRole('link', { name: /0043.*Följ upp/ });
  assert.equal(view.queryByText('Timkostnad saknas'), null);
  assert.equal(view.queryByRole('button', { name: 'Behöver åtgärd' }), null);
  assert.equal(view.queryByRole('link', { name: 'Ekonomi' }), null);
});

test('saving a project refreshes cached detail, dashboard, portfolio and selectors', async () => {
  const { view, client } = renderProjects();
  await openTools(view);
  const keys = [['project', project.id], ['project', project.id, 'summary'], ['dashboard'], ['projects', 'active'], ['project-portfolio'], ['project-control', 'cached-filter']];
  keys.forEach((key) => client.setQueryData(key, { old: true }));
  const dialog = await openEditor(view);
  fireEvent.change(dialog.getByLabelText('Projektnamn'), { target: { value: 'Uppdaterat projekt' } });
  fireEvent.click(dialog.getByRole('button', { name: /^Spara/ }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog', { name: 'Redigera projekt' })), false));
  for (const key of keys) assert.equal(client.getQueryState(key)?.isInvalidated, true, `${key.join('/')} must not keep old values`);
});

test('saving a name preserves a price changed by a colleague after the editor opened', async () => {
  const { view } = renderProjects();
  await openTools(view);
  const dialog = await openEditor(view);
  savedProject.defaultRate = 900;
  savedProject.site = 'Uppdaterat av kollega';
  fireEvent.change(dialog.getByLabelText('Projektnamn'), { target: { value: 'Nytt namn' } });
  fireEvent.click(dialog.getByRole('button', { name: /^Spara/ }));
  await waitFor(() => assert.ok(requests.some((r) => r.method === 'PUT')));
  assert.deepEqual(requests.find((r) => r.method === 'PUT').body, { name: 'Nytt namn' });
  const reread = await api.projectsApi.get(project.id);
  assert.equal(reread.defaultRate, 900);
  assert.equal(reread.site, 'Uppdaterat av kollega');
});

test('clearing an existing task note sends null instead of restoring the previous note', async () => {
  const { view } = renderProjects({ tasks: [{ id: 'task-1', title: 'Kontrollera montage', note: 'Gammal anteckning', assigneeId: 'admin-1', assignee: { name: 'Testadmin' }, status: 'TODO', priority: 'NORMAL', dueDate: '2026-10-01' }] });
  await openTools(view);
  fireEvent.click(await view.findByRole('button', { name: /Visa uppgifter/ }));
  fireEvent.click(view.getByRole('button', { name: 'Kontrollera montage' }));
  const dialog = within(view.getByRole('dialog', { name: 'Redigera uppgift' }));
  fireEvent.change(dialog.getByLabelText('Anteckning, valfri'), { target: { value: '' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Spara uppgift' }));
  await waitFor(() => assert.ok(requests.some((r) => r.method === 'PATCH')));
  assert.equal(requests.find((r) => r.method === 'PATCH').body.note, null);
});
