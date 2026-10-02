import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Detail, Economy, auth, cleanup, fireEvent, render, waitFor, within, act;
let QueryClient, QueryClientProvider, MemoryRouter, Routes, Route;
let clients = [], requests = [];
const originalFetch = globalThis.fetch;
const project = { id: 'p1', code: '0042', name: 'Testprojekt', active: true, status: 'ONGOING', billingModel: 'HOURLY', budgetHours: 0, defaultRate: 600, hoursVisibleToCurrentUser: true, financialsVisibleToCurrentUser: true, metrics: { totalHours: 12, budgetUsagePercent: null } };
const summary = { totals: { totalHours: 8, laborCost: null, materialCost: 100, revenue: 5000, result: null }, warnings: ['Timkostnad saknas'], byUser: [], recentEntries: [] };
const article = { id: 'a1', name: 'Rörskål', articleNumber: '123', unit: 'm', category: 'Isolering', active: true };

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, FormData: dom.window.FormData, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  ({ cleanup, fireEvent, render, waitFor, within, act } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ MemoryRouter, Routes, Route } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Detail } = await vite.ssrLoadModule('/src/pages/ProjectDetail.tsx'));
  ({ default: Economy } = await vite.ssrLoadModule('/src/pages/ProjectEconomy.tsx'));
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); clients = []; requests = []; globalThis.fetch = originalFetch; });
after(async () => { await vite?.close(); dom?.window.close(); });

function setup({ role = 'ADMIN', handler, economy, initialPath = '/projects/p1' } = {}) {
  auth.useAuthStore.setState({ token: 'test-token', user: { id: 'u1', name: 'Test', role } });
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const method = options.method || 'GET';
    requests.push({ path, method });
    const override = await handler?.(path, method);
    if (override instanceof Response) return override;
    const data = override ?? ({
      '/api/projects/p1': role === 'EMPLOYEE' ? { ...project, financialsVisibleToCurrentUser: false, hoursVisibleToCurrentUser: false } : project,
      '/api/projects/p1/summary': role === 'EMPLOYEE' ? { ...summary, totals: {}, warnings: [] } : summary,
      '/api/projects/p1/time-entries': [],
      '/api/projects/p1/materials': { items: [], totals: { quantity: 0, amount: 0 } },
      '/api/projects/materials/articles': [article],
      '/api/projects/p1/updates': [],
      '/api/project-portfolio': economy,
    })[path];
    assert.notEqual(data, undefined, `Unexpected request ${method} ${path}`);
    return Response.json(data);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [economy ? '/economy' : initialPath] }, React.createElement(Routes, null, React.createElement(Route, { path: economy ? '/economy' : '/projects/:id', element: React.createElement(economy ? Economy : Detail) })))));
  return { client, view };
}

test('project loads only its overview, then loads the selected tab and recovers from failure', async () => {
  let releaseSummary, releaseHours;
  const { view } = setup({ handler: async (path) => {
    if (path.endsWith('/summary')) return new Promise((resolve) => { releaseSummary = resolve; });
    if (path.endsWith('/time-entries') && requests.filter((r) => r.path === path).length === 1) return new Promise((resolve) => { releaseHours = resolve; });
  } });
  await view.findByText('Laddar sammanställning…');
  assert.equal(view.queryByText('Inga varningar'), null);
  assert.equal(view.queryByText('Ingen attesterad tid att visa'), null);
  assert.deepEqual(requests.map((r) => r.path).sort(), ['/api/projects/p1', '/api/projects/p1/summary']);
  await act(async () => releaseSummary(summary));
  await view.findByText('Timkostnad saknas');
  assert.ok(view.getByText('0 h budget'));
  assert.ok(view.getByText('12 h rapporterat av 0 h'));
  fireEvent.click(view.getByRole('tab', { name: 'Tid', exact: true }));
  await view.findByText('Laddar tidrader…');
  assert.equal(view.queryByText('Inga tidrader att visa'), null);
  await act(async () => releaseHours(Response.json({ error: 'Testfel' }, { status: 503 })));
  await view.findByRole('alert');
  fireEvent.click(view.getByRole('button', { name: 'Försök igen' }));
  await waitFor(() => assert.equal(requests.filter((r) => r.path.endsWith('/time-entries')).length, 2));
  await view.findByText('Inga tidrader att visa');
  assert.equal(requests.some((r) => /materials|material-articles|manager-summary|updates/.test(r.path)), false);
  // The overview refetch triggered by Retry also needs its response released.
  await act(async () => releaseSummary(summary));
});

test('employee cannot open economy or trigger project time requests through tabs', async () => {
  const { view } = setup({ role: 'EMPLOYEE', initialPath: '/projects/p1?tab=purchases' });
  await view.findByRole('heading', { name: 'Testprojekt' });
  assert.equal(view.queryByRole('tab', { name: 'Ekonomi' }), null);
  assert.equal(view.queryByRole('tab', { name: 'Inköp' }), null);
  assert.equal(view.getByRole('tab', { name: 'Översikt' }).getAttribute('aria-selected'), 'true');
  assert.equal(requests.some((request) => request.path.includes('supplier-invoices')), false);
  fireEvent.click(view.getByRole('tab', { name: 'Tid', exact: true }));
  await view.findByText('Projekttimmar är dolda');
  assert.equal(requests.some((r) => /time-entries|manager-summary/.test(r.path)), false);
});

test('saving project material refreshes every cached project economy', async () => {
  const { view, client } = setup();
  const keys = [['project-portfolio'], ['project-control', 'other-filter'], ['project', 'other-project'], ['dashboard']];
  keys.forEach((key) => client.setQueryData(key, { old: true }));
  fireEvent.click(await view.findByRole('tab', { name: 'Material', exact: true }));
  fireEvent.change(await view.findByRole('combobox'), { target: { value: 'Rörskål' } });
  fireEvent.click(await view.findByRole('option', { name: /Rörskål/ }));
  fireEvent.change(view.getByLabelText('Antal (m)'), { target: { value: '5' } });
  fireEvent.click(view.getByRole('button', { name: 'Lägg till', exact: true }));
  await waitFor(() => assert.ok(requests.some((r) => r.path.endsWith('/materials') && r.method === 'POST')));
  await waitFor(() => keys.forEach((key) => assert.equal(client.getQueryState(key)?.isInvalidated, true, key.join('/'))));
});

test('confirmed purchases show signed ore separately for managers and stay hidden from accountants', async () => {
  const economy = [{ project, reportedHours: 0, approvedHours: 0, unapprovedHours: 0, laborCost: 0, materialCost: 0, revenue: 0, result: 0, billingModel: 'HOURLY', warnings: [], confirmedPurchaseNetOre: -12345 }];
  const { view } = setup({ economy });
  const link = await view.findByRole('link', { name: /Bekräftade inköp, exkl. moms:/ });
  assert.match(link.textContent, /123,45/);
  assert.match(link.textContent, /[−-]/);
  assert.equal(link.getAttribute('href'), '/projects/p1?tab=purchases');
  cleanup();
  const accountant = setup({ economy, role: 'ACCOUNTANT' });
  await accountant.view.findByRole('article');
  assert.equal(accountant.view.queryByText(/Bekräftade inköp/), null);
});

test('missing costs keep the portfolio result unknown and filters recompute the selection', async () => {
  const base = { reportedHours: 8, approvedHours: 8, unapprovedHours: 0, laborCost: 100, materialCost: 100, revenue: 500, result: 300, billingModel: 'HOURLY', warnings: [], confirmedPurchaseNetOre: 0 };
  const { view } = setup({ economy: [{ ...base, project }, { ...base, project: { ...project, id: 'p2', code: '0043', name: 'Utan kostnad' }, laborCost: null, result: null, warnings: ['Timkostnad saknas'] }] });
  await view.findByText('2 projekt i urvalet');
  const incomplete = view.getByRole('article', { name: '0043 · Utan kostnad' });
  assert.equal(within(incomplete).getAllByText('Underlag saknas').length, 2);
  assert.match(view.container.textContent, /beräknat resultat · Underlag saknas/);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Testprojekt' } });
  await view.findByText('1 projekt i urvalet');
  assert.doesNotMatch(view.container.textContent, /Underlag saknas/);
  assert.equal(view.queryByRole('article', { name: '0043 · Utan kostnad' }), null);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Saknat projekt' } });
  await view.findByText('Inga projekt matchar sökningen');
  assert.match(view.container.textContent, /- beräknat resultat/);
  assert.doesNotMatch(view.container.textContent, /Underlag saknas/);
});
