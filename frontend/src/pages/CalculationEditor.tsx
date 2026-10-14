import { useEffect, useId, useRef, useState } from 'react';
import { Link, useBlocker, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectCalculationsApi, projectsApi } from '../services/api';
import { ConfirmDialog, FormField, StatusBadge, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import type { CalculationDraft, CalculationLine, CalculationPreview, EditableCalculation } from '../types/projectCalculation';
import type { Project } from '../types';
import { calculationMaterial, editableCalculation, newCalculation, newCalculationLine } from '../utils/calculationEditor';
import { CalculationDetails } from './ProjectCalculations';

export default function CalculationEditor() {
  const { id: projectId = '', draftId = '' } = useParams();
  const [search] = useSearchParams(); const copyId = search.get('copy');
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.get(projectId) });
  const draft = useQuery({ queryKey: ['calculation-draft', projectId, draftId], queryFn: () => projectCalculationsApi.draft(projectId, draftId) });
  const copy = useQuery({ queryKey: ['project-calculation', projectId, copyId], queryFn: () => projectCalculationsApi.get(projectId, copyId!), enabled: Boolean(copyId) && draft.isSuccess && !draft.data });
  if (project.isError || draft.isError || copy.isError) return <QueryError title="Kalkylen kunde inte öppnas" onRetry={() => { void project.refetch(); void draft.refetch(); if (copyId) void copy.refetch(); }} />;
  if (!project.data || !draft.isSuccess || (copyId && !draft.data && !copy.data)) return <p role="status">Öppnar kalkyl…</p>;
  return <Editor key={`${projectId}:${draftId}`} project={project.data} draftId={draftId} initial={draft.data} copied={copy.data?.document} />;
}

function NumberField({ label, value, onChange, max = 100_000_000 }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  const id = useId(), invalid = !Number.isFinite(value) || value < 0 || value > max;
  return <div className="text-sm"><label htmlFor={id} className="mb-1 block">{label}</label><input id={id} className="input w-full" type="number" inputMode="decimal" min="0" max={max} step="any" required aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(e.target.valueAsNumber)} />{invalid && <p id={`${id}-error`} className="mt-1 text-xs text-red-700">Ange ett tal mellan 0 och {max.toLocaleString('sv-SE')}.</p>}</div>;
}

function Editor({ project, draftId, initial, copied }: { project: Project; draftId: string; initial: CalculationDraft | null; copied?: EditableCalculation }) {
  const cache = useQueryClient();
  const [form, setForm] = useState<EditableCalculation>(() => {
    const value = editableCalculation(initial?.document || copied || newCalculation(`Kalkyl – ${project.name}`, project.customer?.name || '', project.defaultRate ?? project.customer?.defaultRate));
    if (!initial && copied) { value.quoteNumber = ''; value.quoteDate = ''; value.validUntil = ''; }
    return value;
  });
  const [saved, setSaved] = useState<CalculationDraft | null>(initial);
  const [savedForm, setSavedForm] = useState(initial ? JSON.stringify(editableCalculation(initial.document)) : '');
  const [preview, setPreview] = useState<{ key: string; value: CalculationPreview } | null>(null);
  const [calcError, setCalcError] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<'lock' | 'reload' | null>(null);
  const [articleSearch, setArticleSearch] = useState('');
  const serialized = JSON.stringify(form), revision = saved?.revision || 0;
  const key = `${revision}:${serialized}`;
  const locked = Boolean(saved?.lockedCalculationId), editable = project.active && !locked;
  const dirty = editable && serialized !== savedForm;
  const blocker = useBlocker(dirty || busy);
  const articles = useQuery({ queryKey: ['material-articles', 'active'], queryFn: () => projectsApi.listMaterialArticles(true), enabled: editable });
  useEffect(() => { if (error) { errorRef.current?.scrollIntoView({ block: 'nearest' }); errorRef.current?.focus(); } }, [error]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useEffect(() => {
    if (!editable) return;
    let cancelled = false; setCalcError('');
    const timer = setTimeout(() => {
      projectCalculationsApi.previewDraft(project.id, draftId, revision, form).then(value => { if (!cancelled) setPreview({ key, value }); })
        .catch((e: Error) => { if (!cancelled) { setPreview(null); setCalcError(`Kontrollera ifyllda tal och rader. ${e.message}`); } });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, editable, project.id, draftId]);
  const update = <K extends keyof EditableCalculation>(field: K, value: EditableCalculation[K]) => { setForm(current => ({ ...current, [field]: value })); setError(''); };
  const rowUpdate = (index: number, transform: (line: CalculationLine) => CalculationLine) => update('lines', form.lines.map((line, i) => i === index ? transform(line) : line));
  const receive = (value: CalculationDraft) => { const document = editableCalculation(value.document); setSaved(value); setForm(document); setSavedForm(JSON.stringify(document)); cache.setQueryData(['calculation-draft', project.id, draftId], value); };
  async function run(action: 'save' | 'lock' | 'reload') {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setConfirm(null);
    try {
      if (action === 'reload') {
        const value = await projectCalculationsApi.draft(project.id, draftId);
        if (!value) throw new Error('Inget utkast har sparats ännu.');
        receive(value);
      } else if (action === 'save') receive(await projectCalculationsApi.saveDraft(project.id, draftId, revision, form));
      else {
        if (!saved || dirty) throw new Error('Spara utkastet före låsning.');
        const result = await projectCalculationsApi.lockDraft(project.id, draftId, saved.revision, saved.fingerprint);
        receive({ ...saved, lockedCalculationId: result.id });
      }
      void cache.invalidateQueries({ queryKey: ['calculation-drafts', project.id] });
      void cache.invalidateQueries({ queryKey: ['project-calculations', project.id] });
    } catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const currentPreview = preview?.key === key ? preview.value : null;
  const display = !editable || (!dirty && saved) ? saved : currentPreview;
  const visibleArticles = (articles.data || []).filter(a => a.active && `${a.name} ${a.articleNumber || ''}`.toLocaleLowerCase('sv').includes(articleSearch.toLocaleLowerCase('sv'))).slice(0, 40);
  const warnings = [form.lines.some(l => l.materials.some(m => m.unitCost === 0)) && 'En materialrad har 0 kr i inköpspris.', form.lines.some(l => l.laborMinutesPerUnit > 0) && form.internalHourlyCost === 0 && 'Arbetskostnaden är 0 kr/timme.', form.lines.some(l => l.laborMinutesPerUnit > 0) && form.customerHourlyRate === 0 && 'Timpriset till kund är 0 kr.'].filter(Boolean);
  return <div className="space-y-5">
    <Link className="btn-secondary inline-flex" to={`/projects/${project.id}?tab=calculation`}>Till projektets kalkyler</Link>
    <div><h1 className="text-xl font-semibold">{locked ? 'Låst kalkyl' : 'Kalkyleditor'}</h1><p className="mt-1 text-sm">{project.code} · {project.name}</p></div>
    <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><StatusBadge label={locked ? 'Låst' : dirty ? 'Osparade ändringar' : 'Sparat utkast'} tone="slate" />{saved && <span>Senast sparad {new Date(saved.updatedAt).toLocaleString('sv-SE')} · version {saved.revision}</span>}</div>
    {!project.active && <p>Projektet är inaktivt. Kalkylen kan läsas.</p>}
    {error && <div role="alert" ref={errorRef} tabIndex={-1} className="space-y-2 text-red-700"><p>{error}</p><p className="text-sm">Dina ändringar finns kvar i formuläret.</p><button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirm('reload')}>Hämta senaste sparade version</button></div>}
    {locked ? <TaskSection title={form.name}><CalculationDetails value={saved!} /><Link className="btn-primary mt-4 inline-flex" to={`/projects/${project.id}/calculations/${crypto.randomUUID()}?copy=${saved!.lockedCalculationId}`}>Kopiera till nytt utkast</Link></TaskSection> : <>
    <div className="sticky top-20 z-20 flex flex-wrap items-center gap-3 border-b border-graphite-200 bg-white py-3 lg:top-0">
      <button type="button" className="btn-primary" disabled={busy || !editable || !currentPreview || !dirty} onClick={() => void run('save')}>{busy ? 'Arbetar…' : 'Spara utkast'}</button><button type="button" className="btn-secondary" disabled={busy || !editable || dirty || !saved} onClick={() => setConfirm('lock')}>Lås version</button>
      <button type="button" className="inline-flex min-h-11 items-center text-sm underline" onClick={() => { summaryRef.current?.scrollIntoView({ block: 'start' }); summaryRef.current?.focus({ preventScroll: true }); }}>{display ? `Räknat pris: ${display.totals.calculatedPrice.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr` : calcError ? 'Kontrollera fälten' : 'Beräknar pris…'}</button>
    </div>
    <fieldset disabled={busy || !editable} className="min-w-0 space-y-5">
      <TaskSection title="Kalkylens uppgifter"><div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Kalkylnamn" controlId="calc-name"><input id="calc-name" className="input" maxLength={300} value={form.name} onChange={e => update('name', e.target.value)} /></FormField>
        <FormField label="Kund" controlId="calc-customer"><input id="calc-customer" className="input" value={form.customerName} onChange={e => update('customerName', e.target.value)} /></FormField>
      </div><p className="mt-3 text-xs text-graphite-600">Kontrollera timkostnad och påslag för jobbet. Grundvärdena kommer från Anderssons Kalkyl; projektets timpris används när det finns.</p>
        <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline">Kontakt och offertuppgifter (frivilligt)</summary><div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Kontaktperson<input className="input mt-1" value={form.customerContact} onChange={e => update('customerContact', e.target.value)} /></label>
          <label className="text-sm">Offertnummer<input className="input mt-1" value={form.quoteNumber} onChange={e => update('quoteNumber', e.target.value)} /></label>
          <label className="text-sm">Offertdatum<input className="input mt-1" type="date" value={form.quoteDate} onChange={e => update('quoteDate', e.target.value)} /></label>
          <label className="text-sm">Giltig till<input className="input mt-1" type="date" value={form.validUntil} onChange={e => update('validUntil', e.target.value)} /></label>
        </div></details></TaskSection>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <TaskSection title="Arbetsmoment och material">
            <label className="mb-4 block text-sm">Sök i artikelregistret<input className="input mt-1" type="search" value={articleSearch} onChange={e => setArticleSearch(e.target.value)} placeholder="Artikelnamn eller nummer" /></label>
            {articles.isLoading && <p role="status">Laddar artikelregister…</p>}
            {articles.isError && <QueryError title="Artikelregistret kunde inte hämtas. Egna material kan fortfarande läggas till." onRetry={() => void articles.refetch()} />}
            <p className="mb-4 text-xs text-graphite-600">Visar högst 40 sökträffar. Priset kopieras när artikeln väljs. Ändringar här påverkar bara kalkylen.</p>
            {form.lines.map((line, index) => <details key={line.id} open={form.lines.length === 1 || undefined} className="border-t border-graphite-200 py-3">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline">{index + 1}. {line.internalDescription || 'Nytt arbetsmoment'} · {line.quantity || 0} {line.workUnit}</summary>
              <div className="space-y-4 pb-3">
                <label className="block text-sm">Beskrivning<input className="input mt-1" value={line.internalDescription} onChange={e => rowUpdate(index, l => ({ ...l, internalDescription: e.target.value }))} /></label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><NumberField label="Mängd" value={line.quantity} onChange={value => rowUpdate(index, l => ({ ...l, quantity: value }))} /><label className="block text-sm">Enhet<input className="input mt-1" maxLength={30} value={line.workUnit} onChange={e => rowUpdate(index, l => ({ ...l, workUnit: e.target.value }))} /></label><NumberField label="Montagetid (min/enhet)" value={line.laborMinutesPerUnit} onChange={value => rowUpdate(index, l => ({ ...l, laborMinutesPerUnit: value, timeSource: 'manualOverride' }))} /></div>
                <p className="text-xs text-graphite-600">Materialets åtgång anges per {line.workUnit || 'arbetsenhet'}. Exempel: 0,6 m² isolering per meter kanal. Spill läggs på separat.</p>
                {line.materials.map((material, mi) => <div key={material.id} className="space-y-3 border-t border-graphite-100 pt-3">
                  <label className="block text-sm">Material<input className="input mt-1" value={material.description} onChange={e => rowUpdate(index, l => ({ ...l, materials: l.materials.map((m, i) => i === mi ? { ...m, description: e.target.value, sourceText: 'Manuellt ändrat i kalkylen' } : m) }))} /></label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><NumberField label={`Åtgång per ${line.workUnit}`} value={material.usagePerWorkUnit} onChange={value => rowUpdate(index, l => ({ ...l, materials: l.materials.map((m, i) => i === mi ? { ...m, usagePerWorkUnit: value } : m) }))} /><label className="block text-sm">Materialenhet<input className="input mt-1" value={material.unit} maxLength={30} onChange={e => rowUpdate(index, l => ({ ...l, materials: l.materials.map((m, i) => i === mi ? { ...m, unit: e.target.value, sourceText: 'Manuellt ändrat i kalkylen' } : m) }))} /></label><NumberField label={`Inköpspris kr/${material.unit}`} value={material.unitCost} onChange={value => rowUpdate(index, l => ({ ...l, materials: l.materials.map((m, i) => i === mi ? { ...m, unitCost: value, sourceText: 'Manuellt pris i kalkylen' } : m) }))} /></div>
                  <p className="break-words text-xs text-graphite-600">{material.sourceText}</p><button type="button" className="btn-secondary" onClick={() => rowUpdate(index, l => { const materials = l.materials.filter((_, i) => i !== mi); return { ...l, materials, materialCostExcluded: materials.length === 0 }; })}>Ta bort material {mi + 1}</button>
                </div>)}
                {line.materials.length === 0 && <p className="text-sm">Endast arbete – inga material på denna rad.</p>}
                <label className="block text-sm">Lägg till från artikelregistret<select className="input mt-1" value="" disabled={line.materials.length >= 30} onChange={e => { const article = articles.data?.find(a => a.id === e.target.value); if (article) rowUpdate(index, l => ({ ...l, materialCostExcluded: false, materials: [...l.materials, calculationMaterial(article)] })); }}><option value="">Välj artikel…</option>{visibleArticles.map(a => <option key={a.id} value={a.id}>{a.name} · {a.articleNumber} · {a.purchasePrice ?? 'pris saknas'} kr/{a.unit}</option>)}</select></label>
                <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={line.materials.length >= 30} onClick={() => rowUpdate(index, l => ({ ...l, materialCostExcluded: false, materials: [...l.materials, calculationMaterial()] }))}>Lägg till eget material</button><button type="button" className="btn-secondary" onClick={() => update('lines', form.lines.filter((_, i) => i !== index))}>Ta bort arbetsmoment {index + 1}</button></div>
              </div>
            </details>)}
            <button type="button" className="btn-secondary mt-4" disabled={form.lines.length >= 500} onClick={() => update('lines', [...form.lines, newCalculationLine()])}>Lägg till arbetsmoment</button>
          </TaskSection>
          <TaskSection title="Beskrivning och villkor"><label className="block text-sm">Omfattning<textarea className="input mt-1" rows={3} value={form.scope} onChange={e => update('scope', e.target.value)} /></label><label className="mt-3 block text-sm">Villkor<textarea className="input mt-1" rows={3} value={form.terms} onChange={e => update('terms', e.target.value)} /></label></TaskSection>
        </div>
        <div ref={summaryRef} tabIndex={-1} className="scroll-mt-56"><TaskSection title="Priser och summering"><div className="space-y-3">
          <NumberField label="Intern timkostnad (kr/h)" value={form.internalHourlyCost} onChange={value => update('internalHourlyCost', value)} />
          <NumberField label="Timpris till kund (kr/h)" value={form.customerHourlyRate} onChange={value => update('customerHourlyRate', value)} />
          <NumberField label="Materialpåslag (%)" value={form.materialMarkupPercent} max={1000} onChange={value => update('materialMarkupPercent', value)} />
          <NumberField label="Materialspill (%)" value={form.wastePercent} max={1000} onChange={value => update('wastePercent', value)} />
          <NumberField label="Manuellt anbud, exkl. moms (kr)" value={form.manualBid} onChange={value => update('manualBid', value)} />
          <p className="text-xs text-graphite-600">0 betyder att inget manuellt anbud är angivet. Ett eget anbud ändrar inte självkostnaden eller det räknade priset.</p>
          {display ? <CalculationDetails value={display} /> : <p role="status">{calcError || 'Beräknar…'}</p>}
          {warnings.length > 0 && <div className="text-sm"><p className="font-semibold">Kontrollera före låsning</p>{warnings.map(warning => <p key={String(warning)}>{warning}</p>)}</div>}
        </div></TaskSection></div>
      </div>
    </fieldset>
    {saved && <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirm('reload')}>Hämta sparad version</button>}
    {dirty && <p className="text-sm text-graphite-600">Spara utkastet innan du låser kalkylversionen.</p>}
    </>}
    <ConfirmDialog open={confirm === 'lock'} title="Lås kalkylversion?" consequence={`Kontrollera priser, mängder och montagetid. ${warnings.join(' ')} Rader och priser kan sedan inte ändras. Fortsatt arbete görs i en kopia. Projektets budget och faktiska kostnader ändras inte.`} confirmLabel="Lås version" onClose={() => setConfirm(null)} onConfirm={() => void run('lock')} />
    <ConfirmDialog open={confirm === 'reload'} title="Hämta sparad version?" consequence="Osparade ändringar i formuläret ersätts med den senast sparade kalkylen." confirmLabel="Hämta sparad version" onClose={() => setConfirm(null)} onConfirm={() => void run('reload')} />
    <ConfirmDialog open={blocker.state === 'blocked'} title="Lämna kalkylen?" consequence={busy ? 'En sparning pågår. Stanna tills resultatet visas.' : 'Osparade ändringar försvinner. Det sparade utkastet finns kvar.'} confirmLabel="Lämna utan att spara" onClose={() => blocker.reset?.()} onConfirm={() => { if (!busy) blocker.proceed?.(); }} />
  </div>;
}
