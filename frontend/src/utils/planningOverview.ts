import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import type { PlanningDocument, PlanningWeek } from '../types/planning';

export function stockholmDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function nextWeekday(date: string) {
  let next = addDays(parseISO(date), 1);
  while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
  return format(next, 'yyyy-MM-dd');
}

export function personalDay(document: PlanningDocument, userId: string, date: string) {
  const day = (parseISO(date).getDay() + 6) % 7;
  if (day > 4) return { status: 'weekend' as const };
  const week = document.weeks.find(item => item.startDate === format(startOfISOWeek(parseISO(date)), 'yyyy-MM-dd'));
  if (!week) return { status: 'no-week' as const };
  const people = week.people.filter(person => person.userId === userId);
  if (people.length !== 1) return { status: 'unlinked' as const };
  return { status: 'ready' as const, text: people[0].days[day], jobs: people[0].assignments?.[day] ?? [], note: week.note };
}

// Compare the published personal plan, independent of today's date and others' edits.
export function personalPlanSignature(document: PlanningDocument, userId: string) {
  const weeks = document.weeks.filter(week => week.people.some(person => person.userId === userId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(week => ({ date: week.startDate, note: week.note, people: week.people.filter(person => person.userId === userId).map(person => ({
      days: person.days, assignments: Array.from({ length: 5 }, (_, day) => [...(person.assignments?.[day] ?? [])].sort()),
    })) }));
  return JSON.stringify(weeks);
}

export function staffingOverview(week: PlanningWeek, jobs: PlanningDocument['jobs'], days: number[]) {
  const counts = new Map<string, number>();
  jobs.forEach(job => { const name = job.name.trim(); counts.set(name, (counts.get(name) ?? 0) + 1); });
  const unique = (name: string) => Boolean(name) && counts.get(name) === 1;
  const assigned = new Set<string>();
  const multiple: { person: string; day: number; jobs: string[] }[] = [];
  const manual: { person: string; day: number; text: string }[] = [];
  for (const person of week.people) for (const day of days) {
    const text = person.days[day];
    const names = new Set(person.assignments?.[day] ?? []);
    if (unique(text)) names.add(text);
    else if (text.trim()) manual.push({ person: person.name, day, text });
    const known = [...names].filter(unique);
    known.forEach(name => assigned.add(name));
    const unknown = [...names].filter(name => !unique(name));
    if (unknown.length) manual.push({ person: person.name, day, text: `Tilldelning utan entydigt jobb: ${unknown.join(', ')}` });
    if (known.length > 1) multiple.push({ person: person.name, day, jobs: known });
  }
  return {
    unassigned: jobs.filter(job => unique(job.name.trim()) && !assigned.has(job.name.trim())),
    ambiguous: [...counts].filter(([name, count]) => !name || count > 1).map(([name]) => name || 'Jobb utan namn'),
    multiple, manual,
  };
}
