import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, getISOWeek, getISOWeekYear, parseISO, startOfISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { planningApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { AppShell, PageHeader, TaskSection, EmptyState, FormField, ConfirmDialog } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import type { PlanningDocument, PlanningWeek } from '../types/planning';
import './Planning.css';

const emptyPlan = (): PlanningDocument => ({ weeks: [], jobs: [], issues: '' });
const weekLabel = (value: string) => { const d = parseISO(value); return `V${getISOWeek(d)} · ${format(d, 'd MMM', { locale: sv })}–${format(addDays(d, 4), 'd MMM yyyy', { locale: sv })}`; };
const stamp = (value: string) => new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Stockholm' }).format(new Date(value));

export default function Planning() {
  const user = useAuthStore(state => state.user);
  const admin = user?.role === 'ADMIN';
  const cache = useQueryClient();
  const key = ['planning', user?.companyId];
  const plan = useQuery({ queryKey: key, queryFn: planningApi.get, refetchInterval: 30000 });
  const [draft, setDraft] = useState<PlanningDocument | null>(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState('');
  const [person, setPerson] = useState('');
  const [notice, setNotice] = useState('');
  const [importError, setImportError] = useState('');
  const [commentDirty, setCommentDirty] = useState(false);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setPerson(''); }, [selected]);
  const blocker = useBlocker(Boolean(draft) || commentDirty);
  const content = draft ?? plan.data?.document;
  const weeks = [...(content?.weeks ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const currentMonday = format(startOfISOWeek(new Date()), 'yyyy-MM-dd');
  const week = weeks.find(w => w.startDate === selected) ?? weeks.find(w => w.startDate >= currentMonday) ?? weeks[weeks.length - 1];
  const save = useMutation({
    mutationFn: () => {
      const invalid = validatePlanning(draft!);
      if (invalid) throw new Error(invalid);
      return planningApi.save(revision, draft!);
    },
    onSuccess: saved => { cache.setQueryData(key, saved); setDraft(null); setNotice('Planeringen är sparad och synlig för personalen.'); },
  });
  useEffect(() => { if (save.isError) { saveErrorRef.current?.focus(); saveErrorRef.current?.scrollIntoView({ block: 'center' }); } }, [save.isError, save.error]);
  useEffect(() => {
    if (!draft && !commentDirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draft, commentDirty]);
  const beginEdit = () => { setDraft(structuredClone(plan.data?.document ?? emptyPlan())); setRevision(plan.data?.revision ?? 0); save.reset(); setNotice(''); };
  const changeWeek = (next: PlanningWeek) => setDraft(d => d && ({ ...d, weeks: d.weeks.map(w => w.startDate === week?.startDate ? next : w) }));

  if (plan.isLoading) return <TaskSection><p role="status">Laddar planeringen…</p></TaskSection>;
  if (plan.isError && !draft) return <AppShell><PageHeader title="Planering" /><QueryError title="Planeringen kunde inte hämtas" onRetry={() => void plan.refetch()} /></AppShell>;
  return <AppShell>
    <PageHeader title="Arbetsplanering" description="Se var teamet arbetar och lämna råd eller tips till planeringen." action={admin && !draft ? <button className="btn-primary" onClick={beginEdit}>{plan.data ? 'Redigera planering' : 'Skapa planering'}</button> : undefined} />
    {notice && <p role="status" className="text-sm text-primary-800">{notice}</p>}
    {plan.data && <p className="text-sm text-graphite-600">Uppdaterad {stamp(plan.data.updatedAt)}</p>}
    {content && <nav aria-label="Planeringens avsnitt" className="flex flex-wrap gap-2"><a className="btn-secondary" href="#planning-roster">Veckoplan</a><a className="btn-secondary" href="#planning-issues">Behöver lösas</a><a className="btn-secondary" href="#planning-jobs">Alla jobb</a>{plan.data && <a className="btn-secondary" href="#planning-comments">Kommentarer och tips</a>}</nav>}
    {draft && <form className="planning-save" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <p className="font-semibold">Redigerar planeringen · ändringarna är inte sparade</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Sparar…' : 'Spara planering'}</button>
        <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => { if (window.confirm('Avbryt och lämna dina osparade ändringar?')) { setDraft(null); save.reset(); } }}>Avbryt</button>
      </div>
      {save.isError && <div role="alert" tabIndex={-1} ref={saveErrorRef}><p>{save.error.message}</p><p className="mt-2 text-sm">Ditt utkast finns kvar. Rätta uppgiften och spara igen.</p>{(save.error as Error & { status?: number }).status === 409 && <><button type="button" className="btn-secondary mt-2" onClick={() => void plan.refetch()}>Hämta aktuell plan</button><p className="mt-2 text-sm">Kopiera dina ändringar innan du avbryter och öppnar den aktuella planen.</p></>}</div>}
    </form>}
    {!content && <EmptyState title="Ingen planering publicerad ännu" description="En administratör lägger upp planen här. Sedan kan alla i teamet läsa och kommentera." />}
    <ConfirmDialog open={blocker.state === 'blocked'} title="Lämna osparade ändringar?" description="Din planering eller kommentar har inte publicerats." confirmLabel="Lämna sidan" consequence="Osparade ändringar går förlorade." onClose={() => blocker.state === 'blocked' && blocker.reset()} onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} />
    {content && <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
      <TaskSection title="Veckoplan" id="planning-roster">
        <div className="planning-filters">
          {weeks.length > 0 && <FormField label="Vecka" controlId="planning-week"><select id="planning-week" className="input" value={week?.startDate ?? ''} onChange={e => setSelected(e.target.value)}>{weeks.map(w => <option key={w.startDate} value={w.startDate}>{weekLabel(w.startDate)}</option>)}</select></FormField>}
          {!draft && week && <FormField label="Visa personal" controlId="planning-person"><select id="planning-person" className="input" value={person} onChange={e => setPerson(e.target.value)}><option value="">Alla i teamet</option>{week.people.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}</select></FormField>}
        </div>
        {draft && <AddWeek weeks={weeks} onAdd={w => { setDraft(d => d && ({ ...d, weeks: [...d.weeks, w] })); setSelected(w.startDate); }} />}
        {week ? <>
          <h3 className="mb-3 font-semibold">{weekLabel(week.startDate)}</h3>
          <div className="planning-roster" role="table" aria-label={`Arbetsplanering vecka ${getISOWeek(parseISO(week.startDate))}, ${getISOWeekYear(parseISO(week.startDate))}`}>
            <div className="planning-roster-head" role="row"><span role="columnheader">Personal</span>{Array.from({ length: 5 }, (_, i) => <span role="columnheader" key={i}>{format(addDays(parseISO(week.startDate), i), 'EEE d/M', { locale: sv })}</span>)}</div>
            {week.people.map((p, row) => (!draft && person && person !== p.name) ? null : <div className="planning-person" role="row" key={row}>
              <div role="rowheader" className="planning-person-name">{draft ? <><input className="input" aria-label={`Namn på rad ${row + 1}`} maxLength={100} value={p.name} onChange={e => changeWeek({ ...week, people: week.people.map((v, i) => i === row ? { ...v, name: e.target.value } : v) })} /><button type="button" className="btn-secondary mt-2" onClick={() => { if (window.confirm(`Ta bort ${p.name || 'personen'} från denna vecka?`)) changeWeek({ ...week, people: week.people.filter((_, i) => i !== row) }); }}>Ta bort rad</button></> : p.name}</div>
              {p.days.map((day, col) => <div role="cell" key={col} className="planning-day"><span className="planning-day-label">{format(addDays(parseISO(week.startDate), col), 'EEEE d/M', { locale: sv })}</span>{draft ? <textarea className="input" aria-label={`${p.name || `Rad ${row + 1}`} ${format(addDays(parseISO(week.startDate), col), 'EEEE', { locale: sv })}`} maxLength={500} rows={3} value={day} onChange={e => changeWeek({ ...week, people: week.people.map((v, i) => i === row ? { ...v, days: v.days.map((x, j) => j === col ? e.target.value : x) } : v) })} /> : <span className={!day ? 'text-graphite-600' : ''}>{day || 'Ej planerat'}</span>}</div>)}
            </div>)}
          </div>
          {draft && <button type="button" className="btn-secondary mt-3" onClick={() => changeWeek({ ...week, people: [...week.people, { name: '', days: ['', '', '', '', ''] }] })}>Lägg till person</button>}
          {draft ? <label className="mt-4 block"><span className="label">Veckans anteckning</span><textarea className="input" rows={3} maxLength={5000} value={week.note} onChange={e => changeWeek({ ...week, note: e.target.value })} /></label> : week.note && <p className="mt-4 whitespace-pre-wrap text-sm text-graphite-600">{week.note}</p>}
        </> : <p>Inga veckor tillagda.</p>}
      </TaskSection>
      <TaskSection title="Behöver lösas" id="planning-issues">
        {draft ? <textarea className="input" aria-label="Behöver lösas" rows={8} maxLength={20000} value={draft.issues} onChange={e => setDraft({ ...draft, issues: e.target.value })} /> : <p className="whitespace-pre-wrap leading-relaxed">{content.issues || 'Inga öppna frågor noterade.'}</p>}
      </TaskSection>
      <TaskSection title="Jobb och återstående behov" id="planning-jobs">
        <div className="divide-y divide-graphite-200">{content.jobs.map((job, i) => draft ? <fieldset key={i} className="planning-job"><legend className="sr-only">Jobb {i + 1}</legend>{(['name', 'details', 'deadline'] as const).map((field, j) => <label key={field}><span className="label">{['Jobb / beställare', 'Omfattning och bemanning', 'Tid / deadline'][j]}</span><textarea className="input" rows={j === 0 ? 2 : 3} maxLength={j === 0 ? 200 : j === 1 ? 5000 : 1000} value={job[field]} onChange={e => setDraft({ ...draft, jobs: draft.jobs.map((v, n) => n === i ? { ...v, [field]: e.target.value } : v) })} /></label>)}<button type="button" className="btn-secondary" onClick={() => { if (window.confirm(`Ta bort jobbet ${job.name || '(utan namn)'} ur planeringen?`)) setDraft({ ...draft, jobs: draft.jobs.filter((_, n) => n !== i) }); }}>Ta bort jobb</button></fieldset> : <article key={i} className="planning-job"><h3 className="font-semibold">{job.name}</h3><p className="whitespace-pre-wrap">{job.details}</p><p className="whitespace-pre-wrap text-graphite-600"><span className="sr-only">Tid / deadline: </span>{job.deadline}</p></article>)}</div>
        {draft && <button type="button" className="btn-secondary mt-3" onClick={() => setDraft({ ...draft, jobs: [...draft.jobs, { name: '', details: '', deadline: '' }] })}>Lägg till jobb</button>}
      </TaskSection>
    </fieldset>}
    {draft && !plan.data && <TaskSection title="Läs in en förberedd plan"><label className="label" htmlFor="planning-import">Planeringsfil (.json)</label><input id="planning-import" type="file" accept="application/json,.json" className="input" onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        if (file.size > 1000000) throw new Error('Filen är för stor.');
        const candidate = JSON.parse(await file.text()) as PlanningDocument;
        // The server performs authoritative validation; reject malformed structure before rendering.
        if (!Array.isArray(candidate.weeks) || !Array.isArray(candidate.jobs) || typeof candidate.issues !== 'string'
          || candidate.weeks.some(w => !/^\d{4}-\d{2}-\d{2}$/.test(w.startDate) || !Number.isFinite(parseISO(w.startDate).getTime()) || typeof w.note !== 'string' || !Array.isArray(w.people) || w.people.some(p => typeof p.name !== 'string' || !Array.isArray(p.days) || p.days.length !== 5 || p.days.some(d => typeof d !== 'string')))
          || candidate.jobs.some(j => typeof j.name !== 'string' || typeof j.details !== 'string' || typeof j.deadline !== 'string')) throw new Error('Filen har inte rätt planeringsformat.');
        setDraft(candidate); setImportError('');
      } catch (error) { setImportError(error instanceof Error ? error.message : 'Filen kunde inte läsas.'); }
    }} />{importError && <p role="alert">{importError}</p>}<p className="mt-2 text-sm text-graphite-600">Kontrollera innehållet ovan och välj Spara planering för att publicera.</p></TaskSection>}
    {plan.data && <Comments companyId={user?.companyId ?? ''} onDirtyChange={setCommentDirty} />}
  </AppShell>;
}

function AddWeek({ weeks, onAdd }: { weeks: PlanningWeek[]; onAdd: (w: PlanningWeek) => void }) {
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  return <form className="my-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const startDate = format(startOfISOWeek(parseISO(date)), 'yyyy-MM-dd'); if (weeks.some(w => w.startDate === startDate)) { setError('Den veckan finns redan.'); return; } onAdd({ startDate, note: '', people: (weeks[weeks.length - 1]?.people ?? []).map(p => ({ name: p.name, days: ['', '', '', '', ''] })) }); setError(''); }}><label><span className="label">Datum i ny vecka</span><input className="input" type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><button className="btn-secondary">Lägg till vecka</button>{error && <p role="alert">{error}</p>}</form>;
}

function Comments({ companyId, onDirtyChange }: { companyId: string; onDirtyChange: (dirty: boolean) => void }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ text: string; key: string }>();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['planning-comments', companyId, page], queryFn: () => planningApi.comments(page), refetchInterval: 30000 });
  const send = useMutation({ mutationFn: () => {
    if (!pending.current || pending.current.text !== text.trim()) pending.current = { text: text.trim(), key: crypto.randomUUID() };
    return planningApi.comment(pending.current.text, pending.current.key);
  }, onSuccess: () => { setText(''); onDirtyChange(false); pending.current = undefined; setNotice('Din kommentar är publicerad.'); setPage(1); void cache.invalidateQueries({ queryKey: ['planning-comments', companyId] }); } });
  return <TaskSection title="Kommentarer, råd och tips" id="planning-comments">
    <p className="mb-4 text-sm text-graphite-600">Alla i teamet kan läsa kommentarerna. En administratör uppdaterar själva planen.</p>
    <form onSubmit={e => { e.preventDefault(); setNotice(''); send.mutate(); }} className="space-y-3">
      <label className="block"><span className="label">Din kommentar</span><textarea className="input" rows={3} required maxLength={5000} disabled={send.isPending} value={text} onChange={e => { setText(e.target.value); onDirtyChange(Boolean(e.target.value)); }} placeholder="Ange gärna vecka, person eller jobb som tipset gäller." /></label>
      <button className="btn-primary" disabled={send.isPending || !text.trim()}>{send.isPending ? 'Skickar…' : 'Publicera kommentar'}</button>
      {send.isError && <p role="alert">{send.error.message} Din text finns kvar. Försök igen.</p>}{notice && <p role="status">{notice}</p>}
    </form>
    <div className="mt-5 divide-y divide-graphite-200">{query.isLoading ? <p role="status">Laddar kommentarer…</p> : query.isError ? <QueryError title="Kommentarerna kunde inte hämtas" onRetry={() => void query.refetch()} /> : query.data?.items.length ? query.data.items.map(c => <article key={c.id} className="py-4"><div className="mb-2 flex flex-wrap gap-x-3 gap-y-1"><h3 className="font-semibold">{c.author.name}</h3><time dateTime={c.createdAt} className="text-sm text-graphite-600">{stamp(c.createdAt)}</time></div><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{c.content}</p></article>) : <p className="py-4 text-graphite-600">Inga kommentarer ännu.</p>}</div>
    <div className="mt-3 flex flex-wrap gap-2">{page > 1 && <button className="btn-secondary" onClick={() => setPage(p => p - 1)}>Nyare kommentarer</button>}{query.data?.hasMore && <button className="btn-secondary" onClick={() => setPage(p => p + 1)}>Äldre kommentarer</button>}</div>
  </TaskSection>;
}

export function validatePlanning(document: PlanningDocument): string | null {
  if (document.weeks.length > 104) return 'Planen får innehålla högst 104 veckor.';
  const dates = new Set<string>();
  for (const week of document.weeks) {
    const date = parseISO(week.startDate);
    if (!Number.isFinite(date.getTime()) || date.getDay() !== 1 || format(date, 'yyyy-MM-dd') !== week.startDate) return `Veckans startdatum ${week.startDate} måste vara en giltig måndag.`;
    if (dates.has(week.startDate)) return `Veckan ${weekLabel(week.startDate)} finns två gånger.`;
    dates.add(week.startDate);
    if (week.people.length > 100) return `${weekLabel(week.startDate)} har fler än 100 personer.`;
    if (week.note.length > 5000) return `Korta anteckningen för ${weekLabel(week.startDate)} till högst 5 000 tecken.`;
    for (const [index, person] of week.people.entries()) {
      if (!person.name.trim()) return `Ange personens namn på rad ${index + 1} i ${weekLabel(week.startDate)}, eller ta bort den tomma raden.`;
      if (person.name.trim().length > 100) return `Namnet på rad ${index + 1} i ${weekLabel(week.startDate)} är för långt (högst 100 tecken).`;
      if (person.days.length !== 5 || person.days.some(day => day.length > 500)) return `Kontrollera ${person.name} i ${weekLabel(week.startDate)}: fem dagar med högst 500 tecken per dag.`;
    }
  }
  if (document.jobs.length > 200) return 'Planen får innehålla högst 200 jobb.';
  for (const [index, job] of document.jobs.entries()) {
    if (!job.name.trim()) return `Ange namnet för jobb ${index + 1} under Jobb och återstående behov, eller ta bort det tomma jobbet.`;
    if (job.name.trim().length > 200 || job.details.length > 5000 || job.deadline.length > 1000) return `Korta texten för ${job.name}: högst 200 tecken i namnet, 5 000 i omfattningen och 1 000 i deadline.`;
  }
  return document.issues.length > 20000 ? 'Korta Behöver lösas till högst 20 000 tecken.' : null;
}
