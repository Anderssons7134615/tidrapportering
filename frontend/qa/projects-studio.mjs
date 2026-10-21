// Local-only visual regression check. All API traffic uses synthetic fixtures.
// Requires playwright and axe-core (they may be installed outside the app via NODE_PATH).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axe = require('axe-core');
const output = fileURLToPath(new URL('../../docs/qa/projects-studio/', import.meta.url));
await mkdir(output, { recursive: true });
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
  ...(process.env.QA_BROWSER_ARGS ? { args: JSON.parse(process.env.QA_BROWSER_ARGS) } : {}),
});
const report = { browser: browser.version(), fixtures: 'Synthetic local data; no production API calls', checks: [], screenshots: [], accessibility: [] };
const customer = { id: 'customer-1', name: 'Björkdal Fastigheter' };
const userFor = (role) => ({ id: 'user-1', name: 'Testledare', role, active: true, companyId: 'company-qa', companyName: 'Anderssons Isolering' });
const task = { id: 'task-1', projectId: 'project-1', title: 'Kontrollera genomföringar före inklädnad', assigneeId: 'user-1', assignee: { id: 'user-1', name: 'Testledare' }, status: 'IN_PROGRESS', priority: 'NORMAL', dueDate: '2026-10-23', deadlineBucket: 'UPCOMING' };
const records = [
  ['project-1', '0085', 'Björkdalsskolan', customer, 'ONGOING', 'Hus A · Teknikrum'],
  ['project-2', '0091', 'Fjärrvärmecentral Väster', customer, 'PLANNED', 'Källarplan'],
  ['project-3', '0078', 'Ventilation · Kontorshuset', customer, 'COMPLETED', 'Plan 3'],
  ['project-4', '0092', 'Rörstråk etapp 2', { id: 'customer-2', name: 'Söderängens Rör' }, 'ONGOING', 'Verkstad'],
  ['project-5', '0093', 'Brandisolering', { id: 'customer-3', name: 'Lindholms Ventilation' }, 'ONGOING', 'Hus B'],
  ['project-6', '0094', 'Plåtarbeten', { id: 'customer-4', name: 'Kustens Bygg & Installation' }, 'PLANNED', 'Tak'],
  ['project-7', '0095', 'Verkstaden', null, 'ONGOING', 'Laholm'],
  ['project-8', '0062', 'Tidigare etapp', customer, 'COMPLETED', 'Hus A'],
].map(([id, code, name, customer, status, site]) => ({ id, code, name, customer, customerId: customer?.id ?? null, status, site, active: id !== 'project-8', billingModel: 'HOURLY', tasks: id === 'project-1' ? [task] : [], nextTask: id === 'project-1' ? task : null, overdueCount: 0, dueTodayCount: 0, upcomingCount: id === 'project-1' ? 1 : 0, waitingCount: 0, lastActivityAt: null, economy: { reportedHours: id === 'project-1' ? 126.25 : 0, unapprovedHours: id === 'project-1' ? 6.25 : 0, budgetHours: 240, budgetUsagePercent: 52.6, warnings: [] } }));

async function setup(role = 'ADMIN', viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
  await context.addInitScript((user) => localStorage.setItem('tidapp-auth', JSON.stringify({ state: { token: 'local-qa-token', user }, version: 0 })), userFor(role));
  const errors = [], unexpected = [];
  let failure = false, longNames = false, delay = 0, editorDelay = 0;
  const editorReads = [];
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api')) return route.continue();
    if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    let data;
    if (url.pathname === '/api/auth/me') data = userFor(role);
    else if (url.pathname === '/api/users') data = [userFor(role)];
    else if (url.pathname === '/api/project-control/projects') {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (failure) return route.fulfill({ status: 503, json: { error: 'Isolerat testfel' } });
      const q = url.searchParams.get('q')?.toLowerCase();
      const items = records.filter((p) => p.active === (url.searchParams.get('active') !== 'false') && (!q || [p.name, p.customer?.name, p.site].some((value) => value?.toLowerCase().includes(q))) && (!url.searchParams.get('projectStatus') || p.status === url.searchParams.get('projectStatus'))).map((p) => longNames ? { ...p, name: 'LångtProjektnamnUtanMellanslag'.repeat(5), customer: p.customer ? { ...p.customer, name: 'FastighetsförvaltningsbolagetMedLångtNamn'.repeat(3) } : null } : p);
      data = { items, summary: { active: items.length, overdue: 0, dueToday: 0, upcoming: 1, invoiceDraftCount: 2 } };
    } else if (url.pathname === '/api/projects/customer-options' || url.pathname === '/api/customers') data = [customer];
    else if (url.pathname === '/api/projects/next-code') data = { code: '0096' };
    else if (/^\/api\/projects\/project-\d+$/.test(url.pathname)) {
      editorReads.push(url.pathname);
      if (editorDelay) await new Promise((resolve) => setTimeout(resolve, editorDelay));
      data = records.find((p) => url.pathname.endsWith(p.id));
    }
    else if (/^\/api\/projects\/project-\d+\/summary$/.test(url.pathname)) data = null;
    else { unexpected.push(url.pathname); return route.fulfill({ status: 500, json: { error: 'Unmocked test request' } }); }
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const goto = async (path = '/projects') => { await page.goto(origin + path); await page.getByRole('heading', { level: 1 }).waitFor(); await page.evaluate(() => document.fonts.ready); };
  return { context, page, goto, errors, unexpected, editorReads, setEditorDelay: (v) => editorDelay = v, setFailure: (v) => failure = v, setLongNames: () => longNames = true, setDelay: (v) => delay = v };
}
async function checkAsyncEditor(s, label) {
  s.setEditorDelay(600);
  const before = s.editorReads.length;
  const trigger = s.page.getByRole('button', { name: 'Redigera 0085 · Björkdalsskolan' });
  await trigger.focus();
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => document.activeElement.getAttribute('aria-disabled') === 'true');
  assert.equal(await s.page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Redigera 0085 · Björkdalsskolan');
  await s.page.keyboard.press('Enter');
  await s.page.getByRole('dialog', { name: 'Redigera projekt' }).waitFor();
  assert.equal(s.editorReads.length - before, 1);
  await s.page.keyboard.press('Escape');
  await s.page.getByRole('dialog', { name: 'Redigera projekt' }).waitFor({ state: 'hidden' });
  assert.equal(await s.page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Redigera 0085 · Björkdalsskolan');
  report.checks.push(`${label}: delayed editor retains/restores focus; repeated Enter sends one GET`);
}
async function checkLayout(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: horizontal overflow`);
  const small = await page.locator('main button, main a, main select, main input').evaluateAll((elements) => elements.filter((el) => el.getClientRects().length && !el.disabled).map((el) => {
    const target = el.type === 'checkbox' ? el.closest('label') : el;
    const r = target.getBoundingClientRect();
    return { name: el.getAttribute('aria-label') || el.textContent || el.type, width: r.width, height: r.height };
  }).filter((r) => r.width < 43.9 || r.height < 43.9));
  assert.deepEqual(small, [], `${label}: targets below 44 × 44`);
  report.checks.push(`${label}: no overflow; targets >= 44 × 44`);
}
async function accessibility(page, label) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.evaluate(axe.source);
  const results = await page.evaluate(() => axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  report.accessibility.push({ label, violations: results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })), incomplete: results.incomplete.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })) });
  assert.equal(results.violations.length, 0, `${label}: ${JSON.stringify(report.accessibility.at(-1).violations)}`);
}
async function shot(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.evaluate(() => window.scrollTo(0, 0));
  // Keep fixed mobile navigation in its real viewport position, not halfway through a stitched image.
  const fullPage = page.viewportSize().width >= 1024;
  if (name === 'mobile-management') await page.locator('.project-control-item').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}${name}.png`, fullPage });
  report.screenshots.push(`${name}.png`);
}
try {
  const s = await setup();
  const { page } = s;
  await s.goto();
  await checkLayout(page, 'Desktop directory');
  await accessibility(page, 'Desktop directory');
  await shot(page, 'desktop-customers');
  await page.getByRole('button', { name: 'Nytt projekt', exact: true }).focus();
  await page.keyboard.press('Enter');
  const createDialog = page.getByRole('dialog', { name: 'Nytt projekt', exact: true });
  await createDialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true);
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    // Native dialogs can yield to browser chrome (body becomes active), but never to background controls.
    assert.equal(await page.evaluate(() => document.activeElement === document.body || document.activeElement.closest('dialog') !== null), true, 'Dialog must exclude background controls');
  }
  await page.keyboard.press('Escape');
  await createDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Nytt projekt', 'Dialog restores trigger focus');
  report.checks.push('New project dialog: tab containment, Escape, trigger focus restored');
  await page.getByRole('link', { name: 'Björkdal Fastigheter 3 aktiva projekt' }).click();
  await page.getByRole('heading', { level: 1, name: customer.name }).waitFor();
  await shot(page, 'desktop-projects');
  await page.getByRole('link', { name: 'Björkdalsskolan 0085 · Pågående' }).click();
  await page.getByRole('heading', { level: 1, name: /Björkdalsskolan/ }).waitFor();
  assert.match(page.url(), /project-1\?customerId=customer-1/);
  report.checks.push('Customer → project detail retains customer context');
  await s.goto('/projects?customerId=customer-1');
  await page.getByRole('button', { name: 'Hantera', exact: true }).click();
  await checkAsyncEditor(s, 'Admin desktop');
  const expand = page.getByRole('button', { name: 'Visa uppgifter för Björkdalsskolan' });
  await expand.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: task.title }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Dölj uppgifter för Björkdalsskolan' }).getAttribute('aria-expanded'), 'true');
  await checkLayout(page, 'Desktop management');
  await accessibility(page, 'Desktop management');
  await shot(page, 'desktop-management');
  const filter = page.getByRole('button', { name: 'Filter', exact: true });
  await filter.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('combobox', { name: 'Visa projekt', exact: true }).evaluate((el) => el === document.activeElement), true);
  const focus = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { outline: s.outlineWidth, shadow: s.boxShadow }; });
  assert.ok(focus.outline !== '0px' || focus.shadow !== 'none');
  await page.getByRole('combobox', { name: 'Filtrera på projektstatus' }).selectOption('PLANNED');
  await page.getByRole('link', { name: /0091.*Fjärrvärmecentral/ }).waitFor();
  await page.getByRole('link', { name: /0085.*Björkdalsskolan/ }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Rensa', exact: true }).click();
  await page.getByRole('link', { name: /0085.*Björkdalsskolan/ }).waitFor();
  await page.getByRole('searchbox').fill('saknas');
  await page.getByText('Inga projekt matchar', { exact: true }).waitFor();
  await checkLayout(page, 'Empty search');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('link', { name: /0085.*Björkdalsskolan/ }).waitFor();
  report.checks.push('Keyboard expansion, filter tab order, visible focus, filter/reset, empty search');
  await s.goto('/projects?archived=1');
  await page.getByRole('link', { name: 'Björkdal Fastigheter 1 arkiverat projekt' }).click();
  assert.match(page.url(), /archived=1/);
  await page.getByRole('button', { name: 'Hantera', exact: true }).click();
  await page.getByRole('button', { name: /Återställ 0062/ }).click();
  await page.getByRole('dialog', { name: 'Återställ 1 projekt?' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  report.checks.push('Archive context, restore confirmation and Escape cancel');
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.unexpected, []);
  await s.context.close();

  for (const width of [390, 320, 768]) {
    const m = await setup('ADMIN', { width, height: 900 });
    await m.goto();
    await checkLayout(m.page, `Directory ${width}px`);
    if (width === 390) await shot(m.page, 'mobile-customers');
    await m.page.getByRole('link', { name: 'Björkdal Fastigheter 3 aktiva projekt' }).click();
    await checkLayout(m.page, `Customer ${width}px`);
    if (width === 390) await shot(m.page, 'mobile-projects');
    await m.page.getByRole('button', { name: 'Hantera', exact: true }).click();
    if (width === 390) await checkAsyncEditor(m, 'Admin mobile');
    await m.page.getByRole('button', { name: /Visa uppgifter för Björkdalsskolan/ }).click();
    await checkLayout(m.page, `Management ${width}px`);
    if (width === 390) { await accessibility(m.page, 'Mobile management'); await shot(m.page, 'mobile-management'); }
    await m.page.getByRole('button', { name: 'Filter', exact: true }).click();
    await checkLayout(m.page, `Filters ${width}px`);
    await m.page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await m.page.locator('#project-filters').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) <= 0.00001));
    if (width === 320) {
      m.setLongNames();
      await m.goto('/projects?customerId=customer-1');
      await m.page.getByRole('button', { name: 'Hantera', exact: true }).click();
      await checkLayout(m.page, '320px long unbroken names');
      await shot(m.page, 'mobile-long-names');
    }
    assert.deepEqual(m.errors, []); assert.deepEqual(m.unexpected, []);
    await m.context.close();
  }
  report.checks.push('Reduced motion disables filter animation');
  const z = await setup('ADMIN', { width: 720, height: 500 });
  // A 1440x1000 window at 200% browser zoom has a 720x500 CSS viewport.
  await z.goto('/projects?customerId=customer-1');
  await z.page.getByRole('button', { name: 'Hantera', exact: true }).click();
  await z.page.getByRole('button', { name: 'Filter', exact: true }).click();
  await checkLayout(z.page, '200% zoom equivalent (720x500 CSS viewport)');
  await shot(z.page, 'zoom-200-reflow');
  assert.deepEqual(z.errors, []); assert.deepEqual(z.unexpected, []);
  await z.context.close();
  for (const role of ['EMPLOYEE', 'SUPERVISOR']) {
    const r = await setup(role);
    await r.goto();
    await r.page.getByRole('button', { name: role === 'EMPLOYEE' ? 'Uppgifter' : 'Hantera', exact: true }).click();
    if (role === 'SUPERVISOR') await checkAsyncEditor(r, 'Supervisor desktop');
    assert.equal(await r.page.getByText('Timmar och underlag').count(), 0);
    assert.equal(await r.page.locator('.project-row-manager').count(), 0);
    await checkLayout(r.page, role);
    await accessibility(r.page, role);
    assert.deepEqual(r.errors, []); assert.deepEqual(r.unexpected, []);
    report.checks.push(`${role}: no cached economic fields or economy column`);
    await r.context.close();
  }
  const e = await setup();
  e.setFailure(true);
  await e.goto();
  await e.page.getByText('Projektkontrollen kunde inte hämtas').waitFor();
  e.setFailure(false);
  await e.page.getByRole('button', { name: /Försök igen/ }).click();
  await e.page.getByRole('link', { name: 'Björkdal Fastigheter 3 aktiva projekt' }).waitFor();
  report.checks.push('API read error and retry recovery');
  assert.deepEqual(e.errors, []); assert.deepEqual(e.unexpected, []);
  await e.context.close();
  const l = await setup('ADMIN', { width: 320, height: 900 });
  l.setDelay(1000);
  await l.page.goto(origin + '/projects');
  await l.page.locator('main .animate-pulse').first().waitFor();
  await checkLayout(l.page, '320px initial loading');
  await l.page.getByRole('link', { name: 'Björkdal Fastigheter 3 aktiva projekt' }).waitFor();
  report.checks.push('Delayed initial load resolves to the directory');
  assert.deepEqual(l.errors, []); assert.deepEqual(l.unexpected, []);
  await l.context.close();
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(`${output}results.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await server.close();
}
