import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

let dom, vite, appRoutes, render, cleanup;
const routers = [];
before(async () => {
  dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  ({ render, cleanup } = await import('@testing-library/react'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ appRoutes } = await vite.ssrLoadModule('/src/appRoutes.tsx'));
});
afterEach(() => { cleanup(); routers.splice(0).forEach((router) => router.dispose()); });
after(async () => { await vite.close(); dom.window.close(); });

for (const message of [
  'Failed to fetch dynamically imported module: https://tid.anderssonsisolering.se/assets/Projects-yjMYxbnR.js',
  'error loading dynamically imported module',
  'Importing a module script failed.',
  'Unexpected render failure',
]) {
  test(`route recovery handles ${message}`, async () => {
    const Page = React.lazy(() => Promise.reject(new TypeError(message)));
    const router = createMemoryRouter(appRoutes(React.createElement(React.Suspense, { fallback: 'Laddar' }, React.createElement(Page))), { initialEntries: ['/projects?customer=123'] });
    routers.push(router);
    localStorageSentinel();
    const view = render(React.createElement(RouterProvider, { router }));
    assert.ok(await view.findByRole('heading', { name: 'Sidan kunde inte visas' }));
    assert.ok(view.getByRole('button', { name: 'Ladda om sidan' }));
    assert.equal(view.queryByText('Unexpected Application Error!'), null);
    assert.equal(view.container.textContent.includes(message), false);
    assert.equal(router.state.location.pathname, '/projects');
    assert.equal(router.state.location.search, '?customer=123');
    assert.equal(window.localStorage.getItem('pending-offline-test'), 'preserve-me');
    assert.match(view.getByRole('alert').textContent, message === 'Unexpected render failure' ? /Ett oväntat fel/ : /En del av appen kunde inte hämtas/);
  });
}

function localStorageSentinel() {
  window.localStorage.setItem('pending-offline-test', 'preserve-me');
}

test('production router uses the tested root routes', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /createBrowserRouter\(appRoutes\(<App \/>\)\)/);
});
