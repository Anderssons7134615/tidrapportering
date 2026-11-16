import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let vite, board, validPlanningAssignments;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  board = await vite.ssrLoadModule('/src/utils/planningBoard.ts');
  ({ validPlanningAssignments } = await vite.ssrLoadModule('/src/utils/planningAssignments.ts'));
});
after(async () => { await vite?.close(); });

const doc = () => ({
  weeks: [{ startDate: '2026-11-16', note: 'Not', people: [
    { name: 'Kalle', userId: 'u-1', days: ['Fritext', '', '', '', ''] },
    { name: 'Inhyrd', days: ['', '', '', '', ''], assignments: [['Jobb A'], [], [], [], []] },
  ] }],
  jobs: [{ name: 'Jobb A', details: '', deadline: '' }, { name: 'Jobb B', details: '', deadline: '' }],
  issues: '',
});
const weeks = ['2026-11-16', '2026-11-23'];

test('set replaces jobs on every selected day, keeps day text and never touches other cells', () => {
  const original = doc();
  const rows = board.boardRows(original, weeks);
  const cells = [0, 1, 2].map(day => ({ rowKey: 'u:u-1', week: '2026-11-16', day }));
  const { document, changed } = board.applyOperation(original, cells, rows, { type: 'set', job: 'Jobb B' });
  assert.equal(changed, 3);
  const kalle = document.weeks[0].people[0];
  assert.deepEqual(kalle.assignments, [['Jobb B'], ['Jobb B'], ['Jobb B'], [], []]);
  assert.equal(kalle.days[0], 'Fritext');
  assert.deepEqual(document.weeks[0].people[1], original.weeks[0].people[1]);
  assert.ok(validPlanningAssignments(kalle.assignments));
  assert.equal(original.weeks[0].people[0].assignments, undefined, 'input document is not mutated');
});

test('add keeps existing jobs, remove and clear only affect selected days', () => {
  const rows = board.boardRows(doc(), weeks);
  const cell = { rowKey: 'n:inhyrd', week: '2026-11-16', day: 0 };
  let { document } = board.applyOperation(doc(), [cell], rows, { type: 'add', job: 'Jobb B' });
  assert.deepEqual(document.weeks[0].people[1].assignments[0], ['Jobb A', 'Jobb B']);
  ({ document } = board.applyOperation(document, [cell], rows, { type: 'remove', job: 'Jobb A' }));
  assert.deepEqual(document.weeks[0].people[1].assignments[0], ['Jobb B']);
  ({ document } = board.applyOperation(document, [{ rowKey: 'u:u-1', week: '2026-11-16', day: 0 }], rows, { type: 'clear' }));
  assert.equal(document.weeks[0].people[0].days[0], '');
  assert.deepEqual(document.weeks[0].people[1].assignments[0], ['Jobb B']);
});

test('unchanged operations return the same document and report no change', () => {
  const original = doc();
  const rows = board.boardRows(original, weeks);
  const result = board.applyOperation(original, [{ rowKey: 'n:inhyrd', week: '2026-11-16', day: 0 }], rows, { type: 'add', job: 'Jobb A' });
  assert.equal(result.changed, 0);
  assert.equal(result.document, original);
  assert.equal(board.applyOperation(original, [{ rowKey: 'u:u-1', week: '2026-11-16', day: 1 }], rows, { type: 'set', job: '  ' }).document, original);
});

test('assigning into a missing week creates it with the same people and only the chosen day', () => {
  const rows = board.boardRows(doc(), weeks);
  const { document } = board.applyOperation(doc(), [{ rowKey: 'u:u-1', week: '2026-11-23', day: 4 }], rows, { type: 'set', job: 'Jobb A' });
  const created = document.weeks.find(week => week.startDate === '2026-11-23');
  assert.deepEqual(created.people.map(person => person.name), ['Kalle', 'Inhyrd']);
  assert.equal(created.people[0].userId, 'u-1');
  assert.deepEqual(created.people[0].assignments, [[], [], [], [], ['Jobb A']]);
  assert.equal(created.people[1].assignments, undefined);
  assert.deepEqual(document.weeks.map(week => week.startDate), ['2026-11-16', '2026-11-23']);
});

test('copy week duplicates people, jobs and text but keeps the target note', () => {
  let document = board.createWeek(doc(), '2026-11-23', []);
  document.weeks[1].note = 'Behåll';
  document = board.copyWeek(document, '2026-11-16', '2026-11-23');
  assert.deepEqual(document.weeks[1].people, doc().weeks[0].people);
  assert.equal(document.weeks[1].note, 'Behåll');
  document.weeks[1].people[0].days[0] = 'ändrad';
  assert.equal(document.weeks[0].people[0].days[0], 'Fritext', 'copy is deep');
  const missing = doc();
  assert.equal(board.copyWeek(missing, '2026-11-09', '2026-11-16'), missing);
});

test('repeated unlinked names stay separate rows and people are added without duplicates', () => {
  const twins = { weeks: [{ startDate: '2026-11-16', note: '', people: [{ name: 'Anna', days: ['a', '', '', '', ''] }, { name: 'anna ', days: ['b', '', '', '', ''] }] }], jobs: [], issues: '' };
  const rows = board.boardRows(twins, weeks);
  assert.deepEqual(rows.map(row => row.key), ['n:anna', 'n:anna#2']);
  const { document } = board.applyOperation(twins, [{ rowKey: 'n:anna#2', week: '2026-11-16', day: 0 }], rows, { type: 'text', text: 'Ledig' });
  assert.deepEqual(document.weeks[0].people.map(person => person.days[0]), ['a', 'Ledig']);
  const added = board.addPeople(doc(), weeks, board.boardRows(doc(), weeks), [{ name: 'Kalle', userId: 'u-1' }, { name: 'Nisse', userId: 'u-2' }, { name: 'inhyrd' }]);
  assert.deepEqual(added.weeks[0].people.map(person => person.name), ['Kalle', 'Inhyrd', 'Nisse']);
  const removed = board.removePerson(added, weeks, 'u:u-2');
  assert.deepEqual(removed.weeks[0].people.map(person => person.name), ['Kalle', 'Inhyrd']);
});

test('ranges span rows and both weeks, project names and job lists stay unique', () => {
  const rows = board.boardRows(doc(), weeks);
  const range = board.cellRange({ rowKey: 'u:u-1', week: '2026-11-16', day: 3 }, { rowKey: 'n:inhyrd', week: '2026-11-23', day: 1 }, rows, weeks);
  assert.equal(range.length, 8);
  assert.deepEqual(range.slice(0, 4).map(cell => `${cell.week}:${cell.day}`), ['2026-11-16:3', '2026-11-16:4', '2026-11-23:0', '2026-11-23:1']);
  assert.equal(board.projectJobName({ code: 'P1001', name: 'Ica Maxi' }), 'P1001 Ica Maxi');
  const withJob = board.addJob(doc(), ' Jobb A ');
  assert.equal(withJob.jobs.length, 2, 'existing job name is not duplicated');
  assert.deepEqual(board.uniqueJobNames({ ...doc(), jobs: [...doc().jobs, { name: 'Jobb A', details: '', deadline: '' }] }), ['Jobb B']);
  assert.equal(board.cellId(board.parseCellId('2026-11-16|2|n:a|b')), '2026-11-16|2|n:a|b');
});

test('day text is capped at the server limit', () => {
  const rows = board.boardRows(doc(), weeks);
  const { document } = board.applyOperation(doc(), [{ rowKey: 'u:u-1', week: '2026-11-16', day: 1 }], rows, { type: 'text', text: 'x'.repeat(900) });
  assert.equal(document.weeks[0].people[0].days[1].length, 500);
});

test('legacy day text equal to a job counts as that job: set replaces it, remove clears it, usage counts it', () => {
  const legacy = doc();
  legacy.weeks[0].people[0].days[0] = 'Jobb A';
  const rows = board.boardRows(legacy, weeks);
  const cell = [{ rowKey: 'u:u-1', week: '2026-11-16', day: 0 }];
  assert.deepEqual(board.dayJobs(legacy.weeks[0].people[0], 0, ['Jobb A', 'Jobb B']), ['Jobb A']);
  assert.equal(board.jobUsage(legacy, weeks).get('Jobb A'), 2);
  const set = board.applyOperation(legacy, cell, rows, { type: 'set', job: 'Jobb B' }).document.weeks[0].people[0];
  assert.equal(set.days[0], '');
  assert.deepEqual(set.assignments[0], ['Jobb B']);
  const removed = board.applyOperation(legacy, cell, rows, { type: 'remove', job: 'Jobb A' }).document.weeks[0].people[0];
  assert.equal(removed.days[0], '');
  assert.equal(board.applyOperation(legacy, cell, rows, { type: 'add', job: 'Jobb A' }).changed, 0);
  const plain = board.applyOperation(doc(), cell, rows, { type: 'set', job: 'Jobb B' }).document.weeks[0].people[0];
  assert.equal(plain.days[0], 'Fritext', 'free text that is not a job name is kept');
});

test('Ledig quick action clears the day jobs but plain text keeps them', () => {
  const rows = board.boardRows(doc(), weeks);
  const cell = [{ rowKey: 'n:inhyrd', week: '2026-11-16', day: 0 }];
  const ledig = board.applyOperation(doc(), cell, rows, { type: 'text', text: 'Ledig', clearJobs: true }).document.weeks[0].people[1];
  assert.equal(ledig.days[0], 'Ledig');
  assert.equal(ledig.assignments, undefined);
  const note = board.applyOperation(doc(), cell, rows, { type: 'text', text: 'Hämta lift' }).document.weeks[0].people[1];
  assert.deepEqual(note.assignments[0], ['Jobb A']);
});
