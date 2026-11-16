import { addDays, format, parseISO } from 'date-fns';
import type { PlanningDocument, PlanningWeek } from '../types/planning';

// Pure helpers for the two-week planning board. The document format is unchanged:
// the board only edits weeks[].people[].assignments/days through these functions.

export type PlanningPerson = PlanningWeek['people'][number];
export type BoardRow = { key: string; name: string; userId?: string };
export type BoardCell = { rowKey: string; week: string; day: number };
export type BoardOperation =
  | { type: 'set'; job: string }
  | { type: 'add'; job: string }
  | { type: 'remove'; job: string }
  | { type: 'clear' }
  | { type: 'text'; text: string; clearJobs?: boolean };

export const MAX_DAY_TEXT = 500;
export const MAX_JOB_NAME = 200;
export const MAX_ASSIGNMENTS = 200;

const emptyDays = () => ['', '', '', '', ''];
const baseKey = (person: { name: string; userId?: string }) => person.userId ? `u:${person.userId}` : `n:${person.name.trim().toLocaleLowerCase('sv')}`;

/** Stable row keys for a week. Repeated unlinked names get an occurrence suffix so they never merge. */
export function weekKeys(week: PlanningWeek) {
  const seen = new Map<string, number>();
  return week.people.map(person => {
    const key = baseKey(person);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count > 1 ? `${key}#${count}` : key;
  });
}

export function findPerson(week: PlanningWeek, rowKey: string) {
  return weekKeys(week).indexOf(rowKey);
}

export function boardWeeks(start: string, count = 2) {
  return Array.from({ length: count }, (_, index) => format(addDays(parseISO(start), index * 7), 'yyyy-MM-dd'));
}

export function boardRows(document: PlanningDocument, weekStarts: string[]): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  for (const start of weekStarts) {
    const week = document.weeks.find(item => item.startDate === start);
    if (!week) continue;
    weekKeys(week).forEach((key, index) => {
      const person = week.people[index];
      if (!rows.has(key)) rows.set(key, { key, name: person.name, ...(person.userId ? { userId: person.userId } : {}) });
    });
  }
  return [...rows.values()];
}

export function cellId(cell: BoardCell) { return `${cell.week}|${cell.day}|${cell.rowKey}`; }
export function parseCellId(id: string): BoardCell {
  const [week, day, ...rest] = id.split('|');
  return { week, day: Number(day), rowKey: rest.join('|') };
}

function sortWeeks(document: PlanningDocument) {
  document.weeks.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return document;
}

function newPerson(row: Pick<BoardRow, 'name' | 'userId'>): PlanningPerson {
  return { name: row.name, ...(row.userId ? { userId: row.userId } : {}), days: emptyDays() };
}

function ensureWeek(document: PlanningDocument, startDate: string, rows: BoardRow[]) {
  let week = document.weeks.find(item => item.startDate === startDate);
  if (!week) {
    week = { startDate, note: '', people: rows.map(newPerson) };
    document.weeks.push(week);
    sortWeeks(document);
  }
  return week;
}

/** Create an empty week containing the given people. Returns the document unchanged if it exists. */
export function createWeek(document: PlanningDocument, startDate: string, rows: BoardRow[]): PlanningDocument {
  if (document.weeks.some(week => week.startDate === startDate)) return document;
  const next = structuredClone(document);
  ensureWeek(next, startDate, rows);
  return next;
}

/** Replace the people of `to` with a full copy of `from` (names, links, jobs and day text). The note is kept. */
export function copyWeek(document: PlanningDocument, from: string, to: string): PlanningDocument {
  const source = document.weeks.find(week => week.startDate === from);
  if (!source || from === to) return document;
  const next = structuredClone(document);
  const people = structuredClone(source.people);
  const target = next.weeks.find(week => week.startDate === to);
  if (target) target.people = people;
  else { next.weeks.push({ startDate: to, note: '', people }); sortWeeks(next); }
  return next;
}

export function weekHasContent(week: PlanningWeek | undefined) {
  return Boolean(week?.people.some(person => person.days.some(day => day.trim()) || person.assignments?.some(day => day.length)));
}

/** Jobs on a day: assignments plus legacy day text that is exactly a unique job name. */
export function dayJobs(person: PlanningPerson | undefined, day: number, jobNames: string[]) {
  if (!person) return [];
  const assigned = person.assignments?.[day] ?? [];
  const text = person.days[day] ?? '';
  return jobNames.includes(text) && !assigned.includes(text) ? [...assigned, text] : [...assigned];
}

/** Apply one board action to every selected cell. Missing weeks and person rows are created. */
export function applyOperation(document: PlanningDocument, cells: BoardCell[], rows: BoardRow[], operation: BoardOperation) {
  const next = structuredClone(document);
  const job = 'job' in operation ? operation.job : '';
  if ('job' in operation && (!job.trim() || job.length > MAX_JOB_NAME)) return { document, changed: 0, full: 0 };
  const jobNames = uniqueJobNames(document);
  let changed = 0, full = 0;
  for (const cell of cells) {
    if (cell.day < 0 || cell.day > 4) continue;
    const row = rows.find(item => item.key === cell.rowKey);
    const week = next.weeks.find(item => item.startDate === cell.week) ?? (row ? ensureWeek(next, cell.week, rows) : undefined);
    if (!week) continue;
    let index = findPerson(week, cell.rowKey);
    if (index < 0) {
      if (!row) continue;
      week.people.push(newPerson(row));
      index = week.people.length - 1;
    }
    const person = week.people[index];
    const assignments = Array.from({ length: 5 }, (_, day) => [...(person.assignments?.[day] ?? [])]);
    const before = JSON.stringify([assignments[cell.day], person.days[cell.day]]);
    const current = assignments[cell.day];
    const legacyJob = jobNames.includes(person.days[cell.day]) ? person.days[cell.day] : '';
    const setText = (text: string) => { person.days = person.days.map((value, day) => day === cell.day ? text : value); };
    if (operation.type === 'set') { assignments[cell.day] = [job]; if (legacyJob) setText(''); }
    else if (operation.type === 'add') {
      if (!current.includes(job) && legacyJob !== job) {
        if (current.length >= MAX_ASSIGNMENTS) full += 1;
        else current.push(job);
      }
    } else if (operation.type === 'remove') { assignments[cell.day] = current.filter(name => name !== job); if (legacyJob === job) setText(''); }
    else if (operation.type === 'clear') { assignments[cell.day] = []; setText(''); }
    else { if (operation.clearJobs) assignments[cell.day] = []; setText(operation.text.slice(0, MAX_DAY_TEXT)); }
    if (assignments.some(day => day.length)) person.assignments = assignments;
    else delete person.assignments;
    if (JSON.stringify([assignments[cell.day], person.days[cell.day]]) !== before) changed += 1;
  }
  return { document: changed ? next : document, changed, full };
}

/** Add people to the shown weeks that exist; if none exist, create the first shown week. */
export function addPeople(document: PlanningDocument, weekStarts: string[], rows: BoardRow[], people: Pick<BoardRow, 'name' | 'userId'>[]) {
  const next = structuredClone(document);
  let existing = next.weeks.filter(week => weekStarts.includes(week.startDate));
  if (!existing.length) existing = [ensureWeek(next, weekStarts[0], rows)];
  let added = 0;
  for (const week of existing) {
    for (const person of people) {
      if (!person.name.trim()) continue;
      const linked = person.userId && week.people.some(item => item.userId === person.userId);
      const named = !person.userId && week.people.some(item => !item.userId && item.name.trim().toLocaleLowerCase('sv') === person.name.trim().toLocaleLowerCase('sv'));
      if (linked || named) continue;
      week.people.push(newPerson({ name: person.name.trim().slice(0, 100), userId: person.userId }));
      added += 1;
    }
  }
  return added ? next : document;
}

export function removePerson(document: PlanningDocument, weekStarts: string[], rowKey: string) {
  const next = structuredClone(document);
  let removed = false;
  for (const week of next.weeks) {
    if (!weekStarts.includes(week.startDate)) continue;
    const index = findPerson(week, rowKey);
    if (index >= 0) { week.people.splice(index, 1); removed = true; }
  }
  return removed ? next : document;
}

export function uniqueJobNames(document: PlanningDocument) {
  const counts = new Map<string, number>();
  for (const job of document.jobs) { const name = job.name.trim(); if (name) counts.set(name, (counts.get(name) ?? 0) + 1); }
  return document.jobs.map(job => job.name.trim()).filter(name => counts.get(name) === 1);
}

export function addJob(document: PlanningDocument, name: string, details = ''): PlanningDocument {
  const clean = name.trim().slice(0, MAX_JOB_NAME).trim();
  if (!clean || document.jobs.some(job => job.name.trim() === clean)) return document;
  return { ...document, jobs: [...document.jobs, { name: clean, details: details.slice(0, 5000), deadline: '' }] };
}

/** Person-days per job name in the shown weeks. */
export function jobUsage(document: PlanningDocument, weekStarts: string[]) {
  const usage = new Map<string, number>();
  const jobNames = uniqueJobNames(document);
  for (const week of document.weeks) {
    if (!weekStarts.includes(week.startDate)) continue;
    for (const person of week.people) for (let day = 0; day < 5; day += 1) for (const name of dayJobs(person, day, jobNames)) usage.set(name, (usage.get(name) ?? 0) + 1);
  }
  return usage;
}

export function projectJobName(project: { code: string; name: string }) {
  return `${project.code} ${project.name}`.trim().slice(0, MAX_JOB_NAME).trim();
}

/** Rectangle between two cells, using the board's row order and the 10 visible day columns. */
export function cellRange(a: BoardCell, b: BoardCell, rows: BoardRow[], weekStarts: string[]): BoardCell[] {
  const column = (cell: BoardCell) => weekStarts.indexOf(cell.week) * 5 + cell.day;
  const rowIndex = (cell: BoardCell) => rows.findIndex(row => row.key === cell.rowKey);
  const [r1, r2] = [rowIndex(a), rowIndex(b)].sort((x, y) => x - y);
  const [c1, c2] = [column(a), column(b)].sort((x, y) => x - y);
  if (r1 < 0 || c1 < 0) return [b];
  const cells: BoardCell[] = [];
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) cells.push({ rowKey: rows[r].key, week: weekStarts[Math.floor(c / 5)], day: c % 5 });
  return cells;
}
