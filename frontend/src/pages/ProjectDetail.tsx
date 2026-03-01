import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../services/api';
import { ArrowLeft, FolderKanban, Building2, MapPin, Clock, Receipt } from 'lucide-react';

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
};

export default function ProjectDetail() {
  const { id } = useParams();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id || ''),
    enabled: !!id,
  });

  const p = project as ProjectDetails | undefined;

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
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Building2 className="h-4 w-4" /> Kund</p>
            <p className="font-medium text-slate-900">{p.customer?.name || 'Intern'}</p>
          </div>
          <div className="surface-muted p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><MapPin className="h-4 w-4" /> Arbetsplats</p>
            <p className="font-medium text-slate-900">{p.site || 'Ej satt'}</p>
          </div>
          <div className="surface-muted p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock className="h-4 w-4" /> Timmar</p>
            <p className="font-medium text-slate-900">
              {(p.totalHours || 0).toFixed(1)} h
              {p.budgetHours ? ` / ${p.budgetHours} h` : ''}
            </p>
            {p.budgetHours && (
              <p className="text-xs text-slate-500 mt-1">
                Kvar: {remainingHours?.toFixed(1)} h ({budgetUsedPercent.toFixed(0)}% använt)
              </p>
            )}
          </div>
          <div className="surface-muted p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Receipt className="h-4 w-4" /> Debitering</p>
            <p className="font-medium text-slate-900">
              {p.billingModel === 'FIXED' ? 'Fastpris' : 'Löpande'}
              {p.defaultRate ? ` · ${p.defaultRate} kr/h` : ''}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Fakturerbara timmar: {(p.billableHours || 0).toFixed(1)} h
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
