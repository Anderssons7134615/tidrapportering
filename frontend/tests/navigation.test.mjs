import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Layout, nav, auth, offline, render, cleanup, fireEvent, waitFor, within, act;
let QueryClient, QueryClientProvider, createMemoryRouter, RouterProvider;
const clients = [], mediaListeners = new Set();
let desktopMatches = false;
const originalFetch = globalThis.fetch;
before(async () => {
  dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  window.matchMedia = (query) => ({ get matches() { return query === '(min-width: 1024px)' && desktopMatches; }, media: query, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) });
  ({ render, cleanup, fireEvent, waitFor, within, act } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ createMemoryRouter, RouterProvider } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Layout } = await vite.ssrLoadModule('/src/components/Layout.tsx'));
  nav = await vite.ssrLoadModule('/src/utils/navigation.ts');
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
  offline = await vite.ssrLoadModule('/src/stores/offlineStore.ts');
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); globalThis.fetch = originalFetch; document.body.style.overflow = ''; desktopMatches = false; });
after(async () => { await vite.close(); dom.window.close(); });

function setup({ role = 'ADMIN', path = '/projects', pending = [] } = {}) {
  const user = { id: 'u1', name: 'Testperson', companyName: 'Anderssons Isolering', role };
  auth.useAuthStore.setState({ token: 'synthetic-test', user });
  offline.useOfflineStore.setState({ pendingEntries: pending, isOnline: false });
  globalThis.fetch = async () => { throw new Error('Unexpected network request in navigation test'); };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(['auth', 'me'], user); clients.push(client);
  const router = createMemoryRouter([{ element: React.createElement(Layout), children: [{ path: '*', element: React.createElement('h1', null, 'Testvy') }] }], { initialEntries: [path] });
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(RouterProvider, { router })));
  return { view, router, sidebar: view.container.querySelector('aside:not([role])'), drawer: view.container.querySelector('#mobile-navigation') };
}

test('navigation keeps the exact role boundaries and manager purchases on mobile', () => {
  const expectations = {
    ADMIN: ['/projects', '/purchases', '/project-economy', '/time-overview', '/time-entry', '/week', '/team-week', '/approval', '/reports', '/customers', '/materials', '/activities', '/users', '/settings'],
    SUPERVISOR: ['/projects', '/purchases', '/project-economy', '/time-overview', '/time-entry', '/week', '/team-week', '/approval', '/reports', '/customers', '/materials', '/settings'],
    EMPLOYEE: ['/projects', '/', '/time-entry', '/week', '/settings'],
    ACCOUNTANT: ['/project-economy', '/reports', '/settings'],
  };
  for (const [role, expected] of Object.entries(expectations)) {
    const { view, sidebar, drawer } = setup({ role });
    assert.deepEqual([...sidebar.querySelectorAll('nav a')].map((link) => link.getAttribute('href')), expected);
    assert.deepEqual([...drawer.querySelectorAll('nav a')].map((link) => link.getAttribute('href')), expected);
    const mobile = within(view.getByRole('navigation', { name: 'Snabbnavigation' })).getAllByRole('link').map((link) => link.getAttribute('href'));
    assert.deepEqual(mobile, role === 'EMPLOYEE' ? ['/', '/week', '/time-entry', '/projects', '/settings'] : role === 'ACCOUNTANT' ? ['/reports', '/project-economy', '/settings'] : ['/projects', '/purchases', '/time-entry', '/approval', '/project-economy']);
    cleanup();
  }
});

test('only the current destination is active, including detail routes and time overview aliases', () => {
  for (const [role, path, expected] of [['ADMIN', '/purchases/i1', '/purchases'], ['ADMIN', '/projects/p1?tab=purchases', '/projects'], ['EMPLOYEE', '/overview/details/hours', '/'], ['ADMIN', '/overview/details/hours', '/time-overview']]) {
    const { sidebar } = setup({ role, path });
    assert.deepEqual([...sidebar.querySelectorAll('[aria-current="page"]')].map((link) => link.getAttribute('href')), [expected]);
    assert.equal(sidebar.querySelector('a[href="/time-entry"]').classList.contains('side-nav-active'), false);
    cleanup();
  }
  assert.equal(nav.activeNavigationPath('/projects-unrelated', 'ADMIN'), undefined);
  assert.equal(nav.activeNavigationPath('/purchases/i1', 'EMPLOYEE'), undefined);
  assert.deepEqual(nav.navigationFor(undefined), { navigation: [], mobile: [] });
  assert.deepEqual(nav.navigationFor('UNKNOWN'), { navigation: [], mobile: [] });
});

test('mobile drawer isolates background, traps focus, restores scroll and closes on navigation', async () => {
  document.body.style.overflow = 'auto';
  const { view, drawer, router } = setup();
  const menu = view.getByRole('button', { name: 'Meny', exact: true });
  const mainWrapper = view.container.querySelector('main').parentElement;
  assert.equal(drawer.hasAttribute('inert'), true);
  menu.focus(); fireEvent.click(menu);
  assert.equal(mainWrapper.hasAttribute('inert'), true);
  assert.equal(document.body.style.overflow, 'hidden');
  const close = within(drawer).getByRole('button', { name: 'Stäng meny' });
  await waitFor(() => assert.equal(document.activeElement === close, true));
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement.textContent, 'Logga ut');
  fireEvent.keyDown(document, { key: 'Tab' });
  assert.equal(document.activeElement === close, true);
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(mainWrapper.hasAttribute('inert'), false);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(document.activeElement === menu, true);
  fireEvent.click(menu);
  fireEvent.click(within(drawer).getByRole('link', { name: 'Inköp' }));
  await waitFor(() => assert.equal(router.state.location.pathname, '/purchases'));
  assert.equal(drawer.hasAttribute('inert'), true);
  fireEvent.click(menu);
  await act(async () => { await router.navigate('/projects/p1'); });
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(document.body.style.overflow, 'auto');
});

test('switching to desktop closes the drawer and releases the page', () => {
  const { view, drawer } = setup();
  const menu = view.getByRole('button', { name: 'Meny', exact: true });
  fireEvent.click(menu);
  assert.equal(document.body.style.overflow, 'hidden');
  act(() => { desktopMatches = true; mediaListeners.forEach((listener) => listener()); });
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(drawer.hasAttribute('inert'), true);
  assert.equal(view.container.querySelector('main').parentElement.hasAttribute('inert'), false);
  assert.equal(document.activeElement, view.container.querySelector('main'));
  assert.equal(document.body.style.overflow, '');
});

test('offline rows remain owned, visible and inert behind the open drawer', () => {
  const own = { ownerUserId: 'u1', localId: 'local', syncError: 'Behöver kontrolleras', syncErrorCode: 'LEGACY_SYNC_REQUIRES_REVIEW' };
  const { view } = setup({ pending: [own, { ...own, ownerUserId: 'other', localId: 'other' }] });
  const alert = view.getByRole('alert');
  assert.match(alert.textContent, /1 offline-rad/);
  assert.ok(within(alert).getByRole('button', { name: 'Hämta sparade rader' }));
  fireEvent.click(view.getByRole('button', { name: 'Meny', exact: true }));
  assert.equal(alert.hasAttribute('inert'), true);
  cleanup();
  assert.equal(document.body.style.overflow, '');
  assert.equal(mediaListeners.size, 0);
});
