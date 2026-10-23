import { useId, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { PlanningDocument, PlanningWeek } from '../types/planning';
import { ConfirmDialog } from '../components/ui/design';

const DRAG_TYPE = 'application/x-tidapp-planning-person';

type DragContext = { week: PlanningWeek; jobs: PlanningDocument['jobs']; row: number; day: number };

type Props = {
  week: PlanningWeek;
  jobs: PlanningDocument['jobs'];
  disabled: boolean;
  onAssign: (personIndex: number, dayIndex: number, jobName: string) => void;
};

export default function PlanningAssignments({ week, jobs, disabled, onAssign }: Props) {
  const dayId = useId();
  const jobId = useId();
  const [day, setDay] = useState(0);
  const [selection, setSelection] = useState<{ row: number; person: PlanningWeek['people'][number] } | null>(null);
  const [jobSelection, setJobSelection] = useState<{ index: number; job: Props['jobs'][number] } | null>(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<(DragContext & { name: string }) | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [hoveredJob, setHoveredJob] = useState<number | null>(null);
  const selectedRow = selection && week.people[selection.row] === selection.person ? selection.row : null;
  const selectedJob = jobSelection && jobs[jobSelection.index] === jobSelection.job ? jobSelection.index : null;
  const dragged = useRef<DragContext | null>(null);
  const personButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusAfterAssign = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (focusAfterAssign.current === null || pending || disabled) return;
    personButtons.current[focusAfterAssign.current]?.focus();
    focusAfterAssign.current = null;
  }, [week, pending, disabled]);
  const dates = Array.from({ length: 5 }, (_, index) => format(addDays(parseISO(week.startDate), index), 'EEEE d MMMM', { locale: sv }));

  function assign(row: number, name: string) {
    if (disabled || !week.people[row]?.name.trim() || !uniqueJob(name)) return;
    const previous = week.people[row].days[day];
    if (previous === name) { setNotice(`${week.people[row].name} är redan tilldelad ${name} för ${dates[day]}. Ingen ändring gjord.`); return; }
    if (previous.trim()) { setPending({ week, jobs, row, day, name }); return; }
    commitAssignment(row, name);
  }

  function commitAssignment(row: number, name: string) {
    focusAfterAssign.current = row;
    onAssign(row, day, name);
    setNotice(`${week.people[row].name} tilldelad ${name} för ${dates[day]}. Ändringen är inte sparad.`);
    setSelection(null);
    setJobSelection(null);
  }

  function validSource(source: DragContext | null): source is DragContext {
    return Boolean(!disabled && source && source.week === week && source.jobs === jobs && source.day === day && week.people[source.row]?.name.trim());
  }

  function uniqueJob(name: string) {
    return Boolean(name.trim()) && jobs.filter(job => job.name.trim() === name.trim()).length === 1;
  }

  function stopDrag() {
    dragged.current = null;
    setDragActive(false);
    setHoveredJob(null);
  }

  function startDrag(event: DragEvent<HTMLButtonElement>, row: number) {
    if (disabled || !week.people[row]?.name.trim()) { event.preventDefault(); return; }
    dragged.current = { week, jobs, row, day };
    event.dataTransfer.setData(DRAG_TYPE, String(row));
    event.dataTransfer.effectAllowed = 'move';
    setDragActive(true);
    setSelection(null);
    setNotice('');
  }

  return <section className="planning-assignments" aria-label="Fördela personal">
    <h4 className="font-semibold">Fördela personal</h4>
    <label className="block" htmlFor={dayId}><span className="label">Dag att planera</span>
      <select id={dayId} className="input" value={day} disabled={disabled} onChange={event => { stopDrag(); setSelection(null); setJobSelection(null); setPending(null); setNotice(''); setDay(Number(event.target.value)); }}>
        {dates.map((label, index) => <option key={index} value={index}>{label}</option>)}
      </select>
    </label>
    <p className="text-sm text-graphite-600">Dra ett namn till ett jobb – bara {dates[day]} ändras. På mobil: välj ett namn, ett jobb och tryck Tilldela vald dag.</p>
    <div className="planning-assignment-layout">
      <div aria-label="Personal att fördela" className="planning-assignment-people">
        {!week.people.length && <p className="text-sm text-graphite-600">Lägg till personer i veckoplanen nedan.</p>}
        {week.people.map((person, row) => <button key={row} ref={element => { personButtons.current[row] = element; }} type="button" className="btn-secondary planning-person-drag" aria-label={`Välj ${person.name}`} aria-pressed={selectedRow === row} onClick={() => { if (!disabled) { setSelection({ row, person }); setNotice(''); } }} disabled={disabled || !person.name.trim()} draggable={!disabled && Boolean(person.name.trim())}
          aria-describedby={`${dayId}-person-${row}`} onDragStart={event => startDrag(event, row)} onDragEnd={stopDrag}>
          <GripVertical size={18} aria-hidden="true" />
          <span className="planning-person-copy"><strong>{person.name || 'Namn saknas'}</strong><span id={`${dayId}-person-${row}`} className="text-sm text-graphite-600">{person.days[day] || 'Ej planerat'}</span></span>
        </button>)}
      </div>
      <div className="planning-assignment-jobs" role="group" aria-label="Jobb att släppa namn på" tabIndex={0}>
        {!jobs.length && <p className="text-sm text-graphite-600">Lägg till och namnge jobb i jobböversikten nedan.</p>}
        {jobs.map((job, index) => <section key={index} className="planning-assignment-job" aria-label={`Jobb ${job.name}`}
          data-drop-state={dragActive && validSource(dragged.current) && uniqueJob(job.name) ? (hoveredJob === index ? 'over' : 'ready') : undefined}
          onDragOver={event => {
            if (!validSource(dragged.current) || !uniqueJob(job.name)) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setHoveredJob(index);
          }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredJob(null); }}
          onDrop={event => {
            event.preventDefault();
            const source = dragged.current;
            stopDrag();
            const name = job.name.trim();
            if (!validSource(source) || event.dataTransfer.getData(DRAG_TYPE) !== String(source.row) || !uniqueJob(name)) return;
            assign(source.row, name);
          }}>
          <h5 className="font-semibold">{job.name || 'Jobbet behöver ett namn'}</h5>
          {job.name.trim() && jobs.filter(item => item.name.trim() === job.name.trim()).length > 1
            ? <p className="text-sm text-graphite-600">Ge jobben olika namn innan du tilldelar personal.</p>
            : job.name.trim() && <div className="planning-assigned-names">{week.people.map((person, row) => person.days[day] !== job.name.trim() ? null : <button key={row} type="button" className="planning-assigned-name" aria-label={`Flytta ${person.name} från ${job.name}`} disabled={disabled || !person.name.trim()} draggable={!disabled && Boolean(person.name.trim())}
              onClick={() => { if (!disabled) { setSelection({ row, person }); setNotice(''); } }} onDragStart={event => startDrag(event, row)} onDragEnd={stopDrag}><GripVertical size={16} aria-hidden="true" />{person.name || 'Namn saknas'}</button>)}</div>}
          {uniqueJob(job.name) && <p className="planning-drop-hint">{hoveredJob === index && dragActive ? `Släpp för ${dates[day]}` : 'Släpp ett namn här'}</p>}
        </section>)}
      </div>
    </div>
    <div className="planning-assignment-controls">
      <label htmlFor={jobId}><span className="label">Jobb att tilldela</span>
        <select id={jobId} className="input" disabled={disabled || selectedRow === null} value={selectedJob ?? ''} onChange={event => {
          const value = event.target.value;
          setJobSelection(value === '' ? null : { index: Number(value), job: jobs[Number(value)] });
        }}>
          <option value="">Välj jobb</option>
          {jobs.map((job, index) => <option key={index} value={index} disabled={!uniqueJob(job.name)}>{job.name || 'Namn saknas'}</option>)}
        </select>
      </label>
      <button type="button" className="btn-secondary" disabled={disabled || selectedRow === null || selectedJob === null} onClick={() => { if (selectedRow !== null && selectedJob !== null) assign(selectedRow, jobs[selectedJob].name.trim()); }}>Tilldela vald dag</button>
    </div>
    <ConfirmDialog open={Boolean(pending)} title={`Ändra planering för ${pending?.week.people[pending.row]?.name || 'personen'}?`}
      description={pending ? `${dates[pending.day]}. Nuvarande plan: ${pending.week.people[pending.row].days[pending.day]}. Nytt jobb: ${pending.name}.` : ''}
      consequence="Endast den valda dagen ändras. Ändringen publiceras först när du sparar planeringen."
      confirmLabel="Byt jobb" isLoading={disabled} onClose={() => setPending(null)} onConfirm={() => {
        const change = pending;
        setPending(null);
        if (!validSource(change)) return;
        commitAssignment(change.row, change.name);
      }} />
    <p role="status" className="text-sm text-graphite-600">{notice || (selectedRow === null ? 'Dra ett namn, eller välj en person och ett jobb med knapparna.' : `${week.people[selectedRow].name} vald för ${dates[day]}. Välj ett jobb att tilldela.`)}</p>
  </section>;
}
