import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { projectCalculationsApi } from '../services/api';
import type { CalculationPreview } from '../types/projectCalculation';
import { DataTable, EmptyState, FormField, StatusBadge, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { formatDate, formatHours } from '../utils/format';

const formatCurrency = (value: number) => value.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sources: Record<string, string> = { historicalPrisa: 'Historisk PRISA-tid', ownEstimate: 'Egen uppskattning', measuredProduction: 'Verifierad verklig tid', manualOverride: 'Manuellt satt tid' };

export function CalculationDetails({ value }: { value: CalculationPreview }) {
  const { document, totals } = value;
  return <>
    <p className="text-sm text-graphite-600">{document.customerName || 'Ingen kund angiven i källan'} · {document.quoteNumber ? `Offert ${document.quoteNumber}` : 'Utan offertnummer'} · Källversion {document.revision}</p>
    <dl className="my-4 divide-y divide-graphite-100 text-sm">
      {[
        ['Rader', String(document.lines.length)], ['Beräknad arbetstid', formatHours(totals.laborHours)],
        ['Material inklusive spill', formatCurrency(totals.materialCostWithWaste)], ['Arbetskostnad', formatCurrency(totals.internalLaborCost)],
        ['Självkostnad', formatCurrency(totals.directCost)], ['Räknat pris', formatCurrency(totals.calculatedPrice)],
        ['Manuellt anbud i källan', document.manualBid > 0 ? formatCurrency(document.manualBid) : 'Inte angivet'],
      ].map(([label, text]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">{text}</dd></div>)}
    </dl>
    <p className="text-xs text-graphite-600">Alla belopp är exklusive moms. Kalkylen är ett planerat underlag; projektets budget, inköp och materialåtgång ändras inte.</p>
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline focus-visible:outline-2">Visa kalkylrader</summary>
      <DataTable label="Importerade kalkylrader"><table className="w-full min-w-[620px] text-left text-sm">
        <thead className="table-head"><tr><th className="p-3">Arbete / material</th><th className="p-3 text-right">Mängd</th><th className="p-3 text-right">Tid</th><th className="p-3 text-right">Material inkl. spill</th></tr></thead>
        <tbody className="divide-y divide-graphite-100">{document.lines.map((line, index) => <tr key={line.id}>
          <td className="p-3"><p className="font-medium">{line.internalDescription || line.referenceArticle}</p><p className="text-xs text-graphite-600">{sources[line.timeSource]} · {line.laborMinutesPerUnit} min/{line.workUnit}</p>
            {line.materialCostExcluded ? <p className="text-xs">Materialfri rad</p> : line.materials.map(material => <p key={material.id} className="mt-1 text-xs text-graphite-600">{material.description} · {material.articleNumber} · {formatCurrency(material.unitCost)}/{material.unit} · åtgång {material.usagePerWorkUnit}/{line.workUnit}<br />{material.sourceText}</p>)}
          </td><td className="p-3 text-right">{line.quantity} {line.workUnit}</td><td className="p-3 text-right">{formatHours(value.rows[index].laborHours)}</td><td className="p-3 text-right">{formatCurrency(value.rows[index].materialCost)}</td>
        </tr>)}</tbody>
      </table></DataTable>
    </details>
    {document.scope && <p className="mt-4 whitespace-pre-wrap text-sm">Omfattning: {document.scope}</p>}
    {document.terms && <p className="mt-2 whitespace-pre-wrap text-sm">Villkor: {document.terms}</p>}
  </>;
}

export default function ProjectCalculations({ projectId, projectName, active }: { projectId: string; projectName: string; active: boolean }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<{ data: unknown; value: CalculationPreview; file: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const sequence = useRef(0);
  const saving = useRef(false);
  const list = useQuery({ queryKey: ['project-calculations', projectId], queryFn: () => projectCalculationsApi.list(projectId) });
  const drafts = useQuery({ queryKey: ['calculation-drafts', projectId], queryFn: () => projectCalculationsApi.drafts(projectId) });
  const currentId = selected || list.data?.[0]?.id;
  const detail = useQuery({ queryKey: ['project-calculation', projectId, currentId], queryFn: () => projectCalculationsApi.get(projectId, currentId!), enabled: Boolean(currentId) });
  const save = useMutation({
    mutationFn: (value: NonNullable<typeof preview>) => projectCalculationsApi.save(projectId, value.data, value.value.fingerprint),
    onSuccess: result => { setSelected(result.id); setPreview(null); setReviewed(false); toast.success(result.duplicate ? 'Versionen finns redan på projektet.' : 'Kalkylversionen är sparad.'); void cache.invalidateQueries({ queryKey: ['project-calculations', projectId] }); },
    onError: (e: Error) => setError(e.message),
    onSettled: () => { saving.current = false; },
  });
  async function choose(file?: File) {
    const request = ++sequence.current;
    setPreview(null); setReviewed(false); setError('');
    if (!file) { setReading(false); return; }
    setReading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Kalkylfilen får vara högst 2 MB.');
      const data: unknown = JSON.parse(await file.text());
      const value = await projectCalculationsApi.preview(projectId, data);
      if (sequence.current === request) setPreview({ data, value, file: file.name });
    } catch (e) { if (sequence.current === request) setError(e instanceof SyntaxError ? 'Filen är inte en giltig kalkylexport.' : (e as Error).message); }
    finally { if (sequence.current === request) setReading(false); }
  }
  if (list.isLoading) return <p role="status">Laddar kalkyler…</p>;
  if (list.isError) return <QueryError title="Kalkylerna kunde inte hämtas" onRetry={() => void list.refetch()} />;
  return <div className="space-y-5">
    <TaskSection title="Gör kalkylen i TidApp">
      <p className="mb-4 text-sm">Skapa arbetsmoment, välj material och räkna på jobbet här. Spara ett utkast och lås kalkylversionen när den är klar.</p>
      {active && <Link className="btn-primary inline-flex" to={`/projects/${projectId}/calculations/${crypto.randomUUID()}`}>Ny kalkyl</Link>}
      {drafts.isLoading && <p role="status">Laddar utkast…</p>}
      {drafts.isError && <QueryError title="Utkasten kunde inte hämtas" onRetry={() => void drafts.refetch()} />}
      {Boolean(drafts.data?.length) && <ul className="mt-4 divide-y divide-graphite-100">{drafts.data!.map(draft => <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{draft.name} <span className="text-xs text-graphite-600">· Utkast · {formatDate(draft.updatedAt)}</span></span><Link className="btn-secondary inline-flex" to={`/projects/${projectId}/calculations/${draft.id}`}>Öppna utkast</Link></li>)}</ul>}
    </TaskSection>
    <TaskSection title="Importera från Anderssons Kalkyl">
      <p className="mb-2 text-sm font-medium">Projekt: {projectName}</p>
      <p className="mb-3 text-sm text-graphite-600">Har du en äldre desktopkalkyl? Välj en exporterad fil och granska innehållet. Därefter kan du kopiera versionen och fortsätta arbeta i TidApp.</p>
      {active ? <FormField label="Kalkylfil (.json)" controlId="calculation-file"><input id="calculation-file" className="input py-2" type="file" accept=".json,application/json" disabled={save.isPending} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} /></FormField> : <p>Projektet är inaktivt. Sparade kalkylversioner kan läsas.</p>}
      {reading && <p role="status" className="mt-3">Kontrollerar kalkylen…</p>}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      {preview && <div className="mt-5 border-t border-graphite-200 pt-4">
        <h3 className="font-semibold">Granska: {preview.value.document.name}</h3><p className="mt-1 break-all text-xs text-graphite-600">{preview.file}</p>
        <CalculationDetails value={preview.value} />
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 py-3"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={reviewed} disabled={save.isPending} onChange={e => setReviewed(e.target.checked)} /><span className="text-sm">Jag har kontrollerat kalkylen och att den hör till projektet {projectName}.</span></label>
        <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={!reviewed || save.isPending} onClick={() => { if (!reviewed || saving.current) return; saving.current = true; setError(''); save.mutate(preview); }}>{save.isPending ? 'Sparar…' : 'Spara låst kalkylversion'}</button><button className="btn-secondary" disabled={save.isPending} onClick={() => { setPreview(null); setReviewed(false); setError(''); }}>Avbryt</button></div>
      </div>}
    </TaskSection>
    {!list.data?.length ? <EmptyState title="Ingen kalkyl sparad" description="Låsta kalkylversioner visas här. Börja med Ny kalkyl eller importera en äldre kalkyl." /> : <TaskSection title="Låsta kalkylversioner">
      <FormField label="Sparad version" controlId="calculation-version"><select id="calculation-version" className="input" value={currentId || ''} onChange={e => setSelected(e.target.value)}>{list.data.map(item => <option key={item.id} value={item.id}>{item.name} · källversion {item.sourceRevision} · {formatDate(item.createdAt)}</option>)}</select></FormField>
      {detail.isLoading && <p role="status">Laddar version…</p>}
      {detail.isError && <QueryError title="Versionen kunde inte hämtas" onRetry={() => void detail.refetch()} />}
      {detail.data && <div className="mt-4"><StatusBadge label="Låst" tone="slate" /><p className="my-2 text-xs text-graphite-600">Sparad {formatDate(detail.data.createdAt)} av {detail.data.importedBy}. Källa: {detail.data.document.id.startsWith('tidapp-') ? 'TidApp' : 'Anderssons Kalkyl'}.</p><CalculationDetails value={detail.data} />{active && <Link className="btn-secondary mt-4 inline-flex" to={`/projects/${projectId}/calculations/${crypto.randomUUID()}?copy=${detail.data.id}`}>Kopiera till nytt utkast</Link>}</div>}
    </TaskSection>}
  </div>;
}
