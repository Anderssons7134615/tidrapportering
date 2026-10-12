import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, Team, TimeEntry, Approval, DashboardDetail, Layout, auth, offline, projectsApi, refreshTimeQueries, formatHours;
let render, cleanup, fireEvent, waitFor, within, act, QueryClient, QueryClientProvider, createMemoryRouter, RouterProvider;
const clients = [], originalFetch = globalThis.fetch;
const user = { id: 'u1', name: 'Testperson', companyId: 'c1', companyName: 'Testbolag', role: 'ADMIN', active: true };
const project = { id: 'p1', code: '0042', name: 'Montageprojekt', active: true, customer: { id: 'c1', name: 'Testkund' } };
const activity = { id: 'a1', name: 'Montage', active: true, category: 'WORK', billableDefault: true };
const timeKeys = [['timeEntries', 'day', '2026-10-05'], ['timeEntry', 'e1'], ['week', '2026-10-05'], ['week', '2026-10-12'], ['weekLocks'], ['weekDetails', 'w1'], ['team-week-summary', '2026-10-05'], ['report', 'payroll', '2026-10'], ['copy-yesterday', '2026-10-05']];
const projectKeys = [['project', 'p1', 'summary'], ['projects', 'options', 'active', 'u1'], ['project-control'], ['project-portfolio'], ['dashboard', 'details']];

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage, FormData: dom.window.FormData });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ render, cleanup, fireEvent, waitFor, within, act } = await import('@testing-library/react'));
  ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
  ({ createMemoryRouter, RouterProvider } = await import('react-router-dom'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Team } = await vite.ssrLoadModule('/src/pages/TeamWeekOverview.tsx'));
  ({ default: TimeEntry } = await vite.ssrLoadModule('/src/pages/TimeEntry.tsx'));
  ({ default: Approval } = await vite.ssrLoadModule('/src/pages/Approval.tsx'));
  ({ default: DashboardDetail } = await vite.ssrLoadModule('/src/pages/DashboardDetail.tsx'));
  ({ projectsApi } = await vite.ssrLoadModule('/src/services/api.ts'));
  ({ default: Layout } = await vite.ssrLoadModule('/src/components/Layout.tsx'));
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
  offline = await vite.ssrLoadModule('/src/stores/offlineStore.ts');
  ({ refreshTimeQueries } = await vite.ssrLoadModule('/src/utils/timeQueries.ts'));
  ({ formatHours } = await vite.ssrLoadModule('/src/utils/format.ts'));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); globalThis.fetch = originalFetch; localStorage.clear(); offline.useOfflineStore.setState({ pendingEntries: [], isOnline: false }); });
after(async () => { await vite?.close(); dom?.window.close(); });

function client() {
  const instance = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(instance); return instance;
}
function setup(Component, { path = '/team-week?date=2026-10-05', routePath = '*', handler, shell = false, cache = client() } = {}) {
  auth.useAuthStore.setState({ token: 'synthetic-test', user });
  cache.setQueryData(['auth', 'me'], user);
  globalThis.fetch = async (url, options = {}) => {
    const response = await handler?.(new URL(url, 'http://localhost'), options);
    assert.notEqual(response, undefined, `Unexpected test request: ${url}`);
    return response instanceof Response ? response : Response.json(response);
  };
  const router = createMemoryRouter([{ element: shell ? React.createElement(Layout) : undefined, children: [{ path: routePath, element: React.createElement(Component) }] }], { initialEntries: [path] });
  const view = render(React.createElement(QueryClientProvider, { client: cache }, React.createElement(RouterProvider, { router })));
  return { view, router, cache };
}
function team(week = '2026-10-05') {
  const days = [8, 7.25, 8, 8, 8, 2, 0].map((hours, index) => { const date = new Date(`${week}T12:00:00`); date.setDate(date.getDate() + index); return { date: date.toISOString().slice(0, 10), dayName: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'][index], hours, expected: index < 5, status: hours ? 'REPORTED' : 'OFF', warnings: [] }; });
  return { weekStart: week, totals: { totalHours: 41.25 }, users: [{ userId: 'u1', userName: user.name, status: 'SUBMITTED', attentionStatus: 'PENDING', needsAction: false, totalHours: 41.25, days, missingDays: [], deviations: [], projects: [{ projectId: 'p1', projectName: project.name, projectCode: project.code, hours: 41.25 }], entries: days.filter(day => day.hours).map((day, i) => ({ id: `e${i}`, date: day.date, hours: day.hours, project, activity })) }] };
}

test('quarter hours remain exact in shared labels', () => {
  assert.equal(formatHours(7.25), '7,25 h');
  assert.equal(formatHours(0.25), '0,25 h');
  assert.equal(formatHours(8), '8 h');
});

test('time changes invalidate cached payroll, review details and every week; failed sync leaves project data fresh', async () => {
  for (const projectDataChanged of [true, false]) {
    const cache = client();
    [...timeKeys, ...projectKeys, ['users']].forEach(key => cache.setQueryData(key, { saved: true }));
    await refreshTimeQueries(cache, { projectDataChanged });
    timeKeys.forEach(key => assert.equal(cache.getQueryState(key).isInvalidated, true, JSON.stringify(key)));
    projectKeys.forEach(key => assert.equal(cache.getQueryState(key).isInvalidated, projectDataChanged, JSON.stringify(key)));
    assert.equal(cache.getQueryState(['users']).isInvalidated, false);
  }
});

test('team day selection keeps full totals, quarter hours and hidden weekend visible', async () => {
  const { view } = setup(Team, { handler: url => url.pathname.includes('/week-summary/') ? team() : { entries: team().users[0].entries } });
  const tuesday = await view.findByRole('button', { name: /Testperson, Tis 2026-10-06, 7,25 h/ });
  assert.ok(view.getByText('varav 2 h helg'));
  assert.equal(view.queryByRole('button', { name: /Testperson, Lör/ }), null);
  fireEvent.click(tuesday);
  const region = view.getByRole('region', { name: 'Tidrader för Testperson' });
  await within(region).findByRole('cell', { name: '7,25 h', exact: true });
  assert.equal(within(region).getAllByRole('row').length, 2);
  assert.ok(within(region).getByText('7,25 h'));
  assert.ok(view.getByText('Projektfördelning · hela veckan'));
  fireEvent.click(view.getByRole('button', { name: 'Visa hela veckan' }));
  assert.equal(within(region).getAllByRole('row').length, 7);
  fireEvent.click(view.getByRole('button', { name: 'Visa helg' }));
  assert.ok(view.getByRole('button', { name: /Testperson, Lör 2026-10-10, 2 h/ }));
  assert.equal(view.queryByText('varav 2 h helg'), null);
  fireEvent.click(view.getByRole('button', { name: /Testperson, Lör 2026-10-10/ }));
  assert.equal(within(region).getAllByRole('row').length, 2);
  fireEvent.click(view.getByRole('button', { name: 'Dölj helg' }));
  assert.equal(within(region).getAllByRole('row').length, 7);
  assert.equal(view.queryByRole('button', { name: 'Visa hela veckan' }), null);
});

test('team day details load all rows beyond the eight-row summary and recover from a failed request', async () => {
  const summary = team();
  const fullEntries = [...summary.users[0].entries, ...Array.from({ length: 4 }, (_, i) => ({ ...summary.users[0].entries[2], id: `extra-${i}`, hours: 1 }))];
  summary.users[0].entries = fullEntries.slice(-8);
  let fail = true, detailRequests = 0;
  const { view } = setup(Team, { handler: url => {
    if (url.pathname.includes('/week-summary/')) return summary;
    assert.equal(url.pathname, '/api/time-entries/week/2026-10-05');
    assert.equal(url.searchParams.get('userId'), 'u1');
    detailRequests++;
    return fail ? Response.json({ error: 'Testat nätfel' }, { status: 503 }) : { entries: fullEntries };
  } });
  const monday = await view.findByRole('button', { name: /Testperson, Mån 2026-10-05/ });
  assert.equal(detailRequests, 0, 'details are loaded only when opened');
  fireEvent.click(monday);
  const region = view.getByRole('region', { name: 'Tidrader för Testperson' });
  await within(region).findByRole('alert');
  assert.equal(within(region).queryByText('Inga tidrader för dagen.'), null);
  fail = false;
  fireEvent.click(within(region).getByRole('button', { name: 'Försök igen' }));
  await within(region).findByRole('cell', { name: '2026-10-05', exact: true });
  assert.equal(within(region).getAllByRole('row').length, 2);
  fireEvent.click(view.getByRole('button', { name: 'Visa hela veckan' }));
  assert.equal(within(region).getAllByRole('row').length, fullEntries.length + 1);
  assert.equal(detailRequests, 2);
});

test('dashboard drilldowns preserve quarter hours in totals, people, days, entries and approvals', async () => {
  const cases = [
    ['weekly-hours', { kind: 'weekly-user-summary', users: [{ userId: 'u1', userName: user.name, totalHours: 7.25, days: [{ date: '2026-10-05', hours: 7.25 }] }] }, 3],
    ['monthly-hours', { kind: 'entries', entries: [{ ...team().users[0].entries[1], user }] }, 2],
    ['pending-approval', { kind: 'pending-approvals', approvals: [{ id: 'w1', weekStartDate: '2026-10-05', totalHours: 7.25, user }] }, 1],
  ];
  for (const [metric, data, expectedCount] of cases) {
    const { view } = setup(DashboardDetail, { path: `/overview/details/${metric}`, routePath: '/overview/details/:metric', handler: url => {
      assert.equal(url.pathname, '/api/dashboard/drilldown'); assert.equal(url.searchParams.get('metric'), metric);
      return { ...data, totalHours: 7.25, period: { start: '2026-10-05', end: '2026-10-11' } };
    } });
    await waitFor(() => assert.equal(view.getAllByText(/7,25 h/).length, expectedCount));
    assert.equal(view.queryByText(/7,3 h/), null);
    cleanup();
  }
});

test('project choices fall back only for an older API and discard unrelated project fields', async () => {
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(url);
    if (url.endsWith('/projects/options')) return Response.json({ error: 'Not found' }, { status: 404 });
    assert.equal(url, '/api/projects?active=true');
    return Response.json([{ ...project, defaultRate: 900, metrics: { totalHours: 500 }, customer: { ...project.customer, email: 'private@test.example' } }]);
  };
  assert.deepEqual(await projectsApi.options(), [{ id: project.id, code: project.code, name: project.name, customer: project.customer }]);
  assert.equal(requested.length, 2);
  for (const status of [403, 503]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: 'Test error' }, { status }); };
    await assert.rejects(projectsApi.options(), error => error.status === status);
    assert.equal(calls, 1, 'authorization and service failures must not trigger fallback');
  }
});

test('team date uses URL including browser history and shows both years at year boundary', async () => {
  const requested = [];
  const { view, router } = setup(Team, { path: '/team-week?date=2026-12-28', handler: url => { const week = url.pathname.split('/').at(-1); requested.push(week); return team(week); } });
  await view.findByText(/28 dec\. 2026 – 3 jan\. 2027/);
  fireEvent.click(view.getByRole('button', { name: 'Nästa vecka' }));
  await waitFor(() => assert.ok(requested.includes('2027-01-04')));
  await act(async () => { await router.navigate(-1); });
  await view.findByText(/28 dec\. 2026 – 3 jan\. 2027/);
  assert.match(router.state.location.search, /2026-12-28/);
});

test('existing offline v2 rows and inventory retry payload survive shell mount and rehydration', async () => {
  const pendingEntries = ['u1', 'other-user'].map((ownerUserId, i) => ({ localId: `local-${i}`, ownerUserId, date: '2026-10-05', hours: 7.25, projectId: 'p1', activityId: 'a1', note: 'Sparad utan nät', billable: true, createdAt: '2026-10-05T15:00:00.000Z' }));
  localStorage.setItem('tidapp-offline', JSON.stringify({ version: 2, state: { pendingEntries, isOnline: false } }));
  const stock = JSON.stringify({ itemId: 'stock1', input: { kind: 'ISSUE', quantity: 2, projectId: 'p1', idempotencyKey: 'synthetic-stable-id' } });
  localStorage.setItem('tidapp-inventory-pending:u1', stock);
  await offline.useOfflineStore.persist.rehydrate();
  const { view } = setup(() => React.createElement('h1', null, 'Testvy'), { shell: true });
  assert.ok(view.getAllByLabelText('Offline, 1 rader väntar på synkning').length);
  fireEvent.click(view.getByRole('button', { name: 'Meny', exact: true }));
  fireEvent.keyDown(document, { key: 'Escape' });
  cleanup();
  await offline.useOfflineStore.persist.rehydrate();
  assert.deepEqual(offline.useOfflineStore.getState().pendingEntries, pendingEntries);
  assert.deepEqual(JSON.parse(localStorage.getItem('tidapp-offline')).state.pendingEntries, pendingEntries);
  assert.equal(localStorage.getItem('tidapp-inventory-pending:u1'), stock);
});

test('partial offline response removes only confirmed own rows and refreshes review and payroll', async () => {
  const pendingEntries = ['created', 'rejected', 'missing', 'another-owner'].map(localId => ({ localId, ownerUserId: localId === 'another-owner' ? 'u2' : user.id, date: '2026-10-05', hours: 7.25, projectId: 'p1', activityId: 'a1', billable: true, createdAt: '2026-10-05T15:00:00Z' }));
  offline.useOfflineStore.setState({ pendingEntries, isOnline: true });
  let sent;
  const cache = client();
  [...timeKeys, ...projectKeys].forEach(key => cache.setQueryData(key, {}));
  setup(() => React.createElement('h1', null, 'Synktest'), { shell: true, cache, handler: (url, options) => {
    assert.equal(url.pathname, '/api/time-entries/sync'); sent = JSON.parse(options.body);
    return { results: [{ localId: 'created', outcome: 'CREATED' }, { localId: 'rejected', outcome: 'REJECTED', code: 'WEEK_APPROVED', error: 'Veckan är attesterad' }] };
  } });
  await waitFor(() => assert.equal(offline.useOfflineStore.getState().pendingEntries.length, 3), { timeout: 4000 });
  assert.deepEqual(sent.map(entry => entry.localId), ['created', 'rejected', 'missing']);
  const remaining = offline.useOfflineStore.getState().pendingEntries;
  assert.equal(remaining.find(entry => entry.localId === 'rejected').syncErrorCode, 'WEEK_APPROVED');
  assert.equal(remaining.find(entry => entry.localId === 'missing').syncErrorCode, 'SYNC_RESPONSE_INCOMPLETE');
  assert.deepEqual(remaining.find(entry => entry.localId === 'another-owner'), pendingEntries[3]);
  [...timeKeys, ...projectKeys].forEach(key => assert.equal(cache.getQueryState(key).isInvalidated, true, JSON.stringify(key)));
});

test('time form reads old cached projects during options failure and preserves unsynced time', async () => {
  offline.useOfflineStore.setState({ isOnline: false, pendingEntries: [] });
  localStorage.setItem('tidapp-reference-projects:u1', JSON.stringify([{ ...project, metrics: { totalHours: 200 }, defaultRate: 500 }]));
  localStorage.setItem('tidapp-reference-activities:u1', JSON.stringify([activity]));
  const requested = [];
  const { view } = setup(TimeEntry, { path: '/time-entry?date=2026-10-05', handler: url => {
    requested.push(url.pathname);
    if (url.pathname === '/api/projects/options') return Response.json({ error: 'Tillfälligt nätfel' }, { status: 503 });
    if (url.pathname === '/api/activities') return [activity];
    if (url.pathname === '/api/users') return [user];
    if (url.pathname === '/api/time-entries') return [];
  } });
  const picker = await view.findByRole('combobox', { name: 'Projekt' });
  fireEvent.focus(picker); fireEvent.change(picker, { target: { value: 'Montageprojekt' } });
  fireEvent.click(await view.findByRole('option', { name: /0042 · Montageprojekt/ }));
  fireEvent.click(view.getByRole('button', { name: 'Montage', exact: true }));
  fireEvent.change(view.getByRole('textbox', { name: 'Antal timmar' }), { target: { value: '7,25' } });
  fireEvent.click(view.getByRole('button', { name: 'Spara tidrad' }));
  await waitFor(() => assert.equal(offline.useOfflineStore.getState().pendingEntries.length, 1));
  const saved = offline.useOfflineStore.getState().pendingEntries[0];
  assert.equal(saved.hours, 7.25); assert.equal(saved.ownerUserId, 'u1'); assert.equal(saved.projectId, 'p1');
  assert.ok(requested.includes('/api/projects/options'));
  assert.equal(requested.includes('/api/projects'), false);
});

test('confirming an approval invalidates a previously cached payroll report and week', async () => {
  let approved = false;
  const lock = { id: 'w1', userId: 'u2', user: { id: 'u2', name: 'Annan person' }, status: 'SUBMITTED', weekStartDate: '2026-10-05', totalHours: 40, isCompleteForApproval: true };
  const { view, cache } = setup(Approval, { path: '/approval', handler: (url, options) => {
    if (url.pathname === '/api/week-locks') return [{ ...lock, status: approved ? 'APPROVED' : 'SUBMITTED' }];
    if (url.pathname === '/api/time-entries/week/2026-10-05') return { entries: team().users[0].entries, summary: { totalHours: 40 } };
    if (url.pathname === '/api/week-locks/w1/approve') { assert.equal(options.method, 'POST'); approved = true; return { ...lock, status: 'APPROVED' }; }
  } });
  cache.setQueryData(['report', 'payroll', '2026-10'], { previous: true });
  cache.setQueryData(['week', '2026-10-05'], { weekLock: lock });
  fireEvent.click(await view.findByRole('button', { name: 'Annan person' }));
  const table = view.getByRole('region', { name: 'Veckor som väntar på attest' });
  await waitFor(() => assert.equal(within(table).getAllByRole('button', { name: 'Godkänn', exact: true })[0].disabled, false));
  fireEvent.click(within(table).getAllByRole('button', { name: 'Godkänn', exact: true })[0]);
  const dialog = view.getByRole('dialog', { name: 'Godkänn vecka' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Godkänn vecka' }));
  await waitFor(() => assert.equal(approved, true));
  assert.equal(cache.getQueryState(['report', 'payroll', '2026-10']).isInvalidated, true);
  assert.equal(cache.getQueryState(['week', '2026-10-05']).isInvalidated, true);
});
