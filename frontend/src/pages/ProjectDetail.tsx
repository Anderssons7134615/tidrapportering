import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { MaterialArticle, Project, ProjectMaterial, TimeEntry } from '../types';
import { AppShell, Button, Card, DataTable, EmptyState, FormField, KpiCard, PageHeader, StatusBadge, Tabs } from '../components/ui/design';
import { formatCurrency, formatDate, formatHours, formatPercent, parseSwedishNumber } from '../utils/format';

const tabs = [
  { id: 'overview', label: 'Översikt' },
  { id: 'hours', label: 'Timmar' },
  { id: 'materials', label: 'Material' },
  { id: 'notes', label: 'Anteckningar' },
];

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [activeTab, setActiveTab] = useState('overview');
  const [materialForm, setMaterialForm] = useState({
    articleId: '',
    quantity: '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['project', id, 'time-entries'],
    queryFn: () => projectsApi.listTimeEntries(id),
    enabled: !!id && (isManager || Boolean(project?.employeeCanSeeResults)),
  });

  useQuery({
    queryKey: ['project', id, 'manager-summary'],
    queryFn: () => projectsApi.getManagerSummary(id),
    enabled: !!id && isManager,
  });

  const { data: materialArticles } = useQuery({
    queryKey: ['material-articles', 'active'],
    queryFn: () => projectsApi.listMaterialArticles(true),
    enabled: !!id,
  });

  const { data: materialsResponse } = useQuery({
    queryKey: ['project', id, 'materials'],
    queryFn: () => projectsApi.listMaterials(id),
    enabled: !!id,
  });

  const p = project as Project | undefined;
  const metrics = p?.metrics;
  const entries = (timeEntries || []) as TimeEntry[];
  const materials = materialsResponse?.items || [];
  const canViewMoney = isManager || Boolean(p?.employeeCanSeeResults);

  const createMaterialMutation = useMutation({
    mutationFn: () => projectsApi.createMaterial(id, {
      articleId: materialForm.articleId,
      quantity: parseSwedishNumber(materialForm.quantity),
      date: new Date(`${materialForm.date}T12:00:00`).toISOString(),
      note: materialForm.note || undefined,
    }),
    onSuccess: () => {
      toast.success('Material sparat');
      setMaterialForm((current) => ({ ...current, quantity: '', note: '' }));
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id, 'materials'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (materialId: string) => projectsApi.deleteMaterial(id, materialId),
    onSuccess: () => {
      toast.success('Materialrad borttagen');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id, 'materials'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const groupedByPerson = useMemo(() => {
    const rows = new Map<string, { name: string; hours: number }>();
    entries.forEach((entry) => {
      const key = entry.userId;
      const row = rows.get(key) || { name: entry.user?.name || 'Okänd', hours: 0 };
      row.hours += entry.hours;
      rows.set(key, row);
    });
    return Array.from(rows.values()).sort((a, b) => b.hours - a.hours);
  }, [entries]);

  if (isLoading) return <Card>Laddar projekt...</Card>;

  if (!p) {
    return (
      <AppShell>
        <Link to="/projects" className="btn-secondary inline-flex"><ArrowLeft className="h-4 w-4" /> Tillbaka</Link>
        <EmptyState title="Projektet kunde inte hämtas" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to="/projects" className="btn-secondary inline-flex w-fit"><ArrowLeft className="h-4 w-4" /> Tillbaka</Link>
      <PageHeader
        title={p.name}
        description={`${p.code} · ${p.customer?.name || 'Intern'}${metrics?.lastActivityAt ? ` · Senaste aktivitet ${formatDate(metrics.lastActivityAt)}` : ''}`}
        action={metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Totala timmar" value={formatHours(metrics?.totalHours)} tone="blue" />
        <KpiCard label="Denna vecka" value={formatHours(metrics?.weekHours)} tone="blue" />
        <KpiCard label="Arbetskostnad" value={canViewMoney ? formatCurrency(metrics?.laborCost) : 'Doljt'} />
        <KpiCard label="Materialkostnad" value={canViewMoney ? formatCurrency(metrics?.materialCost) : 'Doljt'} />
        <KpiCard label="Budgetförbrukning" value={p.budgetHours ? formatPercent(metrics?.budgetUsagePercent) : 'Löpande jobb'} tone={(metrics?.budgetUsagePercent || 0) >= 80 ? 'red' : 'green'} />
        <KpiCard label="Resultat / marginal" value={canViewMoney && metrics?.projectResult != null ? formatCurrency(metrics.projectResult) : '-'} hint={canViewMoney ? formatPercent(metrics?.marginPercent) : undefined} />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
          <Card>
            <h2 className="section-title mb-3">Varningar</h2>
            {metrics?.warnings?.length ? (
              <div className="space-y-2">
                {metrics.warnings.map((warning) => <StatusBadge key={warning} label={warning} tone={warning.includes('budget') ? 'yellow' : 'red'} />)}
              </div>
            ) : (
              <EmptyState title="Inga varningar" description={p.budgetHours ? 'Projektets budget och priser ser kompletta ut.' : 'Projektet är markerat som löpande eftersom ingen budget är angiven.'} />
            )}
          </Card>
          <Card>
            <h2 className="section-title mb-3">Projektläge</h2>
            <div className="space-y-2 text-sm">
              <Line label="Timmar totalt" value={formatHours(metrics?.totalHours)} />
              <Line label="Timmar denna vecka" value={formatHours(metrics?.weekHours)} />
              <Line label="Kostnad hittills" value={formatCurrency((metrics?.laborCost || 0) + (metrics?.materialCost || 0))} />
              <Line label="Budgetförbrukning" value={p.budgetHours ? formatPercent(metrics?.budgetUsagePercent) : 'Löpande jobb'} />
            </div>
          </Card>
          <Card>
            <h2 className="section-title mb-3">Senaste tidrader</h2>
            <SimpleEntries entries={entries.slice(0, 6)} />
          </Card>
          <Card>
            <h2 className="section-title mb-3">Senaste material</h2>
            <SimpleMaterials materials={materials.slice(0, 6)} />
          </Card>
        </div>
      )}

      {activeTab === 'hours' && (
        <Card>
          <h2 className="section-title mb-3">Timmar</h2>
          <DataTable>
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2">Datum</th><th className="px-3 py-2">Anställd</th><th className="px-3 py-2">Aktivitet</th><th className="px-3 py-2">Timmar</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Kommentar</th></tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2">{entry.user?.name}</td>
                    <td className="px-3 py-2">{entry.activity?.name || 'Saknar aktivitet'}</td>
                    <td className="px-3 py-2 font-semibold">{formatHours(entry.hours)}</td>
                    <td className="px-3 py-2">{entry.status}</td>
                    <td className="px-3 py-2">{entry.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            {groupedByPerson.map((row) => <KpiCard key={row.name} label={row.name} value={formatHours(row.hours)} />)}
          </div>
        </Card>
      )}

      {activeTab === 'materials' && (
        <Card>
          <h2 className="section-title mb-3">Material</h2>
          <form onSubmit={(event) => { event.preventDefault(); createMaterialMutation.mutate(); }} className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_0.5fr_0.6fr_1fr_auto]">
            <FormField label="Artikel">
              <select className="input" value={materialForm.articleId} onChange={(event) => setMaterialForm((current) => ({ ...current, articleId: event.target.value }))} required>
                <option value="">Välj artikel</option>
                {(materialArticles as MaterialArticle[] | undefined)?.map((article) => <option key={article.id} value={article.id}>{article.articleNumber ? `${article.articleNumber} · ` : ''}{article.name} ({article.unit})</option>)}
              </select>
            </FormField>
            <FormField label="Antal"><input className="input" value={materialForm.quantity} onChange={(event) => setMaterialForm((current) => ({ ...current, quantity: event.target.value }))} required /></FormField>
            <FormField label="Datum"><input type="date" className="input" value={materialForm.date} onChange={(event) => setMaterialForm((current) => ({ ...current, date: event.target.value }))} /></FormField>
            <FormField label="Kommentar"><input className="input" value={materialForm.note} onChange={(event) => setMaterialForm((current) => ({ ...current, note: event.target.value }))} /></FormField>
            <Button type="submit" isLoading={createMaterialMutation.isPending} disabledReason={!materialForm.articleId ? 'Välj artikel' : !materialForm.quantity ? 'Ange antal' : null}><Plus className="h-4 w-4" /> Lägg till</Button>
          </form>
          <SimpleMaterials materials={materials} onDelete={(item) => deleteMaterialMutation.mutate(item.id)} />
        </Card>
      )}

      {activeTab === 'notes' && (
        <Card>
          <h2 className="section-title mb-3">Anteckningar</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{p.notes || 'Inga anteckningar finns på projektet ännu.'}</p>
        </Card>
      )}
    </AppShell>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-900">{value}</span></div>;
}

function SimpleEntries({ entries }: { entries: TimeEntry[] }) {
  if (!entries.length) return <EmptyState title="Inga tidrader" />;
  return <div className="space-y-2">{entries.map((entry) => <div key={entry.id} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{formatDate(entry.date)} · {entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'}</span><strong>{formatHours(entry.hours)}</strong></div>)}</div>;
}

function SimpleMaterials({ materials, onDelete }: { materials: ProjectMaterial[]; onDelete?: (item: ProjectMaterial) => void }) {
  if (!materials.length) return <EmptyState title="Inget material" description="Registrera material från projektets materialflik." />;
  return (
    <DataTable>
      <table className="min-w-full text-sm">
        <thead className="table-head"><tr><th className="px-3 py-2">Datum</th><th className="px-3 py-2">Artikel</th><th className="px-3 py-2">Antal</th><th className="px-3 py-2">Belopp</th>{onDelete && <th className="px-3 py-2" />}</tr></thead>
        <tbody>
          {materials.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="px-3 py-2">{formatDate(item.date)}</td>
              <td className="px-3 py-2">{item.articleName}</td>
              <td className="px-3 py-2">{item.quantity.toLocaleString('sv-SE')} {item.unit}</td>
              <td className="px-3 py-2">{formatCurrency(item.lineTotal)}</td>
              {onDelete && <td className="px-3 py-2 text-right"><button className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(item)}><Trash2 className="h-4 w-4" /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}
