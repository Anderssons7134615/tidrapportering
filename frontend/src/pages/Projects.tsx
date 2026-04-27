import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Edit2, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi, projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectListItem } from '../types';
import { AppShell, Card, EmptyState, FilterBar, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
import { formatCurrency, formatDate, formatHours, formatPercent, parseSwedishNumber } from '../utils/format';
import { ListSkeleton } from '../components/ui/Skeleton';

const billingLabels: Record<string, string> = {
  HOURLY: 'Löpande',
  FIXED: 'Fastpris',
};

export default function Projects() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('risk') ? 'RISK' : searchParams.get('missingBudget') ? 'MISSING_BUDGET' : 'ALL');
  const [billingFilter, setBillingFilter] = useState('ALL');
  const [activeFilter, setActiveFilter] = useState('ACTIVE');

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', 'rich', activeFilter],
    queryFn: () => projectsApi.list({ active: activeFilter === 'ALL' ? undefined : activeFilter === 'ACTIVE' }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn: () => customersApi.list(true),
    enabled: isManager,
  });

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      toast.success('Projekt skapat');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) => projectsApi.update(id, data),
    onSuccess: () => {
      toast.success('Projekt uppdaterat');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      toast.success('Projekt inaktiverat');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ((projects || []) as ProjectListItem[]).filter((project) => {
      const metrics = project.metrics;
      const matchesSearch = !term || [project.name, project.code, project.customer?.name, project.site]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'ALL' || metrics?.status.code === statusFilter;
      const matchesBilling = billingFilter === 'ALL' || project.billingModel === billingFilter;
      return matchesSearch && matchesStatus && matchesBilling;
    });
  }, [projects, search, statusFilter, billingFilter]);

  const totals = useMemo(() => {
    return filteredProjects.reduce(
      (acc, project) => {
        acc.hours += project.metrics?.totalHours || 0;
        acc.billable += project.metrics?.billableValue || 0;
        acc.risk += project.metrics?.status.code === 'RISK' ? 1 : 0;
        acc.missingBudget += project.metrics?.warnings.includes('Saknar budget') ? 1 : 0;
        return acc;
      },
      { hours: 0, billable: 0, risk: 0, missingBudget: 0 }
    );
  }, [filteredProjects]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const budgetHours = formData.get('budgetHours') as string;
    const defaultRate = formData.get('defaultRate') as string;
    const fixedPrice = formData.get('fixedPrice') as string;
    const data = {
      customerId: (formData.get('customerId') as string) || undefined,
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      site: (formData.get('site') as string) || undefined,
      status: formData.get('status') as Project['status'],
      budgetHours: budgetHours ? parseSwedishNumber(budgetHours) : undefined,
      billingModel: formData.get('billingModel') as Project['billingModel'],
      defaultRate: defaultRate ? parseSwedishNumber(defaultRate) : undefined,
      fixedPrice: fixedPrice ? parseSwedishNumber(fixedPrice) : undefined,
      notes: (formData.get('notes') as string) || undefined,
      employeeCanSeeResults: formData.get('employeeCanSeeResults') === 'on',
    };

    if (editingProject) updateMutation.mutate({ id: editingProject.id, data });
    else createMutation.mutate(data);
  };

  if (isLoading) return <ListSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title="Projekt"
        description="Följ timmar, budget, fakturerbart värde och risk per projekt."
        action={isManager && (
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Nytt projekt
          </button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Projekt" value={filteredProjects.length} />
        <KpiCard label="Timmar totalt" value={formatHours(totals.hours)} tone="blue" />
        <KpiCard label="Fakturerbart värde" value={formatCurrency(totals.billable)} tone="green" />
        <KpiCard label="Risk / saknar budget" value={`${totals.risk} / ${totals.missingBudget}`} tone={totals.risk ? 'red' : totals.missingBudget ? 'yellow' : 'green'} />
      </div>

      <FilterBar>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Sök projekt, kund eller projektnummer" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">Alla statusar</option>
            <option value="PLANNED">Planerad</option>
            <option value="ONGOING">Pågående</option>
            <option value="MISSING_BUDGET">Saknar budget</option>
            <option value="RISK">Riskprojekt</option>
            <option value="READY_TO_INVOICE">Klar för fakturering</option>
            <option value="COMPLETED">Avslutad</option>
          </select>
          <select className="input" value={billingFilter} onChange={(event) => setBillingFilter(event.target.value)}>
            <option value="ALL">Alla faktureringstyper</option>
            <option value="HOURLY">Löpande</option>
            <option value="FIXED">Fastpris</option>
          </select>
          <select className="input" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
            <option value="ACTIVE">Aktiva</option>
            <option value="INACTIVE">Inaktiva</option>
            <option value="ALL">Alla</option>
          </select>
        </div>
      </FilterBar>

      {!filteredProjects.length ? (
        <EmptyState title="Inga projekt matchar filtret" description="Justera filtren eller skapa ett nytt projekt." />
      ) : (
        <div className="space-y-3">
          {filteredProjects.map((project) => {
            const metrics = project.metrics;
            const missingBudget = metrics?.warnings.includes('Saknar budget');
            return (
              <Card key={project.id} className={`transition hover:shadow-md ${!project.active ? 'opacity-70' : ''}`}>
                <div className="grid gap-4 xl:grid-cols-[1.1fr_1.8fr_auto] xl:items-center">
                  <Link to={`/projects/${project.id}`} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-900">{project.name}</h2>
                      {metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
                      {missingBudget && <StatusBadge label="Saknar budget" tone="yellow" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{project.code} · {project.customer?.name || 'Intern'} · {billingLabels[project.billingModel] || project.billingModel}</p>
                    {metrics?.lastActivityAt && <p className="mt-1 text-xs text-slate-400">Senaste aktivitet {formatDate(metrics.lastActivityAt)}</p>}
                  </Link>

                  <Link to={`/projects/${project.id}`} className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <Metric label="Timmar" value={formatHours(metrics?.totalHours)} />
                    <Metric label="Denna vecka" value={formatHours(metrics?.weekHours)} />
                    <Metric label="Budget" value={project.budgetHours ? formatHours(project.budgetHours) : 'Saknas'} warning={!project.budgetHours && (metrics?.totalHours || 0) > 0} />
                    <Metric label="Använt" value={formatPercent(metrics?.budgetUsagePercent)} warning={(metrics?.budgetUsagePercent || 0) >= 80} />
                    <Metric label="Fakt. timmar" value={formatHours(metrics?.billableHours)} />
                    <Metric label="Fakt. värde" value={formatCurrency(metrics?.billableValue)} warning={(metrics?.billableHours || 0) > 0 && (metrics?.billableValue || 0) === 0} />
                    <Metric label="Kostnad" value={formatCurrency((metrics?.laborCost || 0) + (metrics?.materialCost || 0))} />
                    <Metric label="Resultat" value={metrics?.projectResult == null ? '-' : formatCurrency(metrics.projectResult)} warning={(metrics?.projectResult || 0) < 0} />
                  </Link>

                  {isManager && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditingProject(project); setIsModalOpen(true); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Redigera">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => window.confirm('Inaktivera projekt?') && deleteMutation.mutate(project.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Inaktivera">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isManager && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="label">Kund</span>
                <select name="customerId" defaultValue={editingProject?.customerId || ''} className="input">
                  <option value="">Intern</option>
                  {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <Field name="name" label="Projektnamn" defaultValue={editingProject?.name} required />
              <Field name="code" label="Projektnummer" defaultValue={editingProject?.code} required />
              <Field name="site" label="Arbetsplats" defaultValue={editingProject?.site} />
              <label>
                <span className="label">Status</span>
                <select name="status" defaultValue={editingProject?.status || 'PLANNED'} className="input">
                  <option value="PLANNED">Planerad</option>
                  <option value="ONGOING">Pågående</option>
                  <option value="COMPLETED">Avslutad</option>
                  <option value="INVOICED">Fakturerad</option>
                </select>
              </label>
              <label>
                <span className="label">Faktureringstyp</span>
                <select name="billingModel" defaultValue={editingProject?.billingModel || 'HOURLY'} className="input">
                  <option value="HOURLY">Löpande</option>
                  <option value="FIXED">Fastpris</option>
                </select>
              </label>
              <Field name="budgetHours" label="Budget timmar" defaultValue={editingProject?.budgetHours} placeholder="80" />
              <Field name="defaultRate" label="Timpris kr/h" defaultValue={editingProject?.defaultRate} placeholder="650" />
              <Field name="fixedPrice" label="Fastpris/anbud kr" defaultValue={editingProject?.fixedPrice || undefined} placeholder="120000" />
              <label className="md:col-span-2">
                <span className="label">Anteckningar</span>
                <textarea name="notes" defaultValue={editingProject?.notes || ''} className="input" rows={3} />
              </label>
              <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <input name="employeeCanSeeResults" type="checkbox" defaultChecked={editingProject?.employeeCanSeeResults || false} />
                Visa projektresultat för anställda
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Avbryt</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingProject ? 'Spara' : 'Skapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Metric({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${warning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold">{warning && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}{value}</p>
    </div>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input {...props} className="input" />
    </label>
  );
}
