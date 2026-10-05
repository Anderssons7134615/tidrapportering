import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Detail, List, forms, auth, cleanup, fireEvent, render, waitFor, within;
let QueryClient, QueryClientProvider, createMemoryRouter, RouterProvider, act;
let clients = [], requests = [];
const originalFetch = globalThis.fetch;
const invoice = { id: 'i1', revision: 1, status: 'DRAFT', documentType: 'INVOICE', supplierName: 'Testleverantör', supplierOrgNumber: '556000-0000', invoiceNumber: 'TEST-1', issueDate: '2026-10-02T00:00:00.000Z', dueDate: null, currency: 'SEK', netOre: 10000, vatOre: 2500, roundingOre: 0, grossOre: 12500, note: null, suggestions: {}, parseWarnings: [], document: { originalName: 'TEST.pdf', byteSize: 30, sha256: 'test' }, allocations: [], allocatedOre: 0, unallocatedOre: 10000, confirmedAt: null };
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, FormData: dom.window.FormData, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  ({ cleanup, fireEvent, render, waitFor, within, act } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ createMemoryRouter, RouterProvider } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ PurchaseDetail: Detail, InvoiceList: List } = await vite.ssrLoadModule('/src/pages/Purchases.tsx'));
  forms = await vite.ssrLoadModule('/src/utils/invoiceForm.ts');
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients = []; requests = []; globalThis.fetch = originalFetch; });
after(async () => { await vite?.close(); dom?.window.close(); });

function setup({ status = 'DRAFT', failedSave = false, projectList = false, failedList = false, failedOriginal = false, listPath, suggestions = {}, header = {} } = {}) {
  let row = { ...invoice, status, suggestions, ...header };
  auth.useAuthStore.setState({ token: 'test-token', user: { id: 'u1', name: 'Test', role: 'ADMIN' } });
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost'); const path = parsed.pathname; const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path, query: parsed.searchParams, method, body });
    if (path.endsWith('/document')) {
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      return failedOriginal ? Response.json({ error: 'Nekad' }, { status: 403 }) : new Response('%PDF-test', { headers: { 'Content-Type': 'application/pdf' } });
    }
    if (path === '/api/projects') return Response.json([{ id: 'p1', name: 'Testprojekt', code: '0042', active: true }]);
    if (path === '/api/supplier-invoices') return failedList ? Response.json({ error: 'Testfel' }, { status: 503 }) : Response.json({ items: [row], total: 1, page: 1, pageSize: 25, confirmedProjectNetOre: 10000 });
    if (path.endsWith('/confirm')) { row = { ...row, revision: row.revision + 1, status: 'CONFIRMED' }; return Response.json(row); }
    if (path.endsWith('/reopen')) { row = { ...row, revision: row.revision + 1, status: 'DRAFT' }; return Response.json(row); }
    if (path.endsWith('/void')) { row = { ...row, revision: row.revision + 1, status: 'VOID' }; return Response.json(row); }
    if (path === '/api/supplier-invoices/i1') {
      if (method === 'PUT') {
        if (failedSave) return Response.json({ error: 'Fakturan har ändrats. Ladda om innan du fortsätter.' }, { status: 409 });
        row = { ...row, ...body, suggestions: { ...row.suggestions, orderAssignments: body.orderAssignments }, revision: row.revision + 1, allocations: body.allocations.map((allocation) => ({ ...allocation, project: { name: 'Testprojekt', code: '0042' } })) };
      }
      return Response.json(row);
    }
    assert.fail(`Unexpected ${method} ${path}`);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } }); clients.push(client);
  const router = createMemoryRouter([{ path: projectList ? '/projects/:id' : '/purchases/:id', element: projectList ? React.createElement(List, { projectId: 'p1' }) : React.createElement(Detail) }, { path: '/purchases', element: listPath ? React.createElement(List) : React.createElement('p', null, 'Tillbaka i listan') }], { initialEntries: ['/purchases', listPath || (projectList ? '/projects/p1?tab=purchases' : '/purchases/i1')], initialIndex: 1 });
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(RouterProvider, { router })));
  return { view, client, router };
}

test('originalet hämtas med autentisering och blob-URL släpps när panelen stängs', async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.createObjectURL = () => 'blob:test-original';
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    const { view } = setup();
    await view.findByRole('button', { name: 'Visa original' });
    assert.equal(requests.some((request) => request.path.endsWith('/document')), false);
    fireEvent.click(view.getByRole('button', { name: 'Visa original' }));
    const link = await view.findByRole('link', { name: 'Öppna original i ny flik' });
    assert.equal(link.getAttribute('href'), 'blob:test-original');
    assert.equal(view.getByTitle('Fakturans PDF-original').getAttribute('src'), 'blob:test-original');
    fireEvent.click(view.getByRole('button', { name: 'Stäng originalvisning' }));
    await waitFor(() => assert.deepEqual(revoked, ['blob:test-original']));
    assert.equal(view.queryByTitle('Fakturans PDF-original'), null);
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});

test('nekad originalåtkomst visar fel utan länk eller förhandsvisning', async () => {
  const { view } = setup({ failedOriginal: true });
  fireEvent.click(await view.findByRole('button', { name: 'Visa original' }));
  assert.match((await view.findByRole('alert')).textContent, /Originalet kunde inte hämtas/);
  assert.equal(view.queryByTitle('Fakturans PDF-original'), null);
  assert.equal(view.queryByRole('link', { name: 'Öppna original i ny flik' }), null);
  fireEvent.click(view.getByRole('button', { name: 'Försök igen' }));
  await waitFor(() => assert.equal(requests.filter((request) => request.path.endsWith('/document')).length, 2));
  await view.findByRole('alert');
  fireEvent.click(view.getByRole('button', { name: 'Stäng originalvisning' }));
  assert.equal(view.queryByRole('alert'), null);
  assert.equal(view.queryByRole('button', { name: 'Försök igen' }), null);
});
test('fakturaformulär kräver sparade ändringar och aktiv originalkontroll före bekräftelse', async () => {
  const { view, client } = setup();
  const keys = [['project-control'], ['project-portfolio'], ['project', 'p1']];
  const resetCache = () => keys.forEach((key) => client.setQueryData(key, { old: true }));
  const expectRefreshed = () => waitFor(() => keys.forEach((key) => assert.equal(client.getQueryState(key)?.isInvalidated, true)));
  resetCache();
  await view.findByLabelText('Leverantör');
  assert.equal(view.getByRole('button', { name: 'Bekräfta faktura', exact: true }).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Lägg till projekt' }));
  assert.equal(requests.some((request) => request.method === 'PUT'), false, 'adding a project must not submit the form');
  fireEvent.change(view.getByLabelText('Projekt'), { target: { value: 'p1' } });
  fireEvent.change(view.getByLabelText('Netto (kr)'), { target: { value: '100,00' } });
  assert.equal(view.getByRole('checkbox').disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Spara utkast' }));
  await waitFor(() => assert.equal(view.getByRole('checkbox').disabled, false));
  assert.equal(requests.find((request) => request.method === 'PUT').body.allocations[0].netOre, 10000);
  await expectRefreshed();
  resetCache();
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.click(view.getByRole('button', { name: 'Bekräfta faktura', exact: true }));
  const dialog = view.getByRole('dialog');
  assert.match(dialog.textContent, /Ingen bokföring eller betalning/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Bekräfta faktura' }));
  await view.findByRole('button', { name: 'Öppna för rättelse' });
  const confirm = requests.find((request) => request.path.endsWith('/confirm'));
  assert.deepEqual(confirm.body, { revision: 2, reviewedOriginal: true });
  await expectRefreshed();
});

test('global invoice status follows the URL, filter changes and back navigation', async () => {
  const { view, router } = setup({ listPath: '/purchases?status=DRAFT' });
  await view.findByText('Testleverantör');
  assert.equal(requests[0].query.get('status'), 'DRAFT');
  assert.equal(view.getByLabelText('Visa').value, 'DRAFT');
  fireEvent.change(view.getByLabelText('Visa'), { target: { value: 'CONFIRMED' } });
  await waitFor(() => assert.ok(requests.some((request) => request.query.get('status') === 'CONFIRMED')));
  assert.equal(router.state.location.search, '?status=CONFIRMED');
  await act(async () => { await router.navigate(-1); });
  assert.equal(view.getByLabelText('Visa').value, 'DRAFT');
  await act(async () => { await router.navigate('/purchases?status=INVALID'); });
  assert.equal(view.getByLabelText('Visa').value, '');
  await waitFor(() => assert.ok(requests.some((request) => !request.query.has('status'))));
});

test('project invoice filter preserves the project tab URL', async () => {
  const { view, router } = setup({ projectList: true });
  await view.findByText('Testleverantör');
  fireEvent.change(view.getByLabelText('Visa'), { target: { value: 'DRAFT' } });
  await waitFor(() => assert.ok(requests.some((request) => request.query.get('status') === 'DRAFT' && request.query.get('projectId') === 'p1')));
  assert.equal(router.state.location.search, '?tab=purchases');
});
test('konflikt behåller inmatningen och ingen bekräftelse skickas', async () => {
  const { view } = setup({ failedSave: true }); await view.findByLabelText('Leverantör');
  fireEvent.change(view.getByLabelText('Netto, exkl. moms (kr)'), { target: { value: '90,00' } });
  fireEvent.click(view.getByRole('button', { name: 'Spara utkast' }));
  await view.findByRole('alert'); assert.equal(view.getByLabelText('Netto, exkl. moms (kr)').value, '90,00');
  assert.equal(requests.some((request) => request.path.endsWith('/confirm')), false);
  assert.equal(view.getByRole('checkbox').disabled, true);
});
test('bekräftad faktura är låst och rättelse behöver en orsak', async () => {
  const { view } = setup({ status: 'CONFIRMED' }); await view.findByLabelText('Leverantör');
  assert.ok(view.getByLabelText('Leverantör').closest('fieldset').disabled);
  fireEvent.click(view.getByRole('button', { name: 'Öppna för rättelse' }));
  const dialog = view.getByRole('dialog'); assert.equal(within(dialog).getByRole('button', { name: 'Öppna för rättelse' }).disabled, true);
  fireEvent.change(within(dialog).getByLabelText('Orsak'), { target: { value: 'Fel projekt' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Öppna för rättelse' }));
  await view.findByRole('button', { name: 'Spara utkast' });
  assert.equal(requests.find((request) => request.path.endsWith('/reopen')).body.reason, 'Fel projekt');
});
test('projektinköp filtrerar på projekt och skiljer läsfel från noll kronor', async () => {
  const { view } = setup({ projectList: true, failedList: true });
  await view.findByRole('alert');
  assert.equal(view.queryByText(/bekräftat, exkl/), null);
  assert.equal(requests[0].query.get('projectId'), 'p1');
});
test('formulär till API använder heltalsören, null för tomt datum och avvisar ogiltiga pengar', () => {
  const form = forms.invoiceToForm(invoice);
  form.dueDate = ''; form.net = '1 234,56'; form.gross = '-0,01';
  const draft = forms.formToDraft(form, 3);
  assert.equal(draft.netOre, 123456); assert.equal(draft.grossOre, -1); assert.equal(draft.dueDate, null);
  assert.equal(draft.issueDate, '2026-10-02'); assert.equal(draft.revision, 3);
  assert.throws(() => forms.parseMoneyInput('1e5'), /två decimaler/);
});
test('osparat skydd stoppar länk, bakåtnavigering och makulering utan att tappa inmatning', async () => {
  const { view, router } = setup(); await view.findByLabelText('Leverantör');
  fireEvent.change(view.getByLabelText('Netto, exkl. moms (kr)'), { target: { value: '90,00' } });
  assert.equal(view.getByRole('button', { name: 'Makulera', exact: true }).disabled, true);
  fireEvent.click(view.getByRole('link', { name: 'Alla inköp' }));
  let dialog = await view.findByRole('dialog');
  assert.match(dialog.textContent, /osparade/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }));
  assert.equal(view.getByLabelText('Netto, exkl. moms (kr)').value, '90,00');
  await act(async () => { await router.navigate(-1); });
  dialog = await view.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lämna utan att spara' }));
  await view.findByText('Tillbaka i listan');
  assert.equal(requests.some((request) => request.method !== 'GET'), false);
});

const orders = [
  { orderNumber: '880001', customerReference: '0042 TEST', pages: [1], netOre: 3000 },
  { orderNumber: '880002', customerReference: '0042', pages: [2, 3], netOre: 2000 },
  { orderNumber: '880003', customerReference: 'LAGER', pages: [4], netOre: 4000 },
  { orderNumber: '880004', customerReference: null, pages: [5], netOre: 1000 },
];
test('projektmatchning bevarar nollor och gissar inte för lager, saknad, okänd eller tvetydig kod', () => {
  const projects = [{ id: 'p1', code: '0042' }, { id: 'p2', code: '42' }, { id: 'p3', code: 'LAGER' }];
  assert.deepEqual(forms.suggestOrderProjects(orders, projects).map((row) => row.projectId), ['p1', 'p1', null, null]);
  assert.equal(forms.suggestOrderProjects([orders[0]], [{ id: 'p2', code: '42' }])[0].projectId, null);
  assert.equal(forms.suggestOrderProjects([orders[0]], [...projects, { id: 'p4', code: '0042' }])[0].projectId, null);
  assert.equal(forms.suggestOrderProjects([{ ...orders[0], customerReference: '00420' }], projects)[0].projectId, null);
});

test('orderförslag summeras per projekt, lager förblir ofördelat och orderval återställs efter sparande', async () => {
  const { view } = setup({ suggestions: { orders } });
  const useOrders = await view.findByRole('button', { name: 'Föreslå projekt per order' });
  await waitFor(() => assert.equal(useOrders.disabled, false));
  fireEvent.click(useOrders);
  await waitFor(() => assert.ok(document.activeElement === view.getByText('Orderdelar från originalet').closest('[tabindex="-1"]'), 'ordersektionen ska ha fokus'));
  assert.equal(view.getByLabelText('Projekt för order 880001').value, 'p1');
  assert.equal(view.getByLabelText('Projekt för order 880003').value, '');
  assert.equal(view.getByLabelText('Netto (kr)').value, '50,00');
  assert.ok(view.getByLabelText('Netto (kr)').closest('fieldset').disabled);
  assert.equal(requests.some((request) => request.method === 'PUT'), false);
  fireEvent.click(view.getByRole('button', { name: 'Spara utkast' }));
  await waitFor(() => assert.equal(view.getByRole('checkbox').disabled, false));
  const saved = requests.find((request) => request.method === 'PUT').body;
  assert.equal(saved.allocations.length, 1);
  assert.equal(saved.allocations[0].netOre, 5000);
  assert.equal(saved.orderAssignments.length, 4);
  assert.equal(saved.orderAssignments[2].projectId, null);
  assert.equal(view.getByLabelText('Projekt för order 880001').value, 'p1');
  fireEvent.change(view.getByLabelText('Projekt för order 880003'), { target: { value: 'p1' } });
  assert.equal(view.getByLabelText('Netto (kr)').value, '90,00');
  assert.equal(view.getByRole('checkbox').disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Byt till manuell fördelning' }));
  await waitFor(() => assert.ok(document.activeElement === view.getByText('Orderdelar från originalet').closest('[tabindex="-1"]'), 'ordersektionen ska ha fokus'));
  assert.equal(view.queryByLabelText('Projekt för order 880001'), null);
  assert.equal(view.getByLabelText('Netto (kr)').closest('fieldset').disabled, false);
  assert.equal(view.getByLabelText('Netto (kr)').value, '90,00');
});

test('orderförslag fyller kredittyp och avrundning tillsammans med netto även före huvudfältens fyllknapp', async () => {
  const creditOrders = orders.map((row) => ({ ...row, netOre: -row.netOre }));
  const { view } = setup({ suggestions: { orders: creditOrders, documentType: 'CREDIT', netOre: -10000, vatOre: -2500, roundingOre: 14, grossOre: -12486 }, header: { documentType: 'INVOICE', netOre: null, vatOre: null, grossOre: null, roundingOre: 0 } });
  const button = await view.findByRole('button', { name: 'Föreslå projekt per order' });
  await waitFor(() => assert.equal(button.disabled, false));
  fireEvent.click(button);
  assert.equal(view.getByLabelText('Typ').value, 'CREDIT');
  assert.equal(view.getByLabelText('Öresavrundning (kr)').value, '0,14');
  assert.equal(view.getByLabelText('Netto, exkl. moms (kr)').value, '-100,00');
  assert.equal(view.getByLabelText('Totalbelopp (kr)').value, '-124,86');
  fireEvent.click(view.getByRole('button', { name: 'Fyll tomma fält med läsförslag' }));
  fireEvent.click(view.getByRole('button', { name: 'Spara utkast' }));
  await waitFor(() => assert.equal(view.getByRole('checkbox').disabled, false));
  const saved = requests.find((request) => request.method === 'PUT').body;
  assert.equal(saved.documentType, 'CREDIT');
  assert.equal(saved.netOre + saved.vatOre + saved.roundingOre, saved.grossOre);
});
