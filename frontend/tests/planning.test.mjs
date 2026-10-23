import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Planning, auth, render, cleanup, fireEvent, waitFor, act, within, QueryClient, QueryClientProvider, createMemoryRouter, RouterProvider;
const clients = [], originalFetch = globalThis.fetch;
const documentFixture = { weeks: [{ startDate: '2026-10-26', note: 'Preliminärt', people: [{ name: 'Testperson', days: ['Jobb A','Jobb B','','',''] }] }], jobs: [{ name: 'Jobb A', details: 'Två dagar', deadline: 'V44' }], issues: 'Behöver bemanning' };
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage, FormData: dom.window.FormData });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ render, cleanup, fireEvent, waitFor, act, within } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ createMemoryRouter, RouterProvider } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Planning } = await vite.ssrLoadModule('/src/pages/Planning.tsx'));
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); globalThis.fetch = originalFetch; });
after(async () => { await vite?.close(); dom?.window.close(); });
function setup({ role = 'ADMIN', empty = false, failSave = false, failComment = false, failLoad = false, initialDocument = documentFixture } = {}) {
  auth.useAuthStore.setState({ token: 'synthetic-test', user: { id: 'u1', companyId: 'a', role, name: 'Testperson' } });
  let board = empty ? null : { id: 'p1', document: structuredClone(initialDocument), revision: 1, updatedAt: '2026-10-21T10:00:00Z' }, comments = [], requests = [], commentAttempts = 0;
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url, 'http://localhost').pathname, method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path, method, body });
    if (path.endsWith('/planning') && method === 'GET') return failLoad ? Response.json({ error: 'Testfel' }, { status: 503 }) : Response.json(board);
    if (path.endsWith('/planning') && method === 'PUT') {
      if (failSave) return Response.json({ error: 'Planeringen har ändrats' }, { status: 409 });
      board = { id: 'p1', document: body.document, revision: (board?.revision || 0) + 1, updatedAt: '2026-10-21T11:00:00Z' };
      return Response.json(board);
    }
    if (path.endsWith('/comments') && method === 'GET') return Response.json({ items: comments, hasMore: false });
    if (path.endsWith('/comments') && method === 'POST') {
      if (failComment && commentAttempts++ === 0) return Response.json({ error: 'Tillfälligt fel' }, { status: 503 });
      const c = { id: 'c1', content: body.content, author: { id: 'u1', name: 'Testperson' }, createdAt: '2026-10-21T11:00:00Z' }; comments.push(c); return Response.json(c);
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } }); clients.push(cache);
  const router = createMemoryRouter([{ path: '/planning', element: React.createElement(Planning) }, { path: '/elsewhere', element: React.createElement('p', null, 'Annan sida') }], { initialEntries: ['/planning'] });
  return { view: render(React.createElement(QueryClientProvider, { client: cache }, React.createElement(RouterProvider, { router }))), router, requests };
}
test('employee and supervisor read the plan and post advice; retry uses the same request key', async () => {
  for (const role of ['EMPLOYEE', 'SUPERVISOR']) {
    const { view, requests } = setup({ role, failComment: true });
    await view.findByText('Behöver bemanning');
    assert.equal(view.queryByRole('button', { name: 'Redigera planering' }), null);
    assert.equal(view.queryByLabelText('Dag att planera'), null);
    const field = view.getByLabelText('Din kommentar');
    fireEvent.change(field, { target: { value: 'Kan hjälpa på torsdag' } });
    fireEvent.click(view.getByRole('button', { name: 'Publicera kommentar' }));
    await view.findByRole('alert'); assert.equal(field.value, 'Kan hjälpa på torsdag');
    fireEvent.click(view.getByRole('button', { name: 'Publicera kommentar' }));
    await view.findByText('Din kommentar är publicerad.');
    await view.findByText('Kan hjälpa på torsdag');
    assert.equal(field.value, '');
    const posts = requests.filter(r => r.method === 'POST'); assert.equal(posts.length, 2); assert.equal(posts[0].body.requestKey, posts[1].body.requestKey);
    assert.equal(requests.some(r => r.method === 'PUT'), false); cleanup();
  }
});
test('admin edits a weekday and saves the expected revision', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Testperson måndag'), { target: { value: 'Nytt jobb' } });
  fireEvent.click(view.getByRole('button', { name: 'Spara planering' }));
  await view.findByText('Planeringen är sparad och synlig för personalen.');
  await view.findByText('Nytt jobb');
  const put = requests.find(r => r.method === 'PUT'); assert.equal(put.body.expectedRevision, 1); assert.equal(put.body.document.weeks[0].people[0].days[0], 'Nytt jobb');
});
function dragData() {
  const values = new Map();
  return { setData: (type, value) => values.set(type, value), getData: type => values.get(type) || '', get types() { return [...values.keys()]; }, effectAllowed: '' };
}

test('dragging assigns only the chosen person, weekday and week and saves explicitly', async () => {
  const initialDocument = structuredClone(documentFixture);
  initialDocument.weeks.push({ startDate: '2026-11-02', note: 'Nästa vecka', people: [{ name: 'Testperson', days: ['Annat','','','',''] }] });
  const { view, requests } = setup({ initialDocument });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Vecka'), { target: { value: '2026-10-26' } });
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '2' } });
  const dataTransfer = dragData();
  fireEvent.dragStart(view.getByRole('button', { name: 'Välj Testperson' }), { dataTransfer });
  fireEvent.drop(view.getByRole('region', { name: 'Jobb Jobb A' }), { dataTransfer });
  assert.equal(view.getByLabelText('Testperson onsdag').value, 'Jobb A');
  assert.equal(requests.some(r => r.method === 'PUT'), false);
  fireEvent.click(view.getByRole('button', { name: 'Spara planering' }));
  await view.findByText('Planeringen är sparad och synlig för personalen.');
  const expected = structuredClone(initialDocument);
  expected.weeks[0].people[0].days[2] = 'Jobb A';
  const put = requests.find(r => r.method === 'PUT');
  assert.equal(put.body.expectedRevision, 1);
  assert.deepEqual(put.body.document, expected);
});

test('touch and keyboard controls assign the selected day without dragging or auto-saving', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '4' } });
  fireEvent.click(view.getByRole('button', { name: 'Välj Testperson' }));
  fireEvent.change(view.getByLabelText('Jobb att tilldela'), { target: { value: '0' } });
  fireEvent.click(view.getByRole('button', { name: 'Tilldela vald dag' }));
  assert.equal(view.getByLabelText('Testperson fredag').value, 'Jobb A');
  assert.equal(view.getByLabelText('Testperson tisdag').value, 'Jobb B');
  assert.equal(requests.some(r => r.method === 'PUT'), false);
  await view.findByText(/Testperson.*Jobb A.*fredag.*inte sparad/);
});

test('replacing existing day text requires confirmation and cancellation preserves it', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '1' } });
  const drop = () => {
    const dataTransfer = dragData();
    fireEvent.dragStart(view.getByRole('button', { name: 'Välj Testperson' }), { dataTransfer });
    fireEvent.drop(view.getByRole('region', { name: 'Jobb Jobb A' }), { dataTransfer });
  };
  drop();
  const dialog = view.getByRole('dialog', { name: 'Ändra planering för Testperson?' });
  assert.match(dialog.textContent, /Jobb B/);
  assert.match(dialog.textContent, /tisdag/);
  assert.equal(view.getByLabelText('Testperson tisdag').value, 'Jobb B');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }));
  assert.equal(view.getByLabelText('Testperson tisdag').value, 'Jobb B');
  drop();
  fireEvent.click(within(view.getByRole('dialog', { name: 'Ändra planering för Testperson?' })).getByRole('button', { name: 'Byt jobb' }));
  assert.equal(view.getByLabelText('Testperson tisdag').value, 'Jobb A');
  assert.equal(requests.some(r => r.method === 'PUT'), false);
});

test('external drag data cannot change the planning document', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '2' } });
  const dataTransfer = dragData();
  dataTransfer.setData('application/x-tidapp-planning-person', '0');
  fireEvent.drop(view.getByRole('region', { name: 'Jobb Jobb A' }), { dataTransfer });
  assert.equal(view.getByLabelText('Testperson onsdag').value, '');
  assert.equal(requests.some(r => r.method === 'PUT'), false);
});

for (const changed of ['weekday', 'week', 'person removal', 'job rename']) {
  test(`stale drag after ${changed} never changes another planning cell`, async () => {
    const initialDocument = structuredClone(documentFixture);
    initialDocument.weeks[0].people.push({ name: 'Testperson', days: ['', '', '', '', ''] });
    initialDocument.weeks.push({ startDate: '2026-11-02', note: '', people: [{ name: 'Testperson', days: ['', '', '', '', ''] }] });
    const { view, requests } = setup({ initialDocument });
    fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
    fireEvent.change(view.getByLabelText('Vecka'), { target: { value: '2026-10-26' } });
    fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '2' } });
    const dataTransfer = dragData();
    fireEvent.dragStart(view.getAllByRole('button', { name: 'Välj Testperson' })[0], { dataTransfer });
    if (changed === 'weekday') fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '3' } });
    if (changed === 'week') fireEvent.change(view.getByLabelText('Vecka'), { target: { value: '2026-11-02' } });
    if (changed === 'person removal') fireEvent.click(view.getAllByRole('button', { name: 'Ta bort rad' })[0]);
    if (changed === 'job rename') fireEvent.change(view.getByLabelText('Jobb / beställare'), { target: { value: 'Nytt jobb' } });
    fireEvent.drop(view.getByRole('region', { name: changed === 'job rename' ? 'Jobb Nytt jobb' : 'Jobb Jobb A' }), { dataTransfer });
    assert.ok(view.getAllByLabelText('Testperson onsdag').every(field => field.value === ''));
    assert.equal(view.queryByRole('dialog', { name: 'Ändra planering för Testperson?' }), null);
    assert.equal(requests.some(r => r.method === 'PUT'), false);
  });
}

test('duplicate job names block ambiguous assignments and explain how to fix them', async () => {
  const initialDocument = structuredClone(documentFixture);
  initialDocument.jobs.push({ ...initialDocument.jobs[0], details: 'Annat jobb med samma namn' });
  const { view } = setup({ initialDocument });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '2' } });
  const dataTransfer = dragData();
  fireEvent.dragStart(view.getByRole('button', { name: 'Välj Testperson' }), { dataTransfer });
  fireEvent.drop(view.getAllByRole('region', { name: 'Jobb Jobb A' })[0], { dataTransfer });
  assert.equal(view.getByLabelText('Testperson onsdag').value, '');
  assert.ok(view.getAllByText('Ge jobben olika namn innan du tilldelar personal.').length > 0);
});

test('unnamed jobs are not shown as assignments for people with an empty day', async () => {
  const initialDocument = structuredClone(documentFixture);
  initialDocument.jobs.push({ name: '', details: '', deadline: '' });
  const { view } = setup({ initialDocument });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '2' } });
  const unnamed = view.getByRole('region', { name: 'Jobb' });
  assert.equal(Boolean(within(unnamed).queryByText('Testperson')), false);
  const dataTransfer = dragData();
  fireEvent.dragStart(view.getByRole('button', { name: 'Välj Testperson' }), { dataTransfer });
  fireEvent.drop(unnamed, { dataTransfer });
  assert.equal(view.getByLabelText('Testperson onsdag').value, '');
});

test('saving disables assignment controls and ignores an in-flight drag', async () => {
  const { view } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Dag att planera'), { target: { value: '2' } });
  const dataTransfer = dragData();
  fireEvent.dragStart(view.getByRole('button', { name: 'Välj Testperson' }), { dataTransfer });
  const fetch = globalThis.fetch;
  let release;
  globalThis.fetch = (url, options = {}) => options.method === 'PUT'
    ? new Promise(resolve => { release = () => resolve(fetch(url, options)); }) : fetch(url, options);
  fireEvent.click(view.getByRole('button', { name: 'Spara planering' }));
  await waitFor(() => assert.equal(view.getByRole('button', { name: 'Välj Testperson' }).disabled, true));
  assert.equal(view.getByRole('button', { name: 'Välj Testperson' }).draggable, false);
  fireEvent.drop(view.getByRole('region', { name: 'Jobb Jobb A' }), { dataTransfer });
  assert.equal(view.getByLabelText('Testperson onsdag').value, '');
  await waitFor(() => assert.equal(typeof release, 'function'));
  release();
  await view.findByText('Planeringen är sparad och synlig för personalen.');
});

test('a name already placed on a job can be dragged directly to another job', async () => {
  const initialDocument = structuredClone(documentFixture);
  initialDocument.jobs.push({ name: 'Jobb B', details: '', deadline: '' });
  const { view } = setup({ initialDocument });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  const dataTransfer = dragData();
  fireEvent.dragStart(view.getByRole('button', { name: 'Flytta Testperson från Jobb A' }), { dataTransfer });
  fireEvent.dragOver(view.getByRole('region', { name: 'Jobb Jobb B' }), { dataTransfer });
  fireEvent.drop(view.getByRole('region', { name: 'Jobb Jobb B' }), { dataTransfer });
  fireEvent.click(within(view.getByRole('dialog', { name: 'Ändra planering för Testperson?' })).getByRole('button', { name: 'Byt jobb' }));
  assert.equal(view.getByLabelText('Testperson måndag').value, 'Jobb B');
});

test('dropping a person onto their existing job changes nothing and needs no confirmation', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  const dataTransfer = dragData();
  fireEvent.dragStart(view.getByRole('button', { name: 'Välj Testperson' }), { dataTransfer });
  fireEvent.drop(view.getByRole('region', { name: 'Jobb Jobb A' }), { dataTransfer });
  assert.equal(view.getByLabelText('Testperson måndag').value, 'Jobb A');
  assert.equal(Boolean(view.queryByRole('dialog', { name: 'Ändra planering för Testperson?' })), false);
  await view.findByText(/Ingen ändring gjord/);
  assert.equal(requests.some(r => r.method === 'PUT'), false);
});

test('confirmed keyboard assignment returns focus to the person instead of the disabled action', async () => {
  const initialDocument = structuredClone(documentFixture);
  initialDocument.jobs.push({ name: 'Jobb B', details: '', deadline: '' });
  const { view } = setup({ initialDocument });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.click(view.getByRole('button', { name: 'Välj Testperson' }));
  fireEvent.change(view.getByLabelText('Jobb att tilldela'), { target: { value: '1' } });
  const assign = view.getByRole('button', { name: 'Tilldela vald dag' });
  assign.focus();
  fireEvent.click(assign);
  fireEvent.click(within(view.getByRole('dialog', { name: 'Ändra planering för Testperson?' })).getByRole('button', { name: 'Byt jobb' }));
  assert.equal(view.getByLabelText('Testperson måndag').value, 'Jobb B');
  assert.equal(document.activeElement.getAttribute('aria-label'), 'Välj Testperson');
});

test('conflicting save retains draft and navigation requires a decision', async () => {
  const { view, router } = setup({ failSave: true });
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.change(view.getByLabelText('Testperson måndag'), { target: { value: 'Bevara mig' } });
  fireEvent.click(view.getByRole('button', { name: 'Spara planering' }));
  await view.findByRole('alert'); assert.equal(view.getByLabelText('Testperson måndag').value, 'Bevara mig');
  await act(async () => router.navigate('/elsewhere'));
  await view.findByRole('dialog'); assert.equal(router.state.location.pathname, '/planning');
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Avbryt', exact: true }));
  await waitFor(() => assert.equal(view.queryByRole('dialog'), null));
  assert.equal(view.getByLabelText('Testperson måndag').value, 'Bevara mig');
});
test('empty plan and fetch failure do not pretend a plan is published', async () => {
  const empty = setup({ role: 'EMPLOYEE', empty: true }); await empty.view.findByText('Ingen planering publicerad ännu'); assert.equal(empty.view.queryByLabelText('Din kommentar'), null); cleanup();
  const failed = setup({ failLoad: true }); await failed.view.findByText('Planeringen kunde inte hämtas'); assert.equal(failed.view.queryByRole('button', { name: 'Skapa planering' }), null);
});

test('empty names identify the exact person or job and never send invalid saves', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Redigera planering' }));
  fireEvent.click(view.getByRole('button', { name: 'Lägg till person' }));
  fireEvent.click(view.getByRole('button', { name: 'Spara planering' }));
  await view.findByText(/Ange personens namn på rad 2 i V44/);
  assert.equal(requests.some(r => r.method === 'PUT'), false);
  fireEvent.change(view.getByLabelText('Namn på rad 2'), { target: { value: 'Ny person' } });
  fireEvent.click(view.getByRole('button', { name: 'Lägg till jobb' }));
  fireEvent.click(view.getByRole('button', { name: 'Spara planering' }));
  await view.findByText(/Ange namnet för jobb 2 under Jobb/);
  assert.equal(requests.some(r => r.method === 'PUT'), false);
});

test('an unsent employee comment survives cancelled navigation and warns before reload', async () => {
  const { view, router } = setup({ role: 'EMPLOYEE' });
  fireEvent.change(await view.findByLabelText('Din kommentar'), { target: { value: 'Mitt oskickade råd' } });
  const unload = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
  await act(async () => router.navigate('/elsewhere'));
  const dialog = await view.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }));
  await waitFor(() => assert.equal(view.queryByRole('dialog'), null));
  assert.equal(view.getByLabelText('Din kommentar').value, 'Mitt oskickade råd');
  fireEvent.click(view.getByRole('button', { name: 'Publicera kommentar' }));
  await view.findByText('Din kommentar är publicerad.');
  await act(async () => router.navigate('/elsewhere'));
  await view.findByText('Annan sida');
});
