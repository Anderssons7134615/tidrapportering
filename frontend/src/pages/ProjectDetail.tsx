import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Edit2, FileSpreadsheet, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { MaterialArticle, Project, ProjectMaterial, ProjectSummary, TimeEntry } from '../types';
import { AppShell, Button, DataList, DataRow, DataTable, EmptyState, FormField, KpiCard, PageHeader, StatusBadge, Tabs, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { formatCurrency, formatDate, formatHours, formatPercent, parseSwedishNumber, toDateInputValue } from '../utils/format';
import { searchMaterialArticles } from '../utils/materialSearch';

const tabs = [
  { id: 'overview', label: 'Översikt' },
  { id: 'materials', label: 'Material' },
  { id: 'hours', label: 'Tid' },
  { id: 'summary', label: 'Ekonomi' },
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
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);

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

  const {
    data: materialArticles,
    isLoading: isLoadingMaterialArticles,
    isError: materialArticlesFailed,
    refetch: refetchMaterialArticles,
  } = useQuery({
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
  const activeMaterialArticles = (materialArticles || []) as MaterialArticle[];
  const projectSummary = summary as ProjectSummary | undefined;
  const canSeeMoney = Boolean(p?.resultsVisibleToCurrentUser || materialsResponse?.costVisibleToCurrentUser || projectSummary?.resultsVisibleToCurrentUser);
  const selectedMaterialArticle = activeMaterialArticles.find((article) => article.id === materialForm.articleId);

  const recentMaterialArticles = useMemo(() => {
    const seen = new Set<string>();
    const recent: MaterialArticle[] = [];

    for (const material of materials) {
      if (seen.has(material.articleId)) continue;
      const article = activeMaterialArticles.find((candidate) => candidate.id === material.articleId);
      if (!article) continue;
      seen.add(article.id);
      recent.push(article);
      if (recent.length === 6) break;
    }

    return recent;
  }, [activeMaterialArticles, materials]);

  const materialMatches = useMemo(() => (
    materialSearch.trim()
      ? searchMaterialArticles(activeMaterialArticles, materialSearch).slice(0, 12)
      : recentMaterialArticles
  ), [activeMaterialArticles, materialSearch, recentMaterialArticles]);

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
      setMaterialSearch('');
      setMaterialPickerOpen(false);
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
      setMaterialSearch('');
      setMaterialPickerOpen(false);
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
    setMaterialSearch(item.articleName);
    setMaterialPickerOpen(false);
    setActiveTab('materials');
  };

  const cancelEditMaterial = () => {
    setEditingMaterial(null);
    setMaterialForm(emptyMaterialForm());
    setMaterialSearch('');
    setMaterialPickerOpen(false);
  };

  const selectMaterialArticle = (article: MaterialArticle) => {
    setMaterialForm((current) => ({ ...current, articleId: article.id }));
    setMaterialSearch(article.name);
    setMaterialPickerOpen(false);
  };

  const onMaterialSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingMaterial) updateMaterialMutation.mutate();
    else createMaterialMutation.mutate();
  };

  if (isLoading) return <TaskSection>Laddar projekt...</TaskSection>;

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
          <TaskSection className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="section-title">Projektläge</h2>
                <p className="mt-1 text-sm text-slate-500">Budget, timmar och senaste händelser i ett snabbare arbetsläge.</p>
              </div>
              <StatusBadge label={p.status === 'COMPLETED' ? 'Avslutad' : p.status === 'ONGOING' ? 'Pågående' : 'Planerad'} tone={p.status === 'COMPLETED' ? 'gray' : 'green'} />
            </div>
            <BudgetPanel budgetHours={p.budgetHours} totalHours={projectSummary?.totals.totalHours ?? metrics?.totalHours} usage={budgetUsage} />
            <WarningList warnings={[...(metrics?.warnings || []), ...(projectSummary?.warnings || [])]} />
          </TaskSection>

          <TaskSection title="Ekonomi">
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
          </TaskSection>

          <TaskSection title="Senaste tidrader">
            <SimpleEntries entries={(projectSummary?.recentEntries?.length ? projectSummary.recentEntries : entries).slice(0, 6)} />
          </TaskSection>

          <TaskSection title="Team och veckor">
            {managerSummary?.employeeBreakdown?.length ? (
              <DataList>
                {managerSummary.employeeBreakdown.slice(0, 5).map((row) => (
                  <DataRow key={`${row.userId}-${row.weekStartDate || row.userName}`} className="min-h-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-graphite-950">{row.userName}</span>
                      <span className="text-sm font-semibold">{formatHours(row.totalHours)}</span>
                    </div>
                    {row.weekNumber && <p className="mt-1 text-xs text-graphite-500">Vecka {row.weekNumber}</p>}
                  </DataRow>
                ))}
              </DataList>
            ) : (
              <EmptyState title="Ingen teamdata" description="När tid rapporteras visas personer och veckor här." />
            )}
          </TaskSection>
        </div>
      )}

      {activeTab === 'materials' && (
        <TaskSection>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="section-title">Registrera material</h2>
              <p className="mt-1 text-sm text-slate-500">Sök fram artikeln, ange antal och spara. Datumet är förvalt till idag.</p>
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

          <div className="material-inline-summary">
            <span><strong>{materials.length.toLocaleString('sv-SE')}</strong> materialrader</span>
            <span><strong>{(materialsResponse?.totals.quantity || 0).toLocaleString('sv-SE')}</strong> totalt antal</span>
            {canSeeMoney && <span><strong>{formatCurrency(materialsResponse?.totals.amount)}</strong> materialvärde</span>}
          </div>

          {isLoadingMaterialArticles ? (
            <p className="mb-5 border-y border-graphite-200 py-5 text-sm text-graphite-600" role="status">
              Laddar materialregister...
            </p>
          ) : materialArticlesFailed ? (
            <div className="mb-5">
              <QueryError
                title="Materialregistret kunde inte hämtas"
                description="Kontrollera anslutningen och försök igen. Inget har ändrats på projektet."
                onRetry={() => void refetchMaterialArticles()}
              />
            </div>
          ) : !activeMaterialArticles.length ? (
            <div className="mb-5">
              <EmptyState
                title="Materialregistret är tomt"
                description={isManager ? 'Importera prislistan under Material innan material kan registreras på projekt.' : 'Be en arbetsledare importera företagets materialregister.'}
              />
              {isManager && <Link to="/materials" className="text-link mt-3 inline-flex">Öppna materialregistret</Link>}
            </div>
          ) : (
            <form onSubmit={onMaterialSubmit} className="material-entry-form">
              <MaterialArticlePicker
                articles={activeMaterialArticles}
                matches={materialMatches}
                recentCount={recentMaterialArticles.length}
                value={materialSearch}
                selectedArticle={selectedMaterialArticle}
                open={materialPickerOpen}
                disabled={Boolean(editingMaterial)}
                onOpenChange={setMaterialPickerOpen}
                onChange={(value) => {
                  setMaterialSearch(value);
                  setMaterialPickerOpen(true);
                  if (materialForm.articleId) {
                    setMaterialForm((current) => ({ ...current, articleId: '' }));
                  }
                }}
                onSelect={selectMaterialArticle}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(9rem,0.55fr)_minmax(10rem,0.7fr)_minmax(14rem,1.4fr)_auto]">
                <FormField label={selectedMaterialArticle ? `Antal (${selectedMaterialArticle.unit})` : 'Antal'}>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={materialForm.quantity}
                    onChange={(event) => setMaterialForm((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="0"
                    required
                  />
                </FormField>
                <FormField label="Datum">
                  <input type="date" className="input" value={materialForm.date} onChange={(event) => setMaterialForm((current) => ({ ...current, date: event.target.value }))} />
                </FormField>
                <FormField label="Kommentar">
                  <input className="input" value={materialForm.note} onChange={(event) => setMaterialForm((current) => ({ ...current, note: event.target.value }))} placeholder="Valfritt" />
                </FormField>
                <div className="flex items-end gap-2">
                  <Button type="submit" isLoading={createMaterialMutation.isPending || updateMaterialMutation.isPending} disabledReason={!materialForm.articleId ? 'Välj artikel' : !materialForm.quantity ? 'Ange antal' : null}>
                    {editingMaterial ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingMaterial ? 'Spara' : 'Lägg till'}
                  </Button>
                  {editingMaterial && (
                    <button type="button" className="icon-button" onClick={cancelEditMaterial} title="Avbryt redigering" aria-label="Avbryt redigering">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}

          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-graphite-950">Använt material</h3>
            <span className="text-xs tabular-nums text-graphite-500">{materials.length.toLocaleString('sv-SE')} rader</span>
          </div>
          <MaterialsTable
            materials={materials}
            canSeeMoney={canSeeMoney}
            onEdit={startEditMaterial}
            onDelete={(item) => deleteMaterialMutation.mutate(item.id)}
          />
        </TaskSection>
      )}

      {activeTab === 'hours' && (
        <TaskSection title="Tid">
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
        </TaskSection>
      )}

      {activeTab === 'summary' && (
        <SummaryPanel summary={projectSummary} project={p} canSeeMoney={canSeeMoney} />
      )}

      {activeTab === 'notes' && (
        <TaskSection title="Anteckningar">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{p.notes || 'Inga anteckningar finns på projektet ännu.'}</p>
        </TaskSection>
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
    <div className="border-y border-graphite-200 bg-graphite-50 px-4 py-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-graphite-950">Budgetförbrukning</span>
        <span className="font-semibold">{budgetHours ? formatPercent(usage) : 'Löpande jobb'}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${tone}`} style={{ width: budgetHours ? `${bounded}%` : '100%' }} />
      </div>
      <p className="mt-2 text-xs text-graphite-500">{formatHours(totalHours)} rapporterat {budgetHours ? `av ${formatHours(budgetHours)}` : 'utan timbudget'}</p>
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
    <DataList>
      {entries.map((entry) => (
        <DataRow key={entry.id} className="min-h-0 text-sm">
          <span>{formatDate(entry.date)} · {entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'}</span>
          <strong>{formatHours(entry.hours)}</strong>
        </DataRow>
      ))}
    </DataList>
  );
}

function MaterialArticlePicker({
  articles,
  matches,
  recentCount,
  value,
  selectedArticle,
  open,
  disabled,
  onOpenChange,
  onChange,
  onSelect,
}: {
  articles: MaterialArticle[];
  matches: MaterialArticle[];
  recentCount: number;
  value: string;
  selectedArticle?: MaterialArticle;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onSelect: (article: MaterialArticle) => void;
}) {
  const resultLabel = value.trim() ? 'Sökresultat' : 'Senast använda på projektet';
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  const matchesRef = useRef(matches);
  const activeOption = activeIndex >= 0 ? matches[activeIndex] : undefined;
  matchesRef.current = matches;

  const setActiveOptionIndex = (index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  useEffect(() => {
    if (!open || !activeOption) return;
    document.getElementById(`project-material-option-${activeOption.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeOption, open]);

  const moveActiveOption = (direction: 1 | -1) => {
    const availableMatches = matchesRef.current;
    if (!availableMatches.length) return;
    onOpenChange(true);
    const current = activeIndexRef.current;
    const next = current < 0
      ? direction === 1 ? 0 : availableMatches.length - 1
      : (current + direction + availableMatches.length) % availableMatches.length;
    setActiveOptionIndex(next);
  };

  const chooseArticle = (article: MaterialArticle) => {
    setActiveOptionIndex(-1);
    onSelect(article);
  };

  return (
    <div
      className="material-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onOpenChange(false);
          setActiveOptionIndex(-1);
        }
      }}
    >
      <label htmlFor="project-material-search" className="label">Artikel</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-500" aria-hidden="true" />
        <input
          id="project-material-search"
          role="combobox"
          aria-expanded={open}
          aria-controls="project-material-results"
          aria-activedescendant={open && activeOption ? `project-material-option-${activeOption.id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className="input pl-10 pr-11"
          value={value}
          onFocus={() => {
            onOpenChange(true);
            matchesRef.current = matches;
            setActiveOptionIndex(matches.length ? 0 : -1);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            const nextMatches = nextValue.trim()
              ? searchMaterialArticles(articles, nextValue).slice(0, 12)
              : matches;
            matchesRef.current = nextMatches;
            onChange(nextValue);
            setActiveOptionIndex(nextMatches.length ? 0 : -1);
          }}
          onKeyDown={(event) => {
            const availableMatches = matchesRef.current;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveActiveOption(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveActiveOption(-1);
            } else if (event.key === 'Home' && availableMatches.length) {
              event.preventDefault();
              onOpenChange(true);
              setActiveOptionIndex(0);
            } else if (event.key === 'End' && availableMatches.length) {
              event.preventDefault();
              onOpenChange(true);
              setActiveOptionIndex(availableMatches.length - 1);
            } else if (event.key === 'Enter' && activeIndexRef.current >= 0 && availableMatches[activeIndexRef.current]) {
              event.preventDefault();
              chooseArticle(availableMatches[activeIndexRef.current]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onOpenChange(false);
              setActiveOptionIndex(-1);
            }
          }}
          placeholder="Sök AF215, rörskål 22-30 eller artikelnummer"
          disabled={disabled}
        />
        {value && !disabled && (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex min-h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-md text-graphite-500 hover:bg-graphite-100 hover:text-graphite-950"
            onClick={() => {
              matchesRef.current = [];
              onChange('');
              setActiveOptionIndex(-1);
            }}
            aria-label="Rensa materialsökning"
            title="Rensa"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {selectedArticle && (
        <div className="material-picker-selection" aria-live="polite">
          <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <strong>{selectedArticle.name}</strong>
          <span>{selectedArticle.articleNumber || 'Utan artikelnr'}</span>
          <span>{selectedArticle.category} · {selectedArticle.unit}</span>
        </div>
      )}

      {open && !disabled && (
        <div id="project-material-results" role="listbox" aria-label={resultLabel} className="material-picker-results">
          <div className="material-picker-results-label">{resultLabel}</div>
          {!value.trim() && recentCount === 0 ? (
            <p className="px-3 py-4 text-sm text-graphite-600">Börja skriva namn, dimension eller artikelnummer.</p>
          ) : !matches.length ? (
            <p className="px-3 py-4 text-sm text-graphite-600">Ingen artikel matchar sökningen.</p>
          ) : (
            matches.map((article, index) => (
              <button
                key={article.id}
                id={`project-material-option-${article.id}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className="material-picker-option"
                onPointerMove={() => setActiveOptionIndex(index)}
                onClick={() => chooseArticle(article)}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-graphite-950">{article.name}</strong>
                  <span className="mt-0.5 block truncate text-xs text-graphite-500">
                    {[article.articleNumber, article.category, article.supplier].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-graphite-600">{article.unit}</span>
              </button>
            ))
          )}
          {value.trim() && matches.length > 0 && (
            <div className="border-t border-graphite-200 px-3 py-2 text-xs text-graphite-500">
              Visar {matches.length} av {articles.length.toLocaleString('sv-SE')} artiklar
            </div>
          )}
        </div>
      )}
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
      <TaskSection>
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
      </TaskSection>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TaskSection title="Per person">
          {summary.byUser.length ? (
            <div className="space-y-2">
              {summary.byUser.map((row) => <Line key={row.userId} label={row.userName} value={formatHours(row.hours)} />)}
            </div>
          ) : <EmptyState title="Ingen attesterad tid" />}
        </TaskSection>
        <TaskSection title="Per arbetsmoment">
          {summary.byActivity.length ? (
            <div className="space-y-2">
              {summary.byActivity.map((row) => <Line key={row.activityId} label={row.activityName} value={formatHours(row.hours)} />)}
            </div>
          ) : <EmptyState title="Inga arbetsmoment" />}
        </TaskSection>
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
