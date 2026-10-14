import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Editor, helpers, auth, cleanup, fireEvent, render, waitFor, within, act;
let QueryClient, QueryClientProvider, createMemoryRouter, RouterProvider;
let clients = [], requests = [], routers = [];
const originalFetch = globalThis.fetch;
const draftId = '15a4f36c-f7ab-4a78-8c4f-b030647df644';
const base = `/api/project-calculations/p1/editor/${draftId}`;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, FormData: dom.window.FormData, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  ({ cleanup, fireEvent, render, waitFor, within, act } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ createMemoryRouter, RouterProvider } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Editor } = await vite.ssrLoadModule('/src/pages/CalculationEditor.tsx'));
  helpers = await vite.ssrLoadModule('/src/utils/calculationEditor.ts');
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); routers.forEach(r => r.dispose()); clients = []; routers = []; requests = []; globalThis.fetch = originalFetch; });
after(async () => { await vite.close(); dom.window.close(); });
function preview(document, revision = 1) {
  return { fingerprint: 'a'.repeat(64), document: { ...document, id: `tidapp-${draftId}`, revision, status: 'draft', archived: false },
    totals: { materialCostWithWaste: 100, laborHours: 2, internalLaborCost: 626, directCost: 726, calculatedPrice: 1125 }, rows: document.lines.map(l => ({ id: l.id, laborHours: 2, materialCost: 100, calculatedPrice: 1125 })) };
}
function setup({ initial = null, copy = null, handler, missingPrice = false, projectRate = 500, customerRate = null, oldArticleCache = false } = {}) {
  let saved = initial;
  auth.useAuthStore.setState({ token: 'test-token', user: { id: 'u1', role: 'ADMIN' } });
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url, 'http://localhost').pathname, method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, method, body });
    const override = await handler?.(path, method, body);
    if (override) return override;
    if (path === '/api/projects/p1') return Response.json({ id: 'p1', code: 'TEST', name: 'Montage', active: true, defaultRate: projectRate, customer: { name: 'Testkund', defaultRate: customerRate } });
    if (path === '/api/projects/materials/articles') return Response.json([{ id: 'a1', name: 'Isolering', articleNumber: '123', unit: 'm²', purchasePrice: missingPrice ? null : 79, defaultUnitPrice: 999, priceSource: 'TEST prislista', active: true }]);
    if (path === '/api/project-calculations/p1/source') return Response.json(copy);
    if (path === `${base}/preview`) {
      if (body.document.lines.some(l => l.materials.some(m => m.unitCost === null))) return Response.json({ error: 'Pris saknas' }, { status: 400 });
      return Response.json(preview(body.document, body.expectedRevision + 1));
    }
    if (path === base) {
      if (method === 'PUT') saved = { ...preview(body.document, body.expectedRevision + 1), id: draftId, revision: body.expectedRevision + 1, updatedAt: '2026-10-14T09:00:00Z', lockedCalculationId: null };
      return Response.json(saved);
    }
    if (path === `${base}/lock`) { saved.lockedCalculationId = 'final-1'; return Response.json({ id: 'final-1' }); }
    assert.fail(`Unexpected ${method} ${path}`);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } }); clients.push(client);
  if (oldArticleCache) client.setQueryData(['material-articles', true], [{ id: 'inactive', name: 'INAKTIV', active: false, purchasePrice: 100 }]);
  const router = createMemoryRouter([{ path: '/projects/:id/calculations/:draftId', element: React.createElement(Editor) }, { path: '/projects/:id', element: React.createElement('p', null, 'Projektets kalkyler') }], { initialEntries: [`/projects/p1/calculations/${draftId}${copy ? '?copy=source' : ''}`] }); routers.push(router);
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(RouterProvider, { router })));
  return { view, router, getSaved: () => saved };
}

test('create with register purchase price, keep failed save, prevent double submit, then lock server version', async () => {
  let attempts = 0, release;
  const { view, getSaved } = setup({ handler: (path, method) => {
    if (method === 'PUT') {
      attempts++;
      if (attempts === 1) return Response.json({ error: 'Tillfälligt sparfel' }, { status: 503 });
      if (attempts === 2) return new Promise(resolve => { release = () => resolve(null); });
    }
  } });
  fireEvent.change(await view.findByLabelText('Beskrivning', { exact: true }), { target: { value: 'Isolera kanal' } });
  fireEvent.change(view.getByLabelText('Mängd', { exact: true }), { target: { value: '10' } });
  fireEvent.change(view.getByLabelText('Montagetid (min/enhet)'), { target: { value: '12' } });
  await view.findByRole('option', { name: /Isolering/ });
  fireEvent.change(view.getByLabelText('Lägg till från artikelregistret'), { target: { value: 'a1' } });
  assert.equal(view.getByLabelText('Inköpspris kr/m²').value, '79');
  const save = view.getByRole('button', { name: 'Spara utkast' });
  await waitFor(() => assert.equal(save.disabled, false));
  fireEvent.click(save); await view.findByText('Tillfälligt sparfel');
  assert.equal(view.getByLabelText('Beskrivning', { exact: true }).value, 'Isolera kanal');
  await waitFor(() => assert.equal(save.disabled, false));
  act(() => { fireEvent.click(save); fireEvent.click(save); });
  await waitFor(() => assert.equal(attempts, 2));
  assert.equal(view.getByLabelText('Beskrivning', { exact: true }).closest('fieldset').disabled, true);
  await act(async () => release());
  await view.findByText('Sparat utkast');
  assert.equal(getSaved().document.lines[0].materials[0].unitCost, 79);
  fireEvent.click(view.getByRole('button', { name: 'Lås version', exact: true }));
  const dialog = await view.findByRole('dialog', { name: 'Lås kalkylversion?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lås version' }));
  await view.findByRole('heading', { name: 'Låst kalkyl' });
  assert.ok(view.getByRole('link', { name: 'Kopiera till nytt utkast' }));
  assert.equal(requests.filter(r => r.path.endsWith('/lock')).length, 1);
  assert.equal(requests.some(r => r.method !== 'GET' && !r.path.includes('/project-calculations/')), false);
});

test('project zero rate is preserved; customer agreement fills missing project rate; article cache remains isolated', async () => {
  const zero = setup({ projectRate: 0, customerRate: 725, oldArticleCache: true });
  assert.equal((await zero.view.findByLabelText('Timpris till kund (kr/h)')).value, '0');
  await zero.view.findByRole('option', { name: /Isolering/ });
  assert.equal(zero.view.queryByRole('option', { name: /INAKTIV/ }), null);
  assert.ok(requests.some(r => r.path === '/api/projects/materials/articles'));
  cleanup();
  const agreement = setup({ projectRate: null, customerRate: 725 });
  assert.equal((await agreement.view.findByLabelText('Timpris till kund (kr/h)')).value, '725');
  assert.equal(helpers.newCalculation('Test', '', null).customerHourlyRate, 500);
});

test('copy preserves complex rows and clears quote identity; navigation guard and conflict keep edits', async () => {
  const document = helpers.newCalculation('Kopia', 'Kund', 500);
  document.quoteNumber = 'OLD-OFFER'; document.quoteDate = '2026-10-13'; document.validUntil = '2026-11-13';
  document.lines[0].referenceId = 'master-M1'; document.lines[0].internalDescription = 'Original';
  document.lines[0].materials = [helpers.calculationMaterial(), helpers.calculationMaterial()];
  document.lines[0].materials.forEach((m, i) => { m.description = `Material ${i}`; m.unitCost = 100 + i; });
  document.lines[0].materialCostExcluded = false;
  const original = structuredClone(document);
  const { view } = setup({ copy: preview(document), handler: (path, method) => method === 'PUT' ? Response.json({ error: 'Utkastet har ändrats' }, { status: 409 }) : null });
  fireEvent.change(await view.findByLabelText('Beskrivning', { exact: true }), { target: { value: 'Min ändring' } });
  fireEvent.click(view.getByRole('link', { name: 'Till projektets kalkyler' }));
  const dialog = await view.findByRole('dialog', { name: 'Lämna kalkylen?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }));
  const save = view.getByRole('button', { name: 'Spara utkast' });
  await waitFor(() => assert.equal(save.disabled, false)); fireEvent.click(save);
  await view.findByText('Utkastet har ändrats');
  assert.equal(view.getByLabelText('Beskrivning', { exact: true }).value, 'Min ändring');
  const sent = requests.find(r => r.method === 'PUT').body.document;
  assert.equal(sent.quoteNumber, ''); assert.equal(sent.quoteDate, ''); assert.equal(sent.validUntil, '');
  assert.equal(sent.lines[0].referenceId, 'master-M1'); assert.deepEqual(sent.lines[0].materials, original.lines[0].materials);
  assert.equal(original.lines[0].internalDescription, 'Original');
});

test('missing purchase price requires manual input; sales price is never substituted', async () => {
  const { view } = setup({ missingPrice: true });
  await view.findByRole('option', { name: /Isolering/ });
  fireEvent.change(view.getByLabelText('Lägg till från artikelregistret'), { target: { value: 'a1' } });
  assert.equal(view.getByLabelText('Inköpspris kr/m²').value, '');
  await view.findByText(/Pris saknas/);
  assert.equal(view.getByRole('button', { name: 'Spara utkast' }).disabled, true);
  fireEvent.change(view.getByLabelText('Inköpspris kr/m²'), { target: { value: '80' } });
  await waitFor(() => assert.equal(view.getByRole('button', { name: 'Spara utkast' }).disabled, false));
  fireEvent.click(view.getByRole('button', { name: 'Spara utkast' }));
  await view.findByText('Sparat utkast');
  const material = requests.find(r => r.method === 'PUT').body.document.lines[0].materials[0];
  assert.equal(material.unitCost, 80); assert.equal(material.sourceText, 'Manuellt pris i kalkylen');
});

test('reopening a saved draft uses its stored prices without refreshing from the article register', async () => {
  const document = helpers.newCalculation('Sparad', 'Kund', 500);
  document.lines[0].internalDescription = 'Befintlig rad'; document.lines[0].materialCostExcluded = false;
  document.lines[0].materials = [{ ...helpers.calculationMaterial(), materialArticleId: 'a1', description: 'Gammalt pris', unitCost: 65 }];
  const initial = { ...preview(document, 3), id: draftId, revision: 3, updatedAt: '2026-10-14T09:00:00Z', lockedCalculationId: null };
  const { view, router } = setup({ initial });
  await view.findByText('Sparat utkast');
  assert.equal(view.getByLabelText('Inköpspris kr/m').value, '65');
  assert.equal(view.getByRole('button', { name: 'Spara utkast' }).disabled, true);
  assert.equal(view.getByRole('button', { name: 'Lås version' }).disabled, false);
  await view.findByText(/Källversion 3/);
  const location = router.state.location;
  fireEvent.click(view.getByRole('button', { name: /Räknat pris:/ }));
  assert.equal(router.state.location, location);
  assert.equal(view.queryByRole('dialog', { name: 'Lämna kalkylen?' }), null);
});
