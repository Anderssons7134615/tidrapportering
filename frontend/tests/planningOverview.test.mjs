import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

let dom, vite, overview, MyPlanning, Staffing, render, fireEvent, cleanup, within;
const person = { name: 'Samma namn', userId: 'u1', days: ['A', '', '', '', 'Fredagsjobb'] };
const plan = { weeks: [
  { startDate: '2026-10-26', note: 'Preliminär vecka', people: [person, { name: 'Samma namn', userId: 'u2', days: ['Hemlig förnamnsgissning', '', '', '', ''] }] },
  { startDate: '2026-11-02', note: '', people: [{ ...person, days: ['Måndagsjobb', '', '', '', ''] }] },
], jobs: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], issues: '' };
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  ({ render, fireEvent, cleanup, within } = await import('@testing-library/react'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  overview = await vite.ssrLoadModule('/src/utils/planningOverview.ts');
  ({ default: MyPlanning } = await vite.ssrLoadModule('/src/components/MyPlanning.tsx'));
  ({ default: Staffing } = await vite.ssrLoadModule('/src/components/PlanningStaffing.tsx'));
});
afterEach(() => { cleanup(); localStorage.clear(); });
after(async () => { await vite.close(); dom.window.close(); });

test('Stockholm dates, weekends and year boundaries use the actual day and week', () => {
  assert.equal(overview.stockholmDate(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
  assert.equal(overview.stockholmDate(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
  for (const date of ['2026-10-30', '2026-10-31', '2026-11-01']) assert.equal(overview.nextWeekday(date), '2026-11-02');
  assert.equal(overview.nextWeekday('2026-12-31'), '2027-01-01');
  assert.equal(overview.nextWeekday('2027-01-01'), '2027-01-04');
  assert.equal(overview.personalDay(plan, 'u1', '2026-10-30').text, 'Fredagsjobb');
  assert.equal(overview.personalDay(plan, 'u1', '2026-11-02').text, 'Måndagsjobb');
  assert.equal(overview.personalDay(plan, 'u1', '2026-11-01').status, 'weekend');
  assert.equal(overview.personalDay(plan, 'u1', '2026-11-09').status, 'no-week');
  assert.equal(overview.personalDay(plan, 'unlinked', '2026-10-26').status, 'unlinked');
  const newYear = { ...plan, weeks: [{ ...plan.weeks[0], startDate: '2026-12-28' }, { ...plan.weeks[1], startDate: '2027-01-04' }] };
  assert.equal(overview.personalDay(newYear, 'u1', '2027-01-01').text, 'Fredagsjobb');
  assert.equal(overview.personalDay(newYear, 'u1', '2027-01-04').text, 'Måndagsjobb');
});

test('personal plan matches account IDs and only marks published personal changes unread', () => {
  const props = { document: structuredClone(plan), userId: 'u1', companyId: 'company-a', today: '2026-10-30' };
  const view = render(React.createElement(MyPlanning, props));
  assert.ok(view.getByText('Fredagsjobb'));
  assert.ok(view.getByText('Måndagsjobb'));
  assert.equal(view.queryByText('Hemlig förnamnsgissning'), null);
  fireEvent.click(view.getByRole('button', { name: 'Markera min plan som läst' }));
  assert.ok(view.getByText('Din plan är markerad som läst.'));
  const unlinked = structuredClone(props.document);
  unlinked.weeks.forEach(week => week.people.forEach(person => { delete person.userId; }));
  view.rerender(React.createElement(MyPlanning, { ...props, document: unlinked }));
  assert.ok(view.getByText('Din planeringsrad är inte kopplad till ditt konto. Be en administratör koppla den.'));
  assert.equal(view.queryByRole('button', { name: 'Markera min plan som läst' }), null);
  view.rerender(React.createElement(MyPlanning, props));
  props.document.weeks[0].people[1].days[0] = 'Kollegans nya jobb';
  view.rerender(React.createElement(MyPlanning, { ...props, today: '2026-10-31' }));
  assert.ok(view.getByText('Din plan är markerad som läst.'));
  assert.ok(view.getByText('Helg. Veckoplanen omfattar måndag–fredag.'));
  props.document.weeks[1].people[0].days[0] = 'Ändrat måndagsjobb';
  view.rerender(React.createElement(MyPlanning, props));
  assert.ok(view.getByText('Din plan har ändrats sedan du markerade den som läst.'));
  assert.ok(view.getByText('Ändrat måndagsjobb'));
  view.rerender(React.createElement(MyPlanning, { ...props, companyId: 'company-b' }));
  assert.ok(view.getByText('Du har en plan att läsa.'));
  view.rerender(React.createElement(MyPlanning, { ...props, userId: 'u2' }));
  assert.ok(view.getByText('Du har en plan att läsa.'));
  view.rerender(React.createElement(MyPlanning, { ...props, userId: 'missing' }));
  assert.ok(view.getByText('Din planeringsrad är inte kopplad till ditt konto. Be en administratör koppla den.'));
  assert.equal(view.queryByText('Fredagsjobb'), null);
});

test('blocked storage preserves unread state and provides a retryable error', () => {
  const original = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = () => { throw new Error('blocked'); };
  try {
    const view = render(React.createElement(MyPlanning, { document: plan, userId: 'u1', companyId: 'a', today: '2026-10-26' }));
    fireEvent.click(view.getByRole('button', { name: 'Markera min plan som läst' }));
    assert.match(view.getByRole('alert').textContent, /kunde inte sparas/);
    assert.ok(view.getByText('Du har en plan att läsa.'));
    window.Storage.prototype.setItem = original;
    fireEvent.click(view.getByRole('button', { name: 'Markera min plan som läst' }));
    assert.ok(view.getByText('Din plan är markerad som läst.'));
  } finally { window.Storage.prototype.setItem = original; }
});

test('a long weekly note is shown once and collapsed when both personal days share a week', () => {
  const view = render(React.createElement(MyPlanning, { document: plan, userId: 'u1', companyId: 'a', today: '2026-10-26' }));
  const notes = view.getAllByText('Preliminär vecka');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].closest('details').open, false);
});

test('staffing counts exact unique jobs, retains ambiguous text and never interprets multiple jobs as an error', () => {
  const jobs = [...plan.jobs, { name: 'Dubbelt' }, { name: 'Dubbelt' }];
  const week = { ...plan.weeks[0], people: [
    { ...person, days: ['A', 'A och B', '', '', ''], assignments: [['A', 'B'], ['C', 'Borttaget'], [], [], []] },
    { name: 'Annan', days: ['Dubbelt', '', '', '', ''] },
  ] };
  const monday = overview.staffingOverview(week, jobs, [0]);
  assert.deepEqual(monday.unassigned.map(job => job.name), ['C']);
  assert.deepEqual(monday.multiple[0].jobs, ['A', 'B']);
  assert.equal(monday.multiple.length, 1);
  assert.deepEqual(monday.ambiguous, ['Dubbelt']);
  const all = overview.staffingOverview(week, jobs, [0, 1, 2, 3, 4]);
  assert.deepEqual(all.unassigned, []);
  assert.ok(all.manual.some(item => item.text === 'A och B'));
  assert.ok(all.manual.some(item => item.text.includes('Borttaget')));
  const view = render(React.createElement(Staffing, { week, jobs, draft: true }));
  assert.match(view.getByText(/Visar ditt osparade utkast/).textContent, /Flera jobb samma dag kan vara avsiktligt/);
  fireEvent.change(view.getByLabelText('Bemanning för'), { target: { value: '0' } });
  const missing = view.getByRole('heading', { name: 'Ingen tilldelning i urvalet' }).parentElement;
  assert.ok(within(missing).getByText('C'));
  fireEvent.change(view.getByLabelText('Bemanning för'), { target: { value: '1' } });
  assert.ok(within(missing).getByText('A'));
  assert.ok(within(missing).getByText('B'));
  assert.equal(view.queryByRole('alert'), null);
});
