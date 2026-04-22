import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../services/api';
import type { MaterialArticle, Project, ProjectManagerSummary, ProjectMaterial, ProjectMaterialsResponse } from '../types';
import { useAuthStore } from '../stores/authStore';
import {
  ArrowLeft,
  Building2,
  Clock,
  FolderKanban,
  MapPin,
  Package,
  Plus,
  Receipt,
  Trash2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusLabels: Record<string, string> = {
  PLANNED: 'Planerad',
  ONGOING: 'Pagar',
  COMPLETED: 'Avslutad',
  INVOICED: 'Fakturerad',
};

const statusColors: Record<string, string> = {
  PLANNED: 'badge-blue',
  ONGOING: 'badge-green',
  COMPLETED: 'badge-gray',
  INVOICED: 'badge-gray',
};

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('sv-SE');
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '-';
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const [articleForm, setArticleForm] = useState({
    name: '',
    articleNumber: '',
    unit: 'st',
    defaultUnitPrice: '',
  });
  const [materialForm, setMaterialForm] = useState({
    articleId: '',
    quantity: '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id || ''),
    enabled: !!id,
  });

  const { data: managerSummary } = useQuery({
    queryKey: ['project', id, 'manager-summary'],
    queryFn: async () => {
      try {
        return await projectsApi.getManagerSummary(id || '');
      } catch {
        return null;
      }
    },
    enabled: !!id && isManager,
    retry: false,
  });

  const { data: materialArticles } = useQuery({
    queryKey: ['material-articles', 'active'],
    queryFn: () => projectsApi.listMaterialArticles(true),
    enabled: !!id,
  });

  const { data: materialsResponse } = useQuery({
    queryKey: ['project', id, 'materials'],
    queryFn: () => projectsApi.listMaterials(id || ''),
    enabled: !!id,
  });

  const p = project as Project | undefined;
  const summary = managerSummary as ProjectManagerSummary | null | undefined;
  const materials = materialsResponse as ProjectMaterialsResponse | undefined;
  const articles = (materialArticles as MaterialArticle[] | undefined) || [];
  const canViewResults = isManager || !!p?.employeeCanSeeResults;
  const canViewMaterialCosts = isManager || !!materials?.costVisibleToCurrentUser;

  const budgetUsedPercent = useMemo(() => {
    if (!p?.budgetHours || !p.totalHours) return 0;
    return Math.min((p.totalHours / p.budgetHours) * 100, 100);
  }, [p]);

  const remainingHours = useMemo(() => {
    if (!p?.budgetHours) return null;
    return Math.max(p.budgetHours - (p.totalHours || 0), 0);
  }, [p]);

  const createArticleMutation = useMutation({
    mutationFn: () =>
      projectsApi.createMaterialArticle({
        name: articleForm.name.trim(),
        articleNumber: articleForm.articleNumber.trim() || undefined,
        unit: articleForm.unit.trim() || 'st',
        defaultUnitPrice: articleForm.defaultUnitPrice ? parseFloat(articleForm.defaultUnitPrice) : undefined,
      }),
    onSuccess: (created) => {
      toast.success('Materialartikel skapad');
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
      setArticleForm({
        name: '',
        articleNumber: '',
        unit: created.unit || 'st',
        defaultUnitPrice: '',
      });
      setMaterialForm((current) => ({
        ...current,
        articleId: current.articleId || created.id,
      }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMaterialMutation = useMutation({
    mutationFn: () =>
      projectsApi.createMaterial(id || '', {
        articleId: materialForm.articleId,
        quantity: parseFloat(materialForm.quantity),
        date: materialForm.date ? new Date(`${materialForm.date}T12:00:00`).toISOString() : undefined,
        note: materialForm.note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Material sparat pa projektet');
      queryClient.invalidateQueries({ queryKey: ['project', id, 'materials'] });
      setMaterialForm((current) => ({
        ...current,
        quantity: '',
        note: '',
      }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (materialId: string) => projectsApi.deleteMaterial(id || '', materialId),
    onSuccess: () => {
      toast.success('Materialrad borttagen');
      queryClient.invalidateQueries({ queryKey: ['project', id, 'materials'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleArticleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createArticleMutation.mutate();
  };

  const handleMaterialSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createMaterialMutation.mutate();
  };

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === materialForm.articleId),
    [articles, materialForm.articleId]
  );

  if (isLoading) {
    return <div className="card">Laddar projekt...</div>;
  }

  if (error || !p) {
    return (
      <div className="space-y-4">
        <Link to="/projects" className="btn-secondary inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Tillbaka
        </Link>
        <div className="card text-rose-700">Kunde inte hamta projektet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/projects" className="btn-secondary inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Tillbaka
        </Link>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary-100 p-2.5">
              <FolderKanban className="h-5 w-5 text-primary-700" />
            </div>
            <div>
              <h1 className="page-title">{p.name}</h1>
              <p className="text-sm text-slate-500">{p.code}</p>
            </div>
          </div>
          <span className={statusColors[p.status]}>{statusLabels[p.status]}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="surface-muted p-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
              <Building2 className="h-4 w-4" /> Kund
            </p>
            <p className="font-medium text-slate-900">{p.customer?.name || 'Intern'}</p>
          </div>
          <div className="surface-muted p-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-4 w-4" /> Arbetsplats
            </p>
            <p className="font-medium text-slate-900">{p.site || 'Ej satt'}</p>
          </div>

          {canViewResults ? (
            <>
              <div className="surface-muted p-3">
                <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-4 w-4" /> Timmar
                </p>
                <p className="font-medium text-slate-900">
                  {(p.totalHours || 0).toFixed(1)} h
                  {p.budgetHours ? ` / ${p.budgetHours} h` : ''}
                </p>
                {p.budgetHours && (
                  <p className="mt-1 text-xs text-slate-500">
                    Kvar: {remainingHours?.toFixed(1)} h ({budgetUsedPercent.toFixed(0)}% anvant)
                  </p>
                )}
              </div>
              <div className="surface-muted p-3">
                <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                  <Receipt className="h-4 w-4" /> Debitering
                </p>
                <p className="font-medium text-slate-900">
                  {p.billingModel === 'FIXED' ? 'Fastpris' : 'Lopande'}
                  {p.defaultRate ? ` - ${p.defaultRate} kr/h` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Fakturerbara timmar: {(p.billableHours || 0).toFixed(1)} h
                </p>
              </div>
            </>
          ) : (
            <div className="surface-muted p-3 md:col-span-2">
              <p className="text-sm text-slate-700">Projektresultat ar dolt for anstallda i detta projekt.</p>
              <p className="mt-1 text-xs text-slate-500">Du kan fortfarande registrera material pa projektet.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary-700" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Material pa projektet</h2>
                <p className="text-sm text-slate-500">Registrera forbrukat material direkt mot projektet.</p>
              </div>
            </div>

            <form onSubmit={handleMaterialSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Artikel</label>
                  <select
                    value={materialForm.articleId}
                    onChange={(e) => setMaterialForm((current) => ({ ...current, articleId: e.target.value }))}
                    className="input"
                    required
                  >
                    <option value="">Valj artikel...</option>
                    {articles.map((article) => (
                      <option key={article.id} value={article.id}>
                        {article.articleNumber ? `${article.articleNumber} - ` : ''}
                        {article.name} ({article.unit})
                      </option>
                    ))}
                  </select>
                  {articles.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">Lagg upp minst en materialartikel for att kunna registrera material.</p>
                  )}
                </div>

                <div>
                  <label className="label">Datum</label>
                  <input
                    type="date"
                    value={materialForm.date}
                    onChange={(e) => setMaterialForm((current) => ({ ...current, date: e.target.value }))}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Antal</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={materialForm.quantity}
                    onChange={(e) => setMaterialForm((current) => ({ ...current, quantity: e.target.value }))}
                    className="input"
                    placeholder={selectedArticle ? `Antal i ${selectedArticle.unit}` : 'Antal'}
                    required
                  />
                </div>
                <div>
                  <label className="label">Kommentar</label>
                  <input
                    value={materialForm.note}
                    onChange={(e) => setMaterialForm((current) => ({ ...current, note: e.target.value }))}
                    className="input"
                    placeholder="Ex. monterat i lagenhet 2"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-600">
                  {selectedArticle ? (
                    <>
                      <span className="font-medium text-slate-900">{selectedArticle.name}</span>
                      <span> registreras i </span>
                      <span className="font-medium text-slate-900">{selectedArticle.unit}</span>
                      {canViewMaterialCosts && selectedArticle.defaultUnitPrice != null && (
                        <span>{` med standardpris ${formatCurrency(selectedArticle.defaultUnitPrice)}/${selectedArticle.unit}`}</span>
                      )}
                    </>
                  ) : (
                    'Valj en artikel sa sparas raden pa projektet med ratt enhet.'
                  )}
                </div>
                <button
                  type="submit"
                  disabled={createMaterialMutation.isPending || !articles.length}
                  className="btn-primary"
                >
                  <Plus className="h-4 w-4" />
                  {createMaterialMutation.isPending ? 'Sparar...' : 'Lagg till material'}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Rader</p>
                <p className="text-lg font-semibold text-slate-900">{materials?.items.length || 0}</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Totalt antal</p>
                <p className="text-lg font-semibold text-slate-900">{(materials?.totals.quantity || 0).toFixed(2)}</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Materialvarde</p>
                <p className="text-lg font-semibold text-slate-900">
                  {canViewMaterialCosts ? formatCurrency(materials?.totals.amount) : 'Doljt'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Datum</th>
                    <th className="px-3 py-2">Artikel</th>
                    <th className="px-3 py-2">Antal</th>
                    {canViewMaterialCosts && <th className="px-3 py-2">Belopp</th>}
                    <th className="px-3 py-2">Inlagt av</th>
                    <th className="px-3 py-2">Kommentar</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {materials?.items.length ? (
                    materials.items.map((item: ProjectMaterial) => {
                      const canDelete = isManager || item.createdByUserId === user?.id;

                      return (
                        <tr key={item.id} className="border-b border-slate-100 text-slate-700 last:border-b-0">
                          <td className="px-3 py-2">{formatShortDate(item.date)}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{item.articleName}</div>
                            {item.articleNumber && <div className="text-xs text-slate-500">{item.articleNumber}</div>}
                          </td>
                          <td className="px-3 py-2">
                            {item.quantity.toFixed(2)} {item.unit}
                          </td>
                          {canViewMaterialCosts && <td className="px-3 py-2">{formatCurrency(item.lineTotal)}</td>}
                          <td className="px-3 py-2">{item.createdByUser?.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{item.note || '-'}</td>
                          <td className="px-3 py-2 text-right">
                            {canDelete && (
                              <button
                                onClick={() => {
                                  if (confirm('Ta bort materialraden?')) {
                                    deleteMaterialMutation.mutate(item.id);
                                  }
                                }}
                                className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                                title="Ta bort"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={canViewMaterialCosts ? 7 : 6} className="px-3 py-5 text-center text-slate-500">
                        Inget material registrerat an.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isManager && (
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary-700" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Lagg upp materialartiklar</h2>
                  <p className="text-sm text-slate-500">Skapa artiklar som anstallda sedan kan valja pa projekt.</p>
                </div>
              </div>

              <form onSubmit={handleArticleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Artikelnamn</label>
                  <input
                    value={articleForm.name}
                    onChange={(e) => setArticleForm((current) => ({ ...current, name: e.target.value }))}
                    className="input"
                    placeholder="Ex. Gips 13 mm"
                    required
                  />
                </div>
                <div>
                  <label className="label">Artikelnummer</label>
                  <input
                    value={articleForm.articleNumber}
                    onChange={(e) => setArticleForm((current) => ({ ...current, articleNumber: e.target.value }))}
                    className="input"
                    placeholder="ART-1001"
                  />
                </div>
                <div>
                  <label className="label">Enhet</label>
                  <input
                    value={articleForm.unit}
                    onChange={(e) => setArticleForm((current) => ({ ...current, unit: e.target.value }))}
                    className="input"
                    placeholder="st, m, pkt"
                    required
                  />
                </div>
                <div>
                  <label className="label">Standardpris</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={articleForm.defaultUnitPrice}
                    onChange={(e) => setArticleForm((current) => ({ ...current, defaultUnitPrice: e.target.value }))}
                    className="input"
                    placeholder="0.00"
                  />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" disabled={createArticleMutation.isPending} className="btn-primary">
                    <Plus className="h-4 w-4" />
                    {createArticleMutation.isPending ? 'Skapar...' : 'Skapa artikel'}
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Artikel</th>
                      <th className="px-3 py-2">Nummer</th>
                      <th className="px-3 py-2">Enhet</th>
                      <th className="px-3 py-2">Standardpris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.length ? (
                      articles.map((article) => (
                        <tr key={article.id} className="border-b border-slate-100 text-slate-700 last:border-b-0">
                          <td className="px-3 py-2 font-medium text-slate-900">{article.name}</td>
                          <td className="px-3 py-2">{article.articleNumber || '-'}</td>
                          <td className="px-3 py-2">{article.unit}</td>
                          <td className="px-3 py-2">{formatCurrency(article.defaultUnitPrice)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                          Inga materialartiklar upplagda an.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {isManager && (
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-700" />
              <h2 className="text-base font-semibold text-slate-900">Chefoversikt</h2>
            </div>

            {summary ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-slate-500">Totala timmar</p>
                    <p className="text-lg font-semibold text-slate-900">{(summary.totalHours || 0).toFixed(1)} h</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-slate-500">Fakturerbara timmar</p>
                    <p className="text-lg font-semibold text-slate-900">{(summary.billableHours || 0).toFixed(1)} h</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-slate-500">Fakturerbart varde</p>
                    <p className="text-lg font-semibold text-slate-900">{formatCurrency(summary.totalAmount)}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Anstalld</th>
                        <th className="px-3 py-2">Vecka</th>
                        <th className="px-3 py-2">Dagar</th>
                        <th className="px-3 py-2">Timmar</th>
                        <th className="px-3 py-2">Fakturerbart</th>
                        <th className="px-3 py-2">Belopp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.employeeBreakdown?.length ? (
                        summary.employeeBreakdown.map((employee) => (
                          <tr key={`${employee.userId}-${employee.weekStartDate || 'total'}`} className="border-b border-slate-100 text-slate-700 last:border-b-0">
                            <td className="px-3 py-2 font-medium text-slate-900">{employee.userName}</td>
                            <td className="px-3 py-2">v{employee.weekNumber || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              Man {(employee.dayHours?.Man || employee.dayHours?.Maan || employee.dayHours?.Mån || 0).toFixed(1)}h | Tis {(employee.dayHours?.Tis || 0).toFixed(1)}h | Ons {(employee.dayHours?.Ons || 0).toFixed(1)}h | Tor {(employee.dayHours?.Tor || 0).toFixed(1)}h | Fre {(employee.dayHours?.Fre || 0).toFixed(1)}h
                            </td>
                            <td className="px-3 py-2">{(employee.totalHours || 0).toFixed(1)} h</td>
                            <td className="px-3 py-2">{(employee.billableHours || 0).toFixed(1)} h</td>
                            <td className="px-3 py-2">{formatCurrency(employee.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-3 py-5 text-center text-slate-500">
                            Ingen medarbetardata for perioden.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="surface-muted p-3 text-sm text-slate-600">Chefoversikt ar inte tillganglig annu.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
