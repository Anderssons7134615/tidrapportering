import { useEffect, useState } from 'react';
import { format, parseISO, startOfISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { PlanningDocument } from '../types/planning';
import { nextWeekday, personalDay, personalPlanSignature } from '../utils/planningOverview';
import { TaskSection } from './ui/design';

type Props = { document: PlanningDocument; userId: string; companyId: string; today: string };
export default function MyPlanning(props: Props) {
  return <PersonalPlan key={`${props.companyId}:${props.userId}`} {...props} />;
}

function PersonalPlan({ document, userId, companyId, today }: Props) {
  const key = `tidapp-planning-read:v1:${companyId}:${userId}`;
  const read = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const [seen, setSeen] = useState(read);
  const [error, setError] = useState('');
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setSeen(read()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  const signature = personalPlanSignature(document, userId);
  const linked = document.weeks.some(week => week.people.some(person => person.userId === userId));
  const changed = linked && seen !== null && seen !== signature;
  const notes = [today, nextWeekday(today)].flatMap(date => {
    const day = personalDay(document, userId, date);
    return day.status === 'ready' && day.note ? [{ week: format(startOfISOWeek(parseISO(date)), 'yyyy-MM-dd'), text: day.note }] : [];
  }).filter((note, index, all) => all.findIndex(item => item.week === note.week) === index);
  return <TaskSection title="Min plan" id="planning-mine">
    <p role="status" className="mb-3 text-sm">{changed ? 'Din plan har ändrats sedan du markerade den som läst.' : linked ? seen === signature ? 'Din plan är markerad som läst.' : 'Du har en plan att läsa.' : 'Din planeringsrad är inte kopplad till ditt konto. Be en administratör koppla den.'}</p>
    <div className="planning-personal-days">{[today, nextWeekday(today)].map((date, index) => {
      const day = personalDay(document, userId, date);
      return <section key={date} aria-label={`${index === 0 ? 'Idag' : 'Nästa vardag'} ${date}`}>
        <h3 className="font-semibold">{index === 0 ? 'Idag' : 'Nästa vardag'} · {format(parseISO(date), 'EEEE d MMM', { locale: sv })}</h3>
        {day.status === 'ready' ? <>
          <p className="mt-2 whitespace-pre-wrap">{day.text || (!day.jobs.length ? 'Inget arbete angivet för dagen.' : '')}</p>
          {day.jobs.filter(job => job !== day.text).length > 0 && <ul className="mt-2 list-inside list-disc whitespace-pre-wrap">{day.jobs.filter(job => job !== day.text).map(job => <li key={job}>{job}</li>)}</ul>}
        </> : <p className="mt-2 text-graphite-600">{day.status === 'weekend' ? 'Helg. Veckoplanen omfattar måndag–fredag.' : day.status === 'no-week' ? 'Ingen plan publicerad för den här veckan.' : 'Ingen personrad är kopplad till ditt konto den här veckan.'}</p>}
      </section>;
    })}</div>
    {notes.map(note => <details key={note.week} className="mt-3"><summary className="min-h-11 cursor-pointer py-3">Veckans anteckning · {format(parseISO(note.week), 'd MMM', { locale: sv })}</summary><p className="whitespace-pre-wrap text-sm text-graphite-600 [overflow-wrap:anywhere]">{note.text}</p></details>)}
    {linked && <div className="mt-3 flex flex-wrap items-center gap-3"><button className="btn-secondary" disabled={seen === signature} onClick={() => {
      try { localStorage.setItem(key, signature); setSeen(signature); setError(''); }
      catch { setError('Läsmarkeringen kunde inte sparas på den här enheten.'); }
    }}>Markera min plan som läst</button><p className="text-sm text-graphite-600">Läsmarkeringen gäller bara den här enheten.</p></div>}
    {error && <p role="alert" className="mt-2">{error}</p>}
    <a className="btn-secondary mt-3" href="#planning-roster">Visa hela veckoplanen</a>
  </TaskSection>;
}
