import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, getISOWeek, parseISO, startOfISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { projectsApi } from '../services/api';
import type { PlanningDocument } from '../types/planning';
import type { ProjectOption } from '../types';
import {
  addJob, addPeople, applyOperation, boardRows, boardWeeks, cellId, cellRange, copyWeek, createWeek, dayJobs, findPerson,
  jobUsage, parseCellId, projectJobName, removePerson, uniqueJobNames, weekHasContent,
  type BoardCell, type BoardOperation, type BoardRow,
} from '../utils/planningBoard';

type Account = { id: string; name: string; active: boolean; role: string };
export type BoardChange = (next: PlanningDocument, options?: { coalesce?: string }) => void;
type Props = {
  document: PlanningDocument;
  onChange: BoardChange;
  accounts?: Account[];
  companyId: string;
  disabled: boolean;
  today: string;
};

const TONES = 5;
const toneFor = (name: string, jobs: string[]) => { const index = jobs.indexOf(name); return index < 0 ? 'none' : String(index % TONES); };
const shortWeek = (start: string) => `V${getISOWeek(parseISO(start))}`;
const weekRange = (start: string) => `${format(parseISO(start), 'd MMM', { locale: sv })}–${format(addDays(parseISO(start), 4), 'd MMM', { locale: sv })}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default function PlanningBoard({ document, onChange, accounts, companyId, disabled, today }: Props) {
  const ids = useId();
  const currentMonday = format(startOfISOWeek(parseISO(today)), 'yyyy-MM-dd');
  const [start, setStart] = useState(currentMonday);
  const weeks = useMemo(() => boardWeeks(start), [start]);
  const rows = useMemo(() => boardRows(document, weeks), [document, weeks]);
  const jobs = useMemo(() => uniqueJobNames(document), [document]);
  const usage = useMemo(() => jobUsage(document, weeks), [document, weeks]);
  const projects = useQuery<ProjectOption[]>({ queryKey: ['planning-project-options', companyId], queryFn: projectsApi.options, staleTime: 60_000 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keepExisting, setKeepExisting] = useState(false);
  const [jobText, setJobText] = useState('');
  const [dayText, setDayText] = useState('');
  const [accountId, setAccountId] = useState('');
  const [otherName, setOtherName] = useState('');
  const [notice, setNotice] = useState('');
  const anchor = useRef<BoardCell | null>(null);
  const lastPointer = useRef('');
  const dragOrigin = useRef<BoardCell | null>(null);

  useEffect(() => { setSelected(new Set()); anchor.current = null; }, [start]);
  useEffect(() => {
    const stop = () => { dragOrigin.current = null; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  }, []);
  // Drop selections that point at rows no longer on the board.
  useEffect(() => {
    setSelected(current => {
      const keys = new Set(rows.map(row => row.key));
      const next = new Set([...current].filter(id => keys.has(parseCellId(id).rowKey)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  const cells = [...selected].map(parseCellId);
  const selectedJobs = [...new Set(cells.flatMap(cell => {
    const week = document.weeks.find(item => item.startDate === cell.week);
    const index = week ? findPerson(week, cell.rowKey) : -1;
    return index >= 0 ? dayJobs(week!.people[index], cell.day, jobs) : [];
  }))];
  const dayLabel = (cell: BoardCell) => format(addDays(parseISO(cell.week), cell.day), 'EEEE d MMM', { locale: sv });
  const selectionLabel = plural(selected.size, 'dag vald', 'dagar valda');

  function run(operation: BoardOperation, describe: (count: number) => string) {
    if (disabled || !cells.length) return;
    const result = applyOperation(document, cells, rows, operation);
    if (result.changed) onChange(result.document);
    setNotice(result.changed ? `${describe(result.changed)} Ändringen är inte sparad.${result.full ? ` ${result.full} dagar hade redan max antal jobb.` : ''}` : 'Inget ändrades – de valda dagarna hade redan det innehållet.');
  }

  function assignJob(name: string) {
    if (!cells.length) { setNotice('Markera en eller flera dagar i tavlan först.'); return; }
    const operation: BoardOperation = keepExisting ? { type: 'add', job: name } : { type: 'set', job: name };
    const result = applyOperation(document, cells, rows, operation);
    if (result.document !== document) onChange(result.document);
    setNotice(result.changed ? `${name} ${keepExisting ? 'tillagt på' : 'satt på'} ${plural(result.changed, 'dag', 'dagar')}. Ändringen är inte sparad.` : `${name} fanns redan på de valda dagarna.`);
  }

  function select(next: Set<string>, origin?: BoardCell) { setSelected(next); if (origin) anchor.current = origin; setNotice(''); }

  function onCellPointerDown(event: PointerEvent<HTMLButtonElement>, cell: BoardCell) {
    lastPointer.current = event.pointerType;
    if (disabled || event.button !== 0) return;
    const id = cellId(cell);
    // Touch and pen toggle in onClick, so a swipe that scrolls the board never selects anything.
    if (event.pointerType !== 'mouse') return;
    if (event.ctrlKey || event.metaKey) { toggle(cell); event.preventDefault(); return; }
    event.preventDefault();
    event.currentTarget.focus();
    if (event.shiftKey && anchor.current) {
      select(new Set(cellRange(anchor.current, cell, rows, weeks).map(cellId)));
      return;
    }
    dragOrigin.current = cell;
    select(new Set([id]), cell);
  }

  function onCellPointerEnter(event: PointerEvent<HTMLButtonElement>, cell: BoardCell) {
    if (!dragOrigin.current || event.pointerType !== 'mouse' || !(event.buttons & 1)) return;
    setSelected(new Set([...cellRange(dragOrigin.current, cell, rows, weeks).map(cellId)]));
  }

  function toggle(cell: BoardCell) {
    const id = cellId(cell);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    select(next, cell);
  }

  // Mouse selection happens on pointerdown; this handles touch, pen and click-only activation (voice control, assistive tech).
  function onCellClick(event: MouseEvent<HTMLButtonElement>, cell: BoardCell) {
    if (disabled || lastPointer.current === 'mouse' && event.detail > 0) return;
    toggle(cell);
  }

  function onCellKey(event: KeyboardEvent<HTMLButtonElement>, cell: BoardCell) {
    if (event.key === 'Escape') { select(new Set()); return; }
    const moves: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (moves[event.key]) {
      event.preventDefault();
      const row = rows.findIndex(item => item.key === cell.rowKey) + moves[event.key][0];
      const column = weeks.indexOf(cell.week) * 5 + cell.day + moves[event.key][1];
      if (row < 0 || row >= rows.length || column < 0 || column >= weeks.length * 5) return;
      const target = { rowKey: rows[row].key, week: weeks[Math.floor(column / 5)], day: column % 5 };
      (event.currentTarget.closest('table')?.querySelector(`[data-cell="${CSS.escape(cellId(target))}"]`) as HTMLButtonElement | null)?.focus();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const id = cellId(cell);
    const next = new Set(selected);
    if (event.shiftKey && anchor.current) cellRange(anchor.current, cell, rows, weeks).forEach(item => next.add(cellId(item)));
    else if (next.has(id)) next.delete(id); else next.add(id);
    select(next, cell);
  }

  function selectRow(row: BoardRow) {
    select(new Set(weeks.flatMap(week => [0, 1, 2, 3, 4].map(day => cellId({ rowKey: row.key, week, day })))));
  }

  function selectColumn(week: string, day: number) {
    select(new Set(rows.map(row => cellId({ rowKey: row.key, week, day }))));
  }

  function addJobFromInput() {
    const text = jobText.trim();
    if (!text) return;
    const project = (projects.data ?? []).find(item => projectJobName(item) === text || item.code === text);
    const name = project ? projectJobName(project) : text.slice(0, 200).trim();
    const exists = document.jobs.some(job => job.name.trim() === name);
    const withJob = addJob(document, name, project?.customer?.name ? `Kund: ${project.customer.name}` : '');
    setJobText('');
    if (!exists && withJob === document) { setNotice('Jobbet kunde inte läggas till.'); return; }
    if (cells.length) {
      const operation: BoardOperation = keepExisting ? { type: 'add', job: name } : { type: 'set', job: name };
      const result = applyOperation(withJob, cells, rows, operation);
      onChange(result.document);
      setNotice(`${name} ${exists ? 'fanns redan och' : 'lades till och'} ${keepExisting ? 'lades på' : 'sattes på'} ${plural(result.changed, 'dag', 'dagar')}. Ändringen är inte sparad.`);
    } else if (!exists) {
      onChange(withJob);
      setNotice(`${name} finns nu i jobblistan. Markera dagar och klicka på jobbet för att planera det.`);
    } else setNotice(`${name} finns redan i jobblistan.`);
  }

  const missingAccounts = (accounts ?? []).filter(account => account.active && account.role !== 'ACCOUNTANT' && !rows.some(row => row.userId === account.id));
  const projectChoices = (projects.data ?? []).filter(project => !jobs.includes(projectJobName(project)));

  return <section className="planning-board" aria-labelledby={`${ids}-title`}>
    <div className="planning-board-top">
      <h3 id={`${ids}-title`} className="font-semibold">Planeringstavla · {shortWeek(weeks[0])}–{shortWeek(weeks[1])}</h3>
      <div className="planning-board-nav" role="group" aria-label="Byt veckor">
        <button type="button" className="btn-secondary" onClick={() => setStart(format(addDays(parseISO(start), -7), 'yyyy-MM-dd'))}><ChevronLeft size={16} aria-hidden="true" />Föregående vecka</button>
        <button type="button" className="btn-secondary" disabled={start === currentMonday} onClick={() => setStart(currentMonday)}>Denna vecka</button>
        <button type="button" className="btn-secondary" onClick={() => setStart(format(addDays(parseISO(start), 7), 'yyyy-MM-dd'))}>Nästa vecka<ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <p className="text-sm text-graphite-600">Markera dagar i tavlan (dra med musen över flera dagar, Shift-klicka för ett område, Ctrl-klicka för enstaka). Klicka sedan på ett jobb. Klicka på ett namn för att markera personens två veckor, eller på en dag för hela teamet.</p>

    <div className="planning-board-tools" aria-label="Planera valda dagar" role="group">
      <div className="planning-board-selection">
        <p role="status" className="font-semibold">{selected.size ? selectionLabel : 'Inga dagar valda'}</p>
        {selected.size > 0 && <>
          <button type="button" className="btn-secondary" disabled={disabled} onClick={() => run({ type: 'clear' }, count => `${plural(count, 'dag', 'dagar')} tömda.`)}>Töm valda dagar</button>
          <button type="button" className="btn-secondary" onClick={() => select(new Set())}>Avmarkera</button>
          {selectedJobs.map(name => <button key={name} type="button" className="btn-secondary planning-board-remove" disabled={disabled} aria-label={`Ta bort ${name} från valda dagar`} onClick={() => run({ type: 'remove', job: name }, count => `${name} borttaget från ${plural(count, 'dag', 'dagar')}.`)}><X size={14} aria-hidden="true" />{name}</button>)}
        </>}
      </div>
      <div className="planning-board-jobs">
        <p className="label">Jobb · klicka för att sätta på valda dagar</p>
        {jobs.length ? <ul className="planning-board-palette">{jobs.map(name => <li key={name}>
          <button type="button" className="planning-board-job" data-tone={toneFor(name, jobs)} disabled={disabled || !selected.size} aria-label={`Sätt ${name} på valda dagar`} onClick={() => assignJob(name)}>
            <span className="planning-board-dot" aria-hidden="true" /><span className="planning-board-job-name">{name}</span>
            <span className={`planning-board-usage${usage.get(name) ? '' : ' is-empty'}`}>{usage.get(name) ? plural(usage.get(name)!, 'dag', 'dagar') : 'Ej bemannat'}</span>
          </button>
        </li>)}</ul> : <p className="text-sm text-graphite-600">Inga jobb ännu. Lägg till ett projekt eller jobb nedan.</p>}
        <form className="planning-board-addjob" onSubmit={event => { event.preventDefault(); addJobFromInput(); }}>
          <label htmlFor={`${ids}-job`} className="sr-only">Projekt eller nytt jobb</label>
          <input id={`${ids}-job`} className="input" list={`${ids}-projects`} maxLength={200} disabled={disabled} value={jobText} onChange={event => setJobText(event.target.value)} placeholder={projects.isError ? 'Skriv jobbnamn (projekten kunde inte hämtas)' : 'Sök projekt eller skriv jobb, t.ex. Service Ica'} />
          <datalist id={`${ids}-projects`}>{projectChoices.map(project => <option key={project.id} value={projectJobName(project)}>{project.customer?.name ?? ''}</option>)}</datalist>
          <button className="btn-secondary" disabled={disabled || !jobText.trim()} aria-label={selected.size ? 'Lägg till jobbet och sätt det på valda dagar' : 'Lägg till jobbet i listan'}>{selected.size ? 'Lägg till och sätt' : 'Lägg till'}</button>
        </form>
        <label className="planning-board-keep"><input type="checkbox" checked={keepExisting} onChange={event => setKeepExisting(event.target.checked)} /> Behåll befintliga jobb (lägg till som extra jobb samma dag)</label>
      </div>
      <form className="planning-board-text" onSubmit={event => { event.preventDefault(); if (dayText.trim()) run({ type: 'text', text: dayText.trim() }, count => `Texten satt på ${plural(count, 'dag', 'dagar')}.`); }}>
        <label htmlFor={`${ids}-text`} className="label">Text på valda dagar (t.ex. Ledig, Sjuk, Kurs)</label>
        <div className="flex flex-wrap gap-2">
          <input id={`${ids}-text`} className="input" maxLength={500} disabled={disabled} value={dayText} onChange={event => setDayText(event.target.value)} />
          <button className="btn-secondary" disabled={disabled || !selected.size || !dayText.trim()}>Sätt text</button>
          {['Ledig', 'Semester'].map(text => <button key={text} type="button" className="btn-secondary" disabled={disabled || !selected.size} aria-label={`Markera valda dagar som ${text} (tar bort jobben)`} onClick={() => run({ type: 'text', text, clearJobs: true }, count => `${text} satt på ${plural(count, 'dag', 'dagar')}, jobben borttagna.`)}>{text}</button>)}
        </div>
      </form>
    </div>
    {notice && <p role="status" className="planning-board-notice">{notice}</p>}

    <div className="planning-board-scroll">
      <table role="grid" className="planning-board-grid" aria-label={`Planeringstavla ${shortWeek(weeks[0])} och ${shortWeek(weeks[1])}`}>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="planning-board-corner">Personal</th>
            {weeks.map((week, index) => {
              const existing = document.weeks.find(item => item.startDate === week);
              const previous = format(addDays(parseISO(week), -7), 'yyyy-MM-dd');
              const hasPrevious = document.weeks.some(item => item.startDate === previous);
              return <th key={week} scope="colgroup" colSpan={5} className={`planning-board-week${index ? ' is-second' : ''}`}>
                <span className="planning-board-weekname">{shortWeek(week)} <span className="font-normal text-graphite-600">· {weekRange(week)}</span></span>
                <span className="planning-board-weekactions">
                  {!existing && <span className="planning-board-missing">Ingen plan ännu</span>}
                  {!existing && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { onChange(createWeek(document, week, rows)); setNotice(`${shortWeek(week)} skapad med samma personal. Ändringen är inte sparad.`); }}>Skapa {shortWeek(week)}</button>}
                  <button type="button" className="btn-secondary" disabled={disabled || !hasPrevious} title={hasPrevious ? undefined : `${shortWeek(previous)} finns inte i planen`} onClick={() => {
                    if ((weekHasContent(existing) || existing?.people.length) && !window.confirm(`Ersätta allt i ${shortWeek(week)} med en kopia av ${shortWeek(previous)}?`)) return;
                    onChange(copyWeek(document, previous, week));
                    setNotice(`${shortWeek(previous)} kopierad till ${shortWeek(week)}. Ändringen är inte sparad – justera det som skiljer.`);
                  }}>Kopiera {shortWeek(previous)} hit</button>
                </span>
              </th>;
            })}
          </tr>
          <tr>
            {weeks.flatMap((week, index) => [0, 1, 2, 3, 4].map(day => {
              const date = format(addDays(parseISO(week), day), 'yyyy-MM-dd');
              return <th key={`${week}-${day}`} scope="col" className={`planning-board-dayhead${day === 0 && index ? ' is-second' : ''}${date === today ? ' is-today' : ''}`}>
                <button type="button" disabled={disabled || !rows.length} aria-label={`Markera ${format(parseISO(date), 'EEEE d MMMM', { locale: sv })} för alla`} onClick={() => selectColumn(week, day)}>
                  {format(parseISO(date), 'EEE', { locale: sv })}<span>{format(parseISO(date), 'd/M')}</span>{date === today && <span className="sr-only"> (idag)</span>}
                </button>
              </th>;
            }))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.key}>
            <th scope="row" className="planning-board-person">
              <button type="button" className="planning-board-personname" disabled={disabled} aria-label={`Markera ${row.name || 'namnlös rad'} båda veckorna`} onClick={() => selectRow(row)}>{row.name || 'Namn saknas'}</button>
              {!row.userId && <span className="planning-board-unlinked">Ej kopplad till konto</span>}
              <button type="button" className="planning-board-delete" disabled={disabled} aria-label={`Ta bort ${row.name || 'raden'} från ${shortWeek(weeks[0])}–${shortWeek(weeks[1])}`} onClick={() => {
                if (!window.confirm(`Ta bort ${row.name || 'raden'} från ${shortWeek(weeks[0])} och ${shortWeek(weeks[1])}? Personens planering de veckorna försvinner.`)) return;
                onChange(removePerson(document, weeks, row.key));
                select(new Set());
                setNotice(`${row.name} borttagen från ${shortWeek(weeks[0])}–${shortWeek(weeks[1])}. Ändringen är inte sparad.`);
              }}><X size={14} aria-hidden="true" /></button>
            </th>
            {weeks.flatMap((week, index) => {
              const plan = document.weeks.find(item => item.startDate === week);
              const personIndex = plan ? findPerson(plan, row.key) : -1;
              const person = personIndex >= 0 ? plan!.people[personIndex] : undefined;
              return [0, 1, 2, 3, 4].map(day => {
                const cell = { rowKey: row.key, week, day };
                const id = cellId(cell);
                const assigned = dayJobs(person, day, jobs);
                const text = person?.days[day] ?? '';
                const date = format(addDays(parseISO(week), day), 'yyyy-MM-dd');
                const content = [...assigned, text].filter(Boolean).join(', ');
                return <td key={id} className={`${day === 0 && index ? 'is-second' : ''}${date === today ? ' is-today' : ''}`}>
                  <button type="button" className="planning-board-cell" data-cell={id} aria-pressed={selected.has(id)} disabled={disabled}
                    aria-label={`${row.name || 'Namnlös rad'}, ${dayLabel(cell)}: ${content || (plan ? 'ej planerat' : 'veckan finns inte ännu')}`}
                    title={content || undefined}
                    onPointerDown={event => onCellPointerDown(event, cell)} onClick={event => onCellClick(event, cell)} onPointerEnter={event => onCellPointerEnter(event, cell)} onKeyDown={event => onCellKey(event, cell)}>
                    {assigned.map(name => <span key={name} className="planning-board-chip" data-tone={toneFor(name, jobs)}><span className="planning-board-dot" aria-hidden="true" />{name}</span>)}
                    {text && !assigned.includes(text) && <span className="planning-board-celltext">{text}</span>}
                    {!assigned.length && !text && <span className="planning-board-empty" aria-hidden="true">–</span>}
                  </button>
                </td>;
              });
            })}
          </tr>)}
        </tbody>
      </table>
      {!rows.length && <p className="p-4 text-sm text-graphite-600">Ingen personal i de här veckorna. Lägg till personal nedan, eller kopiera förra veckan.</p>}
    </div>

    <div className="planning-board-people">
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        const account = missingAccounts.find(item => item.id === accountId);
        if (!account) return;
        onChange(addPeople(document, weeks, rows, [{ name: account.name, userId: account.id }]));
        setAccountId(''); setNotice(`${account.name} tillagd i tavlan. Ändringen är inte sparad.`);
      }}>
        <label htmlFor={`${ids}-account`}><span className="label">Lägg till personal</span>
          <select id={`${ids}-account`} className="input" disabled={disabled || !missingAccounts.length} value={accountId} onChange={event => setAccountId(event.target.value)}>
            <option value="">{accounts ? missingAccounts.length ? 'Välj person' : 'Alla konton finns redan med' : 'Hämtar konton…'}</option>
            {missingAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <button className="btn-secondary" disabled={disabled || !accountId} aria-label="Lägg till vald person i tavlan">Lägg till</button>
        {missingAccounts.length > 1 && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => {
          onChange(addPeople(document, weeks, rows, missingAccounts.map(account => ({ name: account.name, userId: account.id }))));
          setNotice(`${plural(missingAccounts.length, 'person', 'personer')} tillagda i tavlan. Ändringen är inte sparad.`);
        }}>Lägg till alla ({missingAccounts.length})</button>}
      </form>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        if (!otherName.trim()) return;
        onChange(addPeople(document, weeks, rows, [{ name: otherName }]));
        setNotice(`${otherName.trim()} tillagd i tavlan. Ändringen är inte sparad.`); setOtherName('');
      }}>
        <label htmlFor={`${ids}-other`}><span className="label">Annan person (t.ex. inhyrd)</span>
          <input id={`${ids}-other`} className="input" maxLength={100} disabled={disabled} value={otherName} onChange={event => setOtherName(event.target.value)} />
        </label>
        <button className="btn-secondary" disabled={disabled || !otherName.trim()} aria-label="Lägg till namnet i tavlan">Lägg till</button>
      </form>
    </div>

    {weeks.some(week => document.weeks.some(item => item.startDate === week)) && <details className="planning-board-notes">
      <summary>Veckoanteckningar {weeks.filter(week => document.weeks.find(item => item.startDate === week)?.note.trim()).map(shortWeek).join(', ') || '(inga)'}</summary>
      {weeks.map(week => {
        const plan = document.weeks.find(item => item.startDate === week);
        return plan && <label key={week} className="mt-3 block"><span className="label">Anteckning {shortWeek(week)}</span>
          <textarea className="input" rows={3} maxLength={5000} disabled={disabled} value={plan.note} onChange={event => onChange({ ...document, weeks: document.weeks.map(item => item.startDate === week ? { ...item, note: event.target.value } : item) }, { coalesce: `note:${week}` })} />
        </label>;
      })}
    </details>}
  </section>;
}
