import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Detail, Economy, Calculations, auth, cleanup, fireEvent, render, waitFor, within, act;
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
  ({ default: Calculations } = await vite.ssrLoadModule('/src/pages/ProjectCalculations.tsx'));
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});
afterEach(() => { cleanup(); clients.forEach((c) => c.clear()); clients = []; requests = []; globalThis.fetch = originalFetch; });
after(async () => { await vite?.close(); dom?.window.close(); });

function setup({ role = 'ADMIN', handler, economy, calculation = false, initialPath = '/projects/p1' } = {}) {
  auth.useAuthStore.setState({ token: 'test-token', user: { id: 'u1', name: 'Test', role } });
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const method = options.method || 'GET';
    requests.push({ path, method });
    const override = await handler?.(path, method, options);
    if (override instanceof Response) return override;
    const data = override ?? ({
      '/api/projects/p1': role === 'EMPLOYEE' ? { ...project, financialsVisibleToCurrentUser: false, hoursVisibleToCurrentUser: false } : project,
      '/api/projects/p1/summary': role === 'EMPLOYEE' ? { ...summary, totals: {}, warnings: [] } : summary,
      '/api/projects/p1/time-entries': [],
      '/api/projects/p1/materials': { items: [], totals: { quantity: 0, amount: 0 } },
      '/api/projects/materials/articles': [article],
      '/api/projects/p1/updates': [],
      '/api/project-calculations/p1/editor': [],
      '/api/project-portfolio': economy,
    })[path];
    assert.notEqual(data, undefined, `Unexpected request ${method} ${path}`);
    return Response.json(data);
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [economy ? '/economy' : initialPath] }, React.createElement(Routes, null, React.createElement(Route, { path: economy ? '/economy' : '/projects/:id', element: calculation ? React.createElement(Calculations, { projectId: 'p1', projectName: '0042 · Testprojekt', active: true }) : React.createElement(economy ? Economy : Detail) })))));
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

test('project return context is validated against its actual customer', async () => {
  for (const [initialPath, customer, expected] of [
    ['/projects/p1?customerId=c1&tab=purchases', { id: 'c1', name: 'Kund' }, '/projects?customerId=c1'],
    ['/projects/p1?customerId=wrong', { id: 'c1', name: 'Kund' }, '/projects'],
    ['/projects/p1?internal=1', null, '/projects?internal=1'],
    ['/projects/p1?customerId=c1&archived=1', { id: 'c1', name: 'Kund' }, '/projects?customerId=c1&archived=1'],
    ['/projects/p1?internal=1&archived=1', null, '/projects?internal=1&archived=1'],
    ['/projects/p1?archived=1', null, '/projects?archived=1'],
    ['/projects/p1?internal=1&customerId=c1', { id: 'c1', name: 'Kund' }, '/projects'],
    ['/projects/p1?internal=1', { id: 'c1', name: 'Kund' }, '/projects'],
  ]) {
    const { view } = setup({ role: 'EMPLOYEE', initialPath, handler: async (path) => path === '/api/projects/p1' ? { ...project, customer, financialsVisibleToCurrentUser: false, hoursVisibleToCurrentUser: false } : undefined });
    await view.findByRole('heading', { name: 'Testprojekt' });
    assert.equal(view.getByRole('link', { name: /Tillbaka/ }).getAttribute('href'), expected);
    cleanup();
  }
});

test('retired material, purchase and calculation tabs cannot be opened by any work role', async () => {
  for (const role of ['ADMIN', 'SUPERVISOR', 'EMPLOYEE']) {
    for (const tab of ['materials', 'purchases', 'calculation']) {
      const { view } = setup({ role, initialPath: `/projects/p1?tab=${tab}` });
      await view.findByRole('heading', { name: 'Testprojekt' });
      for (const name of ['Material', 'Inköp', 'Kalkyl']) assert.equal(view.queryByRole('tab', { name, exact: true }), null);
      assert.equal(view.queryByRole('button', { name: 'Lägg material' }), null);
      assert.equal(view.getByRole('tab', { name: 'Översikt' }).getAttribute('aria-selected'), 'true');
      assert.equal(requests.some(r => /materials|supplier-invoices|project-calculations/.test(r.path)), false);
      cleanup(); requests = [];
    }
  }
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


function calcPreview() {
  return { fingerprint: 'a'.repeat(64), document: { id: 'source', revision: 1, name: 'Testkalkyl', customerName: 'Testkund', quoteNumber: 'TEST-1', manualBid: 90000, scope: '', terms: '', lines: [{ id: 'row', internalDescription: 'Testarbete', customerDescription: 'Testarbete', quantity: 10, workUnit: 'm', laborMinutesPerUnit: 9, timeSource: 'ownEstimate', materialCostExcluded: true, materials: [] }] },
    totals: { materialCostWithWaste: 0, laborHours: 1.5, internalLaborCost: 469.50, directCost: 469.50, calculatedPrice: 735 }, rows: [{ id: 'row', laborHours: 1.5, materialCost: 0, calculatedPrice: 735 }] };
}

test('calculation preview never saves before confirmation; failure retains preview and retry writes only once', async () => {
  const preview = calcPreview(); const payload = { format: 'andersson-kalkyl-v1', document: preview.document };
  let imported = false, attempts = 0, release;
  const { view } = setup({ calculation: true, handler: (path, method, options) => {
    if (path === '/api/project-calculations/p1') return imported ? [{ id: 'saved', name: 'Testkalkyl', sourceRevision: 1, createdAt: '2026-10-13T12:00:00Z' }] : [];
    if (path.endsWith('/preview')) { assert.deepEqual(JSON.parse(options.body), payload); return preview; }
    if (path.endsWith('/import')) {
      attempts++;
      assert.deepEqual(JSON.parse(options.body), { calculation: payload, expectedFingerprint: preview.fingerprint, reviewed: true });
      if (attempts === 1) return Response.json({error:'Testfel vid sparande'},{status:500});
      return new Promise(resolve => { release = () => { imported = true; resolve({ id:'saved', duplicate:false }); }; });
    }
    if (path.endsWith('/saved')) return { ...preview, id:'saved', importedBy:'Testadmin', createdAt:'2026-10-13T12:00:00Z' };
  } });
  fireEvent.change(await view.findByLabelText('Kalkylfil (.json)'), { target: { files: [{ name:'kalkyl.json', size:100, text:async()=>JSON.stringify(payload) }] } });
  await view.findByText('Granska: Testkalkyl');
  assert.equal(attempts, 0);
  const save = view.getByRole('button', { name:'Spara låst kalkylversion' });
  assert.equal(save.disabled,true);
  assert.ok(view.getByText('Manuellt anbud i källan'));
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.click(save);
  await view.findByRole('alert');
  assert.ok(view.getByText('Granska: Testkalkyl'));
  await waitFor(()=>assert.equal(save.disabled,false));
  act(()=>{ fireEvent.click(save); fireEvent.click(save); });
  await waitFor(()=>assert.equal(attempts,2));
  await act(async()=>release());
  await view.findByText('Låst');
  assert.equal(view.queryByText('Granska: Testkalkyl'),null);
  assert.equal(requests.filter(r=>r.method!=='GET' && !r.path.startsWith('/api/project-calculations/')).length,0);
});

test('invalid JSON and late previews cannot replace a newly selected calculation', async () => {
  let releaseFirst; const second = calcPreview(); second.document.name = 'Senast vald';
  const { view } = setup({ calculation:true, handler:(path,method,options)=>{
    if(path==='/api/project-calculations/p1')return [];
    if(path.endsWith('/preview'))return JSON.parse(options.body).which===1 ? new Promise(resolve=>releaseFirst=resolve) : second;
  }});
  const input = await view.findByLabelText('Kalkylfil (.json)');
  fireEvent.change(input,{target:{files:[{name:'bad.json',size:4,text:async()=>'{bad'}]}});
  await view.findByText('Filen är inte en giltig kalkylexport.');
  fireEvent.change(input,{target:{files:[{name:'one.json',size:10,text:async()=>'{"which":1}'}]}});
  await waitFor(()=>assert.ok(releaseFirst));
  fireEvent.change(input,{target:{files:[{name:'two.json',size:10,text:async()=>'{"which":2}'}]}});
  await view.findByText('Granska: Senast vald');
  await act(async()=>releaseFirst(calcPreview()));
  assert.ok(view.getByText('Granska: Senast vald'));
  assert.equal(view.queryByText('Granska: Testkalkyl'),null);
});
