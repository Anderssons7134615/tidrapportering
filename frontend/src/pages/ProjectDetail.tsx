import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, workItemsApi, workLogsApi } from '../services/api';
import type { ProjectManagerSummary } from '../types';
import { useAuthStore } from '../stores/authStore';
import { ArrowLeft, FolderKanban, Building2, MapPin, Clock, Receipt, Users, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const statusLabels: Record<string, string> = {
  PLANNED: 'Planerad',
  ONGOING: 'Pågår',
  COMPLETED: 'Avslutad',
  INVOICED: 'Fakturerad',
};

const statusColors: Record<string, string> = {
  PLANNED: 'badge-blue',
  ONGOING: 'badge-green',
  COMPLETED: 'badge-gray',
  INVOICED: 'badge-gray',
};

type ProjectDetails = {
  id: string;
  name: string;
  code: string;
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'INVOICED';
  customer?: { id: string; name: string };
  site?: string;
  billingModel: 'HOURLY' | 'FIXED';
  defaultRate?: number;
  budgetHours?: number;
  totalHours?: number;
  billableHours?: number;
  employeeCanSeeResults?: boolean;
};

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const queryClient = useQueryClient();
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('');
  const [materialComment, setMaterialComment] = useState('');
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialUnit, setNewMaterialUnit] = useState('st');

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

  const p = project as ProjectDetails | undefined;
  const summary = managerSummary as ProjectManagerSummary | null | undefined;

  const { data: workItems } = useQuery({
    queryKey: ['workItems'],
    queryFn: () => workItemsApi.list(true),
  });

  const { data: materialLogs } = useQuery({
    queryKey: ['materialLogs', id],
    queryFn: () => workLogsApi.list({ projectId: id }),
    enabled: !!id,
  });

  const createMaterialUsageMutation = useMutation({
    mutationFn: (payload: { workItemId: string; quantity: number; note?: string }) =>
      workLogsApi.create({
        workItemId: payload.workItemId,
        projectId: id,
        date: new Date().toISOString(),
        quantity: payload.quantity,
        minutes: 1,
        note: payload.note,
      }),
    onSuccess: () => {
      toast.success('Material tillagt');
      setMaterialQuantity('');
      setMaterialComment('');
      queryClient.invalidateQueries({ queryKey: ['materialLogs', id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMaterialItemMutation = useMutation({
    mutationFn: (payload: { name: string; unit: string }) =>
      workItemsApi.create({ name: payload.name, unit: payload.unit }),
    onSuccess: (item) => {
      toast.success('Material skapat');
      setSelectedWorkItemId(item.id);
      setNewMaterialName('');
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canViewResults = isManager || !!p?.employeeCanSeeResults;

  const budgetUsedPercent = useMemo(() => {
    if (!p?.budgetHours || !p.totalHours) return 0;
    return Math.min((p.totalHours / p.budgetHours) * 100, 100);
  }, [p]);

  const remainingHours = useMemo(() => {
    if (!p?.budgetHours) return null;
    return Math.max(p.budgetHours - (p.totalHours || 0), 0);
  }, [p]);

  const filteredWorkItems = useMemo(() => {
    const list = workItems || [];
    if (!materialSearch.trim()) return list;
    return list.filter((w) => w.name.toLowerCase().includes(materialSearch.toLowerCase()));
  }, [workItems, materialSearch]);

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
        <div className="card text-rose-700">Kunde inte hämta projektet.</div>
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
            <p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Building2 className="h-4 w-4" /> Kund</p>
            <p className="font-medium text-slate-900">{p.customer?.name || 'Intern'}</p>
          </div>
          <div className="surface-muted p-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-4 w-4" /> Arbetsplats</p>
            <p className="font-medium text-slate-900">{p.site || 'Ej satt'}</p>
          </div>

          {canViewResults ? (
            <>
              <div className="surface-muted p-3">
                <p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Clock className="h-4 w-4" /> Timmar</p>
                <p className="font-medium text-slate-900">
                  {(p.totalHours || 0).toFixed(1)} h
                  {p.budgetHours ? ` / ${p.budgetHours} h` : ''}
                </p>
                {p.budgetHours && (
                  <p className="mt-1 text-xs text-slate-500">
                    Kvar: {remainingHours?.toFixed(1)} h ({budgetUsedPercent.toFixed(0)}% använt)
                  </p>
                )}
              </div>
              <div className="surface-muted p-3">
                <p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Receipt className="h-4 w-4" /> Debitering</p>
                <p className="font-medium text-slate-900">
                  {p.billingModel === 'FIXED' ? 'Fastpris' : 'Löpande'}
                  {p.defaultRate ? ` • ${p.defaultRate} kr/h` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Fakturerbara timmar: {(p.billableHours || 0).toFixed(1)} h
                </p>
              </div>
            </>
          ) : (
            <div className="surface-muted md:col-span-2 p-3">
              <p className="text-sm text-slate-700">Projektresultat är dolt för anställda i detta projekt.</p>
              <p className="mt-1 text-xs text-slate-500">Kontakta arbetsledare om du behöver uppföljning.</p>
            </div>
          )}
        </div>
      </div>

      {isManager && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-700" />
            <h2 className="text-base font-semibold text-slate-900">Cheföversikt</h2>
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
                  <p className="text-xs text-slate-500">Fakturerbart värde</p>
                  <p className="text-lg font-semibold text-slate-900">{(summary.totalAmount || 0).toLocaleString('sv-SE')} kr</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Anställd</th>
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
                        <tr key={employee.userId} className="border-b border-slate-100 text-slate-700 last:border-b-0">
                          <td className="px-3 py-2 font-medium text-slate-900">{employee.userName}</td>
                          <td className="px-3 py-2">v{employee.weekNumber || '-'}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            Mån {(employee.dayHours?.Mån || 0).toFixed(1)}h · Tis {(employee.dayHours?.Tis || 0).toFixed(1)}h · Ons {(employee.dayHours?.Ons || 0).toFixed(1)}h · Tor {(employee.dayHours?.Tor || 0).toFixed(1)}h · Fre {(employee.dayHours?.Fre || 0).toFixed(1)}h · Lör {(employee.dayHours?.Lör || 0).toFixed(1)}h · Sön {(employee.dayHours?.Sön || 0).toFixed(1)}h
                          </td>
                          <td className="px-3 py-2">{(employee.totalHours || 0).toFixed(1)} h</td>
                          <td className="px-3 py-2">{(employee.billableHours || 0).toFixed(1)} h</td>
                          <td className="px-3 py-2">{(employee.amount || 0).toLocaleString('sv-SE')} kr</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-5 text-center text-slate-500">Ingen medarbetardata för perioden.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="surface-muted p-3 text-sm text-slate-600">Cheföversikt är inte tillgänglig ännu.</div>
          )}
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary-700" />
          <h2 className="text-base font-semibold text-slate-900">Material</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={materialSearch}
            onChange={(e) => setMaterialSearch(e.target.value)}
            placeholder="Sök material"
            className="input md:col-span-2"
          />
          <select
            value={selectedWorkItemId}
            onChange={(e) => setSelectedWorkItemId(e.target.value)}
            className="input"
          >
            <option value="">Välj material</option>
            {filteredWorkItems.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
            ))}
          </select>
          <input
            value={materialQuantity}
            onChange={(e) => setMaterialQuantity(e.target.value)}
            type="number"
            step="0.1"
            min="0"
            placeholder="Antal"
            className="input"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={materialComment}
            onChange={(e) => setMaterialComment(e.target.value)}
            placeholder="Kommentar (valfritt)"
            className="input md:col-span-3"
          />
          <button
            className="btn-primary"
            onClick={() => createMaterialUsageMutation.mutate({
              workItemId: selectedWorkItemId,
              quantity: Number(materialQuantity),
              note: materialComment || undefined,
            })}
            disabled={!selectedWorkItemId || !materialQuantity || createMaterialUsageMutation.isPending}
          >
            Lägg till material
          </button>
        </div>

        {user?.role === 'ADMIN' && (
          <div className="surface-muted p-3 space-y-3">
            <p className="text-sm font-medium text-slate-800">Saknas material i listan? Lägg till direkt:</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                placeholder="Materialnamn"
                className="input"
              />
              <input
                value={newMaterialUnit}
                onChange={(e) => setNewMaterialUnit(e.target.value)}
                placeholder="Enhet (st/m/kg)"
                className="input"
              />
              <button
                className="btn-secondary"
                onClick={() => createMaterialItemMutation.mutate({
                  name: newMaterialName,
                  unit: newMaterialUnit,
                })}
                disabled={!newMaterialName || !newMaterialUnit || createMaterialItemMutation.isPending}
              >
                Skapa material
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Anställd</th>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Antal</th>
                <th className="px-3 py-2">Kommentar</th>
              </tr>
            </thead>
            <tbody>
              {materialLogs?.length ? materialLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 text-slate-700 last:border-b-0">
                  <td className="px-3 py-2">{format(new Date(log.date), 'EEE d/M', { locale: sv })}</td>
                  <td className="px-3 py-2">{log.user?.name || '-'}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{log.workItem?.name || '-'}</td>
                  <td className="px-3 py-2">{log.quantity} {log.workItem?.unit || ''}</td>
                  <td className="px-3 py-2">{log.note || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-slate-500">Ingen materialregistrering ännu.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
