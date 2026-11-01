import { useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { PlanningDocument, PlanningWeek } from '../types/planning';
import { staffingOverview } from '../utils/planningOverview';

export default function PlanningStaffing({ week, jobs, draft }: { week: PlanningWeek; jobs: PlanningDocument['jobs']; draft: boolean }) {
  const [selection, setSelection] = useState('all');
  const days = selection === 'all' ? [0, 1, 2, 3, 4] : [Number(selection)];
  const result = staffingOverview(week, jobs, days);
  const dayLabel = (day: number) => format(addDays(parseISO(week.startDate), day), 'EEEE d/M', { locale: sv });
  return <section aria-labelledby="staffing-title" className="planning-staffing">
    <h3 id="staffing-title" className="font-semibold">Bemanningskoll</h3>
    <p className="mt-1 text-sm text-graphite-600">{draft ? 'Visar ditt osparade utkast.' : 'Visar den publicerade planen.'} Flera jobb samma dag kan vara avsiktligt. Jobbens deadline bedöms inte här.</p>
    <label className="my-3 block max-w-sm"><span className="label">Bemanning för</span><select className="input" value={selection} onChange={event => setSelection(event.target.value)}><option value="all">Hela valda veckan</option>{[0, 1, 2, 3, 4].map(day => <option key={day} value={day}>{dayLabel(day)}</option>)}</select></label>
    <div className="planning-staffing-columns">
      <section><h4 className="font-semibold">Ingen tilldelning i urvalet</h4>{result.unassigned.length ? <ul className="mt-2 list-inside list-disc">{result.unassigned.map(job => <li key={job.name}>{job.name}</li>)}</ul> : <p className="mt-2 text-sm">Inga entydiga jobb utan tilldelning i urvalet.</p>}</section>
      <section><h4 className="font-semibold">Flera jobb samma dag</h4>{result.multiple.length ? <ul className="mt-2 space-y-2">{result.multiple.map((item, index) => <li key={index}><strong>{item.person}</strong> · {dayLabel(item.day)}<p className="whitespace-pre-wrap">{item.jobs.join(', ')}</p></li>)}</ul> : <p className="mt-2 text-sm">Ingen person har flera entydiga jobbtilldelningar samma dag i urvalet.</p>}</section>
    </div>
    {(result.manual.length > 0 || result.ambiguous.length > 0) && <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Kontrollera manuellt ({result.manual.length + result.ambiguous.length})</summary><p className="mb-2 text-sm text-graphite-600">Fri dagtext, saknade jobb och dubbla jobbnamn kan inte räknas säkert som bemanning.</p><ul className="space-y-2">{result.ambiguous.map(name => <li key={name}>Jobbnamnet är tomt eller inte unikt: {name}</li>)}{result.manual.map((item, index) => <li key={index}><strong>{item.person}</strong> · {dayLabel(item.day)}<p className="whitespace-pre-wrap">{item.text}</p></li>)}</ul></details>}
  </section>;
}
