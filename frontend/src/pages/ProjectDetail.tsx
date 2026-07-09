import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Edit2, FileSpreadsheet, Plus, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { MaterialArticle, Project, ProjectMaterial, ProjectSummary, TimeEntry } from '../types';
import { AppShell, Button, Card, DataTable, EmptyState, FormField, KpiCard, PageHeader, StatusBadge, Tabs } from '../components/ui/design';
import { formatCurrency, formatDate, formatHours, formatPercent, parseSwedishNumber, toDateInputValue } from '../utils/format';

const tabs = [
  { id: 'overview', label: 'Översikt' },
  { id: 'materials', label: 'Material' },
  { id: 'hours', label: 'Timmar' },
  { id: 'summary', label: 'Sammanfattning' },
  { id: 'notes', label: 'Anteckningar' },
];

type MaterialForm = {
  articleId: string;
  quantity: string;
  date: string;
  note: string;
};

const emptyMaterialForm = (): MaterialForm => ({
  articleId: '',
  quantity: '',
  date: toDateInputValue(new Date()),
  note: '',
});

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [activeTab, setActiveTab] = useState('overview');
  const [materialForm, setMaterialForm] = useState<MaterialForm>(emptyMaterialForm);
  const [editingMaterial, setEditingMaterial] = useState<ProjectMaterial | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ['project', id, 'summary'],
    queryFn: () => projectsApi.getSummary(id),
    enabled: !!id,
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['project', id, 'time-entries'],
    queryFn: () => projectsApi.listTimeEntries(id),
    enabled: !!id && Boolean(project?.resultsVisibleToCurrentUser || project?.employeeCanSeeResults || isManager),
  });

  const { data: managerSummary } = useQuery({
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
  const projectSummary = summary as ProjectSummary | undefined;
  const canSeeMoney = Boolean(p?.resultsVisibleToCurrentUser || materialsResponse?.costVisibleToCurrentUser || projectSummary?.resultsVisibleToCurrentUser);

  const createMaterialMutation = useMutation({
    mutationFn: () => projectsApi.createMaterial(id, {
      articleId: materialForm.articleId,
      quantity: parseSwedishNumber(materialForm.quantity),
      date: new Date(`${materialForm.date}T12:00:00`).toISOString(),
      note: materialForm.note || undefined,
    }),
    onSuccess: () => {
      toast.success('Material sparat');
      setMaterialForm(emptyMaterialForm());
      invalidateProjectData(queryClient, id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMaterialMutation = useMutation({
    mutationFn: () => {
      if (!editingMaterial) throw new Error('Ingen materialrad vald');
      return projectsApi.updateMaterial(id, editingMaterial.id, {
        quantity: parseSwedishNumber(materialForm.quantity),
        date: new Date(`${materialForm.date}T12:00:00`).toISOString(),
        note: materialForm.note || null,
      });
    },
    onSuccess: () => {
      toast.success('Materialrad uppdaterad');
      setEditingMaterial(null);
      setMaterialForm(emptyMaterialForm());
      invalidateProjectData(queryClient, id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (materialId: string) => projectsApi.deleteMaterial(id, materialId),
    onSuccess: () => {
      toast.success('Materialrad borttagen');
      invalidateProjectData(queryClient, id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => projectsApi.importProjectMaterialsExcel(id, file),
    onSuccess: (result) => {
      setImportErrors(result.errors || []);
      toast.success(`Importerade ${result.imported} materialrader`);
      invalidateProjectData(queryClient, id);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: async (error: Error) => {
      setImportErrors(((error as any).errors || []) as Array<{ row: number; message: string }>);
      toast.error(error.message || 'Importen misslyckades');
    },
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

  const budgetUsage = metrics?.budgetUsagePercent ?? projectSummary?.metrics?.budgetUsagePercent ?? null;
  const result = projectSummary?.totals.result ?? metrics?.projectResult ?? null;
  const margin = projectSummary?.totals.marginPercent ?? metrics?.marginPercent ?? null;
  const summaryTone = result == null ? 'slate' : result >= 0 ? 'green' : 'red';

  const startEditMaterial = (item: ProjectMaterial) => {
    setEditingMaterial(item);
    setMaterialForm({
      articleId: item.articleId,
      quantity: String(item.quantity).replace('.', ','),
      date: toDateInputValue(item.date),
      note: item.note || '',
    });
    setActiveTab('materials');
  };

  const cancelEditMaterial = () => {
    setEditingMaterial(null);
    setMaterialForm(emptyMaterialForm());
  };

  const onMaterialSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingMaterial) updateMaterialMutation.mutate();
    else createMaterialMutation.mutate();
  };

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
        description={`${p.code} · ${p.customer?.name || 'Intern'}${p.site ? ` · ${p.site}` : ''}${metrics?.lastActivityAt ? ` · Senaste aktivitet ${formatDate(metrics.lastActivityAt)}` : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
            {isManager && (
              <button type="button" className="btn-secondary" onClick={() => setActiveTab('materials')}>
                <Plus className="h-4 w-4" />
                Lägg material
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Attesterade timmar" value={formatHours(projectSummary?.totals.totalHours ?? metrics?.totalHours)} tone="blue" />
        <KpiCard label="Budgetläge" value={p.budgetHours ? formatPercent(budgetUsage) : 'Löpande'} hint={p.budgetHours ? `${formatHours(p.budgetHours)} budget` : 'Ingen timbudget'} tone={(budgetUsage || 0) >= 80 ? 'red' : 'green'} />
        <KpiCard label="Material" value={canSeeMoney ? formatCurrency(projectSummary?.totals.materialSalesValue ?? materialsResponse?.totals.amount) : `${materials.length} rader`} tone="orange" />
        <KpiCard label={p.status === 'COMPLETED' ? 'Slutresultat' : 'Preliminärt resultat'} value={canSeeMoney ? formatCurrency(result) : 'Ej synligt'} hint={canSeeMoney ? formatPercent(margin) : undefined} tone={summaryTone} />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="section-title">Projektläge</h2>
                <p className="mt-1 text-sm text-slate-500">Budget, timmar och senaste händelser i ett snabbare arbetsläge.</p>
              </div>
              <StatusBadge label={p.status === 'COMPLETED' ? 'Avslutad' : p.status === 'ONGOING' ? 'Pågående' : 'Planerad'} tone={p.status === 'COMPLETED' ? 'gray' : 'green'} />
            </div>
            <BudgetPanel budgetHours={p.budgetHours} totalHours={projectSummary?.totals.totalHours ?? metrics?.totalHours} usage={budgetUsage} />
            <WarningList warnings={[...(metrics?.warnings || []), ...(projectSummary?.warnings || [])]} />
          </Card>

          <Card>
            <h2 className="section-title mb-3">Ekonomi</h2>
            {canSeeMoney ? (
              <div className="space-y-2 text-sm">
                <Line label="Intäkt" value={formatCurrency(projectSummary?.totals.revenue)} />
                <Line label="Arbetskostnad" value={formatCurrency(projectSummary?.totals.laborCost)} />
                <Line label="Materialkostnad" value={formatCurrency(projectSummary?.totals.materialCost ?? metrics?.materialCost)} />
                <Line label="Resultat" value={formatCurrency(result)} strong tone={result != null && result < 0 ? 'red' : 'green'} />
              </div>
            ) : (
              <EmptyState title="Ekonomi är dold" description="Projektet visar inte kostnader eller resultat för din roll." />
            )}
          </Card>

          <Card>
            <h2 className="section-title mb-3">Senaste tidrader</h2>
            <SimpleEntries entries={(projectSummary?.recentEntries?.length ? projectSummary.recentEntries : entries).slice(0, 6)} />
          </Card>

          <Card>
            <h2 className="section-title mb-3">Team och veckor</h2>
            {managerSummary?.employeeBreakdown?.length ? (
              <div className="space-y-2">
                {managerSummary.employeeBreakdown.slice(0, 5).map((row) => (
                  <div key={`${row.userId}-${row.weekStartDate || row.userName}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{row.userName}</span>
                      <span className="text-sm font-semibold">{formatHours(row.totalHours)}</span>
                    </div>
                    {row.weekNumber && <p className="mt-1 text-xs text-slate-500">Vecka {row.weekNumber}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Ingen teamdata" description="När tid rapporteras visas personer och veckor här." />
            )}
          </Card>
        </div>
      )}

      {activeTab === 'materials' && (
        <Card>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="section-title">Material</h2>
              <p className="mt-1 text-sm text-slate-500">Lägg in rader manuellt eller importera en Excel-lista direkt på projektet.</p>
            </div>
            {isManager && (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importMutation.mutate(file);
                  }}
                />
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
                  <Upload className="h-4 w-4" />
                  {importMutation.isPending ? 'Importerar...' : 'Importera Excel'}
                </button>
                <button type="button" className="btn-secondary" onClick={async () => {
                  const blob = await projectsApi.downloadMaterialTemplate();
                  downloadBlob(blob, 'materialmall.xlsx');
                }}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Mall
                </button>
              </div>
            )}
          </div>

          {importErrors.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Importen gav radfel</p>
              <ul className="mt-2 space-y-1">
                {importErrors.map((error) => <li key={`${error.row}-${error.message}`}>Rad {error.row}: {error.message}</li>)}
              </ul>
            </div>
          )}

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <KpiCard label="Materialrader" value={materials.length} />
            <KpiCard label="Antal totalt" value={materialsResponse?.totals.quantity?.toLocaleString('sv-SE') || 0} tone="blue" />
            <KpiCard label="Materialvärde" value={canSeeMoney ? formatCurrency(materialsResponse?.totals.amount) : 'Ej synligt'} tone="orange" />
          </div>

          <form onSubmit={onMaterialSubmit} className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_0.5fr_0.6fr_1fr_auto]">
            <FormField label="Artikel">
              <select className="input" value={materialForm.articleId} onChange={(event) => setMaterialForm((current) => ({ ...current, articleId: event.target.value }))} required disabled={Boolean(editingMaterial)}>
                <option value="">Välj artikel</option>
                {(materialArticles as MaterialArticle[] | undefined)?.map((article) => <option key={article.id} value={article.id}>{article.articleNumber ? `${article.articleNumber} · ` : ''}{article.name} ({article.unit})</option>)}
              </select>
            </FormField>
            <FormField label="Antal"><input className="input" value={materialForm.quantity} onChange={(event) => setMaterialForm((current) => ({ ...current, quantity: event.target.value }))} required /></FormField>
            <FormField label="Datum"><input type="date" className="input" value={materialForm.date} onChange={(event) => setMaterialForm((current) => ({ ...current, date: event.target.value }))} /></FormField>
            <FormField label="Kommentar"><input className="input" value={materialForm.note} onChange={(event) => setMaterialForm((current) => ({ ...current, note: event.target.value }))} /></FormField>
            <div className="flex items-end gap-2">
              <Button type="submit" isLoading={createMaterialMutation.isPending || updateMaterialMutation.isPending} disabledReason={!materialForm.articleId ? 'Välj artikel' : !materialForm.quantity ? 'Ange antal' : null}>
                {editingMaterial ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingMaterial ? 'Spara' : 'Lägg till'}
              </Button>
              {editingMaterial && <button type="button" className="btn-secondary" onClick={cancelEditMaterial}><X className="h-4 w-4" /></button>}
            </div>
          </form>

          <MaterialsTable
            materials={materials}
            canSeeMoney={canSeeMoney}
            onEdit={startEditMaterial}
            onDelete={(item) => deleteMaterialMutation.mutate(item.id)}
          />
        </Card>
      )}

      {activeTab === 'hours' && (
        <Card>
          <h2 className="section-title mb-3">Timmar</h2>
          <DataTable>
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2">Datum</th><th className="px-3 py-2">Anställd</th><th className="px-3 py-2">Arbetsmoment</th><th className="px-3 py-2">Timmar</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Kommentar</th></tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2">{entry.user?.name}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">{entry.activity?.name || 'Saknar aktivitet'}</div>
                      <div className="text-xs text-slate-500">{entry.activity?.code || '-'}</div>
                    </td>
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

      {activeTab === 'summary' && (
        <SummaryPanel summary={projectSummary} project={p} canSeeMoney={canSeeMoney} />
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

function invalidateProjectData(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ['project', id] });
  queryClient.invalidateQueries({ queryKey: ['project', id, 'summary'] });
  queryClient.invalidateQueries({ queryKey: ['project', id, 'materials'] });
  queryClient.invalidateQueries({ queryKey: ['projects'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

function BudgetPanel({ budgetHours, totalHours, usage }: { budgetHours?: number | null; totalHours?: number | null; usage?: number | null }) {
  const bounded = Math.max(0, Math.min(usage || 0, 100));
  const tone = (usage || 0) >= 100 ? 'bg-rose-500' : (usage || 0) >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-900">Budgetförbrukning</span>
        <span className="font-semibold">{budgetHours ? formatPercent(usage) : 'Löpande jobb'}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${tone}`} style={{ width: budgetHours ? `${bounded}%` : '100%' }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{formatHours(totalHours)} rapporterat {budgetHours ? `av ${formatHours(budgetHours)}` : 'utan timbudget'}</p>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));
  if (!uniqueWarnings.length) return <EmptyState title="Inga varningar" description="Projektet har inga markerade avvikelser just nu." />;
  return (
    <div className="space-y-2">
      {uniqueWarnings.map((warning) => (
        <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' | 'red' }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? 'font-bold' : 'font-semibold'} ${tone === 'red' ? 'text-rose-700' : tone === 'green' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function SimpleEntries({ entries }: { entries: TimeEntry[] }) {
  if (!entries.length) return <EmptyState title="Inga tidrader" />;
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span>{formatDate(entry.date)} · {entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'}</span>
          <strong>{formatHours(entry.hours)}</strong>
        </div>
      ))}
    </div>
  );
}

function MaterialsTable({
  materials,
  canSeeMoney,
  onEdit,
  onDelete,
}: {
  materials: ProjectMaterial[];
  canSeeMoney: boolean;
  onEdit: (item: ProjectMaterial) => void;
  onDelete: (item: ProjectMaterial) => void;
}) {
  if (!materials.length) return <EmptyState title="Inget material" description="Registrera material manuellt eller importera en Excel-lista." />;
  return (
    <DataTable>
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-2">Datum</th>
            <th className="px-3 py-2">Artikel</th>
            <th className="px-3 py-2">Antal</th>
            {canSeeMoney && <th className="px-3 py-2">Radtotal</th>}
            <th className="px-3 py-2">Kommentar</th>
            <th className="px-3 py-2 text-right">Åtgärd</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="px-3 py-2">{formatDate(item.date)}</td>
              <td className="px-3 py-2">
                <div className="font-semibold text-slate-900">{item.articleName}</div>
                <div className="text-xs text-slate-500">{item.articleNumber || '-'}</div>
              </td>
              <td className="px-3 py-2">{item.quantity.toLocaleString('sv-SE')} {item.unit}</td>
              {canSeeMoney && <td className="px-3 py-2 font-semibold">{formatCurrency(item.lineTotal)}</td>}
              <td className="px-3 py-2">{item.note || '-'}</td>
              <td className="px-3 py-2 text-right">
                <div className="inline-flex gap-1">
                  <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => onEdit(item)} title="Redigera">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => window.confirm('Ta bort materialraden?') && onDelete(item)} title="Ta bort">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

function SummaryPanel({ summary, project, canSeeMoney }: { summary?: ProjectSummary; project: Project; canSeeMoney: boolean }) {
  if (!summary?.resultsVisibleToCurrentUser || !canSeeMoney) {
    return <EmptyState title="Sammanfattning är dold" description="Du saknar behörighet att se projektets ekonomi." />;
  }
  const isCompleted = project.status === 'COMPLETED';
  const result = summary.totals.result;
  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">{isCompleted ? 'Slutsammanfattning' : 'Preliminär sammanfattning'}</h2>
            <p className="mt-1 text-sm text-slate-500">Bygger på attesterade timmar och registrerat material.</p>
          </div>
          <StatusBadge label={isCompleted ? 'Avslutad' : 'Pågående'} tone={isCompleted ? 'gray' : 'green'} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Intäkt" value={formatCurrency(summary.totals.revenue)} tone="blue" />
          <KpiCard label="Kostnad" value={formatCurrency((summary.totals.laborCost || 0) + (summary.totals.materialCost || 0))} tone="orange" />
          <KpiCard label="Resultat" value={formatCurrency(result)} tone={result != null && result < 0 ? 'red' : 'green'} />
          <KpiCard label="Marginal" value={formatPercent(summary.totals.marginPercent)} tone="slate" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="section-title mb-3">Per person</h2>
          {summary.byUser.length ? (
            <div className="space-y-2">
              {summary.byUser.map((row) => <Line key={row.userId} label={row.userName} value={formatHours(row.hours)} />)}
            </div>
          ) : <EmptyState title="Ingen attesterad tid" />}
        </Card>
        <Card>
          <h2 className="section-title mb-3">Per arbetsmoment</h2>
          {summary.byActivity.length ? (
            <div className="space-y-2">
              {summary.byActivity.map((row) => <Line key={row.activityId} label={row.activityName} value={formatHours(row.hours)} />)}
            </div>
          ) : <EmptyState title="Inga arbetsmoment" />}
        </Card>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
