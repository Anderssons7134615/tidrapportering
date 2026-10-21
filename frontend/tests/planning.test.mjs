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
function setup({ role = 'ADMIN', empty = false, failSave = false, failComment = false, failLoad = false } = {}) {
  auth.useAuthStore.setState({ token: 'synthetic-test', user: { id: 'u1', companyId: 'a', role, name: 'Testperson' } });
  let board = empty ? null : { id: 'p1', document: structuredClone(documentFixture), revision: 1, updatedAt: '2026-10-21T10:00:00Z' }, comments = [], requests = [], commentAttempts = 0;
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
