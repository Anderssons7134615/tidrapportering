import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Projects, api, auth, cleanup, fireEvent, render, waitFor, within, QueryClient, QueryClientProvider, MemoryRouter;
let requests = [];
let clients = [];
const originalFetch = globalThis.fetch;
const project = { id: 'project-1', code: '0042', name: 'Testprojekt', customerId: 'customer-1', customer: { id: 'customer-1', name: 'Testkund' }, site: 'Gammal plats', notes: 'Gammal anteckning', budgetHours: 80, billingModel: 'HOURLY', status: 'ONGOING', active: true };
let savedProject;
const controlRow = (p) => ({ ...p, tasks: p.tasks || [], nextTask: null, overdueCount: 0, dueTodayCount: 0, upcomingCount: 0, waitingCount: 0, lastActivityAt: null });

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, FormData: dom.window.FormData, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ cleanup, fireEvent, render, waitFor, within } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ MemoryRouter } = await import('react-router-dom'));
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
      data = { items, summary: { active: items.length, overdue: 0, dueToday: 0, upcoming: 0 } };
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
    } else if (path === '/api/project-tasks/task-1' && method === 'PATCH') data = { ...tasks[0], ...body };
    else throw new Error(`Unexpected test request ${method} ${path}`);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, null, React.createElement(Projects))));
  return { view, client };
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
  const dialog = await openEditor(view);
  fireEvent.change(dialog.getByLabelText('Projektnamn'), { target: { value: 'Behåll mitt utkast' } });
  fireEvent.click(dialog.getByRole('button', { name: /^Spara/ }));
  assert.match((await dialog.findByRole('alert')).textContent, /Tillfälligt serverfel/);
  assert.equal(dialog.getByLabelText('Projektnamn').value, 'Behåll mitt utkast');
  assert.equal(savedProject.name, project.name);
});

test('employee sees projects without archive or project editing actions', async () => {
  const { view } = renderProjects({ role: 'EMPLOYEE' });
  await view.findByRole('link', { name: /0042.*Testprojekt/ });
  assert.equal(view.queryAllByRole('checkbox').length, 0);
  assert.equal(view.queryAllByRole('button', { name: /Redigera|Arkiverade|Nytt projekt/ }).length, 0);
});

test('changing search clears selection so hidden projects cannot be archived', async () => {
  const { view } = renderProjects({ extraProjects: [{ id: 'project-2', code: '0043', name: 'Andra projektet' }] });
  fireEvent.click(await view.findByRole('checkbox', { name: /Markera 0042/ }));
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Andra' } });
  await waitFor(() => assert.equal(Boolean(view.queryByRole('checkbox', { name: /Markera 0042/ })), false));
  assert.equal(Boolean(view.queryByRole('button', { name: 'Arkivera valda' })), false);
  assert.equal(requests.some((r) => r.method === 'DELETE'), false);
});

test('saving a project refreshes cached detail, dashboard, portfolio and selectors', async () => {
  const { view, client } = renderProjects();
  const keys = [['project', project.id], ['project', project.id, 'summary'], ['dashboard'], ['projects', 'active'], ['project-portfolio']];
  keys.forEach((key) => client.setQueryData(key, { old: true }));
  const dialog = await openEditor(view);
  fireEvent.change(dialog.getByLabelText('Projektnamn'), { target: { value: 'Uppdaterat projekt' } });
  fireEvent.click(dialog.getByRole('button', { name: /^Spara/ }));
  await waitFor(() => assert.equal(Boolean(view.queryByRole('dialog', { name: 'Redigera projekt' })), false));
  for (const key of keys) assert.equal(client.getQueryState(key)?.isInvalidated, true, `${key.join('/')} must not keep old values`);
});

test('saving a name preserves a price changed by a colleague after the editor opened', async () => {
  const { view } = renderProjects();
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
  fireEvent.click(await view.findByRole('button', { name: /Visa uppgifter/ }));
  fireEvent.click(view.getByRole('button', { name: 'Kontrollera montage' }));
  const dialog = within(view.getByRole('dialog', { name: 'Redigera uppgift' }));
  fireEvent.change(dialog.getByLabelText('Anteckning, valfri'), { target: { value: '' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Spara uppgift' }));
  await waitFor(() => assert.ok(requests.some((r) => r.method === 'PATCH')));
  assert.equal(requests.find((r) => r.method === 'PATCH').body.note, null);
});
