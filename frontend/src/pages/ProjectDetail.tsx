import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../services/api';
import type { ProjectManagerSummary } from '../types';
import { useAuthStore } from '../stores/authStore';
import { ArrowLeft, FolderKanban, Building2, MapPin, Clock, Receipt, Users } from 'lucide-react';

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
  totalHours?: number | null;
  billableHours?: number | null;
  employeeCanSeeResults?: boolean;
};

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

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
  const canViewResults = isManager || !!p?.employeeCanSeeResults;

  const budgetUsedPercent = useMemo(() => {
    if (!p?.budgetHours || !p.totalHours) return 0;
    return Math.min((p.totalHours / p.budgetHours) * 100, 100);
  }, [p]);

  const remainingHours = useMemo(() => {
    if (!p?.budgetHours) return null;
    return Math.max(p.budgetHours - (p.totalHours || 0), 0);
  }, [p]);

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
              <p className="mt-1 text-xs text-slate-500">Kontakta arbetsledare om du behover uppfoljning.</p>
            </div>
          )}
        </div>
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
                  <p className="text-lg font-semibold text-slate-900">
                    {(summary.totalAmount || 0).toLocaleString('sv-SE')} kr
                  </p>
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
                            Man {(employee.dayHours?.Man || employee.dayHours?.Mån || 0).toFixed(1)}h | Tis {(employee.dayHours?.Tis || 0).toFixed(1)}h | Ons {(employee.dayHours?.Ons || 0).toFixed(1)}h | Tor {(employee.dayHours?.Tor || 0).toFixed(1)}h | Fre {(employee.dayHours?.Fre || 0).toFixed(1)}h
                          </td>
                          <td className="px-3 py-2">{(employee.totalHours || 0).toFixed(1)} h</td>
                          <td className="px-3 py-2">{(employee.billableHours || 0).toFixed(1)} h</td>
                          <td className="px-3 py-2">{(employee.amount || 0).toLocaleString('sv-SE')} kr</td>
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
  );
}
