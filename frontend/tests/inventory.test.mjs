import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Inventory, auth, offline, render, cleanup, fireEvent, waitFor, within;
let QueryClient, QueryClientProvider, MemoryRouter;
const clients = [];
const originalFetch = globalThis.fetch;
const stock = { id: 'item', articleId: 'article', unit: 'm', shelf: 'A1', revision: 1, balance: 10, article: { id: 'article', name: 'TEST Rörskål 22-30', articleNumber: '123', active: true, unit: 'm' } };
before(async () => {
  dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ render, cleanup, fireEvent, waitFor, within } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ MemoryRouter } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Inventory } = await vite.ssrLoadModule('/src/pages/Inventory.tsx'));
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
  offline = await vite.ssrLoadModule('/src/stores/offlineStore.ts');
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); globalThis.fetch = originalFetch; localStorage.clear(); });
after(async () => { await vite.close(); dom.window.close(); });
function setup({ role = 'EMPLOYEE', items = [stock], path = '/inventory?item=item', online = true, failFirst = false, failureStatus = 500, history = [] } = {}) {
  auth.useAuthStore.setState({ token: 'test', user: { id: 'u1', role } });
  offline.useOfflineStore.setState({ isOnline: online });
  const requests = [];
  let attempts = 0;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost');
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path: parsed.pathname, method, body });
    let data;
    if (parsed.pathname === '/api/inventory/items') data = items;
    else if (parsed.pathname.endsWith('/history')) data = { items: history, total: history.length, page: 1 };
    else if (parsed.pathname === '/api/projects/options') data = [{ id: 'p1', code: '0042', name: 'TEST Projekt' }];
    else if (parsed.pathname.endsWith('/movements')) {
      attempts++;
      if (failFirst && attempts === 1) return Response.json({ error: 'Testfel' }, { status: failureStatus });
      data = { id: 'movement' };
    } else throw new Error(`Unexpected ${method} ${parsed.pathname}`);
    return Response.json(data);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Inventory))));
  return { view, requests };
}
test('new warehouse is empty and never auto-imports material or starting balances', async () => {
  const { view, requests } = setup({ role: 'ADMIN', items: [], path: '/inventory' });
  await view.findByText('Lagret är tomt');
  assert.equal(requests.some((request) => request.method !== 'GET'), false);
  assert.equal(requests.some((request) => request.path.includes('/materials')), false);
});
test('employee can issue but cannot receive, inventory or edit shelf', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: 'Ta ut till projekt' }));
  assert.equal(view.queryByRole('button', { name: 'Inleverans' }), null);
  assert.equal(view.queryByRole('button', { name: 'Inventera' }), null);
  assert.equal(view.queryByRole('button', { name: 'Ändra hyllplats' }), null);
  const dialog = within(view.getByRole('dialog'));
  const picker = dialog.getByRole('combobox', { name: 'Projekt' });
  fireEvent.change(picker, { target: { value: '0042' } });
  fireEvent.click(await dialog.findByRole('option'));
  fireEvent.change(dialog.getByLabelText('Mängd (m)'), { target: { value: '2,5' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Registrera' }));
  await waitFor(() => assert.equal(requests.filter((request) => request.method === 'POST').length, 1));
  const payload = requests.find((request) => request.method === 'POST').body;
  assert.equal(payload.projectId, 'p1');
  assert.equal(payload.quantity, 2.5);
  assert.equal(payload.kind, 'ISSUE');
  assert.equal(payload.revision, 1);
});
test('count needs a reason and allows a counted quantity of zero', async () => {
  const { view, requests } = setup({ role: 'ADMIN' });
  fireEvent.click(await view.findByRole('button', { name: 'Inventera' }));
  const dialog = within(view.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Räknad mängd (m)'), { target: { value: '0' } });
  assert.equal(dialog.getByRole('button', { name: 'Registrera' }).disabled, true);
  fireEvent.change(dialog.getByLabelText('Orsak (obligatorisk)'), { target: { value: 'Kontrollräknat' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Registrera' }));
  await waitFor(() => assert.equal(requests.filter((request) => request.method === 'POST').length, 1));
  assert.equal(requests.find((request) => request.method === 'POST').body.quantity, 0);
});
test('uncertain response preserves the same key and payload through close and resume', async () => {
  const { view, requests } = setup({ role: 'ADMIN', failFirst: true });
  fireEvent.click(await view.findByRole('button', { name: 'Inleverans' }));
  let dialog = within(view.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Mängd (m)'), { target: { value: '2' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Registrera' }));
  await dialog.findByRole('alert');
  const stored = JSON.parse(localStorage.getItem('tidapp-inventory-pending:u1'));
  assert.equal(stored.input.quantity, 2);
  fireEvent.click(dialog.getByRole('button', { name: 'Stäng', exact: true }));
  fireEvent.click(view.getByRole('button', { name: 'Återuppta registrering' }));
  dialog = within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Bekräfta registreringen' }));
  await waitFor(() => assert.equal(requests.filter((request) => request.method === 'POST').length, 2));
  const posts = requests.filter((request) => request.method === 'POST');
  assert.deepEqual(posts[0].body, posts[1].body);
  await waitFor(() => assert.equal(localStorage.getItem('tidapp-inventory-pending:u1'), null));
});
test('offline prevents stock writes instead of queueing stale quantities', async () => {
  const { view } = setup({ role: 'ADMIN', online: false });
  assert.equal((await view.findByRole('button', { name: 'Ta ut till projekt' })).disabled, true);
  assert.equal(view.getByRole('button', { name: 'Inleverans' }).disabled, true);
});

test('409 clears pending data, refreshes stock and blocks resending the stale request', async () => {
  const { view, requests } = setup({ role: 'ADMIN', failFirst: true, failureStatus: 409 });
  fireEvent.click(await view.findByRole('button', { name: 'Inleverans' }));
  const dialog = within(view.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Mängd (m)'), { target: { value: '2' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Registrera' }));
  await dialog.findByRole('alert');
  assert.equal(localStorage.getItem('tidapp-inventory-pending:u1'), null);
  assert.equal(dialog.getByRole('button', { name: 'Registrera' }).disabled, true);
  await waitFor(() => assert.ok(requests.filter((r) => r.path === '/api/inventory/items').length >= 2));
  fireEvent.click(dialog.getByRole('button', { name: 'Registrera' }));
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1);
});

test('history renders the Swedish date and time rather than the UTC calendar day', async () => {
  const { view } = setup({ history: [{ id: 'movement', kind: 'ISSUE', quantityDelta: -2, balanceAfter: 8, unit: 'm', createdAt: '2026-10-12T22:30:00Z', createdByUser: { name: 'TEST' }, returnableQuantity: 0 }] });
  await view.findByText(/2026-10-13 00:30/);
});
