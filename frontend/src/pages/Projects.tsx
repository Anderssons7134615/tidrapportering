import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Clock, Coins, Edit2, Layers, MapPin, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi, projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectListItem } from '../types';
import { AppShell, Card, EmptyState, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
import { formatCurrency, formatDate, formatHours, formatPercent, parseSwedishNumber } from '../utils/format';
import { ListSkeleton } from '../components/ui/Skeleton';

const statusFilters = [
  { id: 'ALL', label: 'Alla jobb' },
  { id: 'ONGOING', label: 'Pågående' },
  { id: 'RUNNING_JOB', label: 'Löpande' },
  { id: 'RISK', label: 'Risk' },
  { id: 'PLANNED', label: 'Planerade' },
  { id: 'COMPLETED', label: 'Avslutade' },
] as const;

export default function Projects() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('risk') ? 'RISK' : searchParams.get('missingBudget') ? 'RUNNING_JOB' : 'ALL');
  const [activeFilter, setActiveFilter] = useState('ACTIVE');
  const [customerFilter, setCustomerFilter] = useState(searchParams.get('customerId') || '');

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', 'rich', activeFilter, customerFilter],
    queryFn: () => projectsApi.list({
      active: activeFilter === 'ALL' ? undefined : activeFilter === 'ACTIVE',
      customerId: customerFilter || undefined,
    }),
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
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'RUNNING_JOB' ? !project.budgetHours : metrics?.status.code === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  const totals = useMemo(() => {
    return filteredProjects.reduce(
      (acc, project) => {
        const metrics = project.metrics;
        acc.hours += metrics?.totalHours || 0;
        acc.weekHours += metrics?.weekHours || 0;
        acc.material += metrics?.materialSalesValue || 0;
        acc.result += metrics?.projectResult || 0;
        acc.risk += metrics?.status.code === 'RISK' ? 1 : 0;
        acc.missingBudget += !project.budgetHours ? 1 : 0;
        acc.completed += metrics?.status.code === 'COMPLETED' ? 1 : 0;
        acc.withFinancials ||= metrics?.projectResult != null || Boolean(metrics?.materialSalesValue);
        return acc;
      },
      { hours: 0, weekHours: 0, material: 0, result: 0, risk: 0, missingBudget: 0, completed: 0, withFinancials: false }
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
    const data = {
      customerId: (formData.get('customerId') as string) || undefined,
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      site: (formData.get('site') as string) || undefined,
      status: formData.get('status') as Project['status'],
      budgetHours: budgetHours ? parseSwedishNumber(budgetHours) : undefined,
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
        description="Jobbtavla för aktiva jobb, budgetläge, material och färdiga projekts resultat."
        action={isManager && (
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Nytt projekt
          </button>
        )}
      />

      <section className="overflow-hidden rounded-xl border border-graphite-800 bg-graphite-950 text-white shadow-premium">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/75">
                Projektläge
              </span>
              {totals.risk > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-400/15 px-3 py-1 text-xs font-semibold text-rose-100">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {totals.risk} behöver kollas
                </span>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric label="Synliga jobb" value={filteredProjects.length} />
              <HeroMetric label="Veckans timmar" value={formatHours(totals.weekHours)} />
              <HeroMetric label="Löpande jobb" value={totals.missingBudget} />
              <HeroMetric label="Avslutade" value={totals.completed} />
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2">
              <MoneyPanel icon={<Layers className="h-5 w-5" />} label="Material i listan" value={totals.withFinancials ? formatCurrency(totals.material) : 'Dolt'} />
              <MoneyPanel icon={<Coins className="h-5 w-5" />} label="Resultat" value={totals.withFinancials ? formatCurrency(totals.result) : 'Dolt'} tone={totals.result < 0 ? 'loss' : 'profit'} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[310px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="p-0">
            <div className="border-b border-graphite-200 px-4 py-3">
              <div className="flex items-center gap-2 font-semibold text-graphite-950">
                <SlidersHorizontal className="h-4 w-4 text-primary-600" />
                Filter
              </div>
            </div>
            <div className="space-y-4 p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-graphite-400" />
                <input className="input pl-9" placeholder="Sök jobb, kund, plats" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>

              {isManager && (
                <label className="block">
                  <span className="label">Kund</span>
                  <select className="input" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
                    <option value="">Alla kunder</option>
                    {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="label">Visa</span>
                <select className="input" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
                  <option value="ACTIVE">Aktiva projekt</option>
                  <option value="INACTIVE">Inaktiva projekt</option>
                  <option value="ALL">Alla projekt</option>
                </select>
              </label>

              <div>
                <span className="label">Status</span>
                <div className="grid grid-cols-2 gap-2">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setStatusFilter(filter.id)}
                      className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        statusFilter === filter.id
                          ? 'border-graphite-950 bg-graphite-950 text-white shadow-sm'
                          : 'border-graphite-200 bg-white text-graphite-600 hover:border-primary-300 hover:text-primary-700'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <KpiCard label="Timmar totalt" value={formatHours(totals.hours)} tone="orange" />
            <KpiCard label="Riskjobb" value={totals.risk} tone={totals.risk ? 'red' : 'green'} />
            <KpiCard label="Utan budget" value={totals.missingBudget} tone={totals.missingBudget ? 'yellow' : 'green'} />
          </div>
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 rounded-xl border border-white/70 bg-white/85 px-4 py-3 shadow-soft ring-1 ring-graphite-200/45 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-graphite-950">Jobböversikt</h2>
              <p className="text-sm text-graphite-500">{filteredProjects.length} projekt matchar filtret</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-graphite-500">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Grön: på plan</span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">Gul: nära budget</span>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Röd: risk</span>
            </div>
          </div>

          {!filteredProjects.length ? (
            <EmptyState title="Inga projekt matchar filtret" description="Justera filtren eller skapa ett nytt projekt." />
          ) : (
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isManager={isManager}
                  onEdit={() => {
                    setEditingProject(project);
                    setIsModalOpen(true);
                  }}
                  onDelete={() => window.confirm('Inaktivera projekt?') && deleteMutation.mutate(project.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {isManager && isModalOpen && (
        <ProjectModal
          editingProject={editingProject}
          customers={customers}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </AppShell>
  );
}

function ProjectCard({
  project,
  isManager,
  onEdit,
  onDelete,
}: {
  project: ProjectListItem;
  isManager: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const metrics = project.metrics;
  const runningJob = !project.budgetHours;
  const budgetUsage = Math.max(0, Math.min(metrics?.budgetUsagePercent || 0, 100));
  const isRisk = metrics?.status.code === 'RISK' || (metrics?.budgetUsagePercent || 0) >= 100;
  const isWarning = !isRisk && (runningJob || (metrics?.budgetUsagePercent || 0) >= 80);
  const accent = isRisk ? 'border-l-rose-500' : isWarning ? 'border-l-amber-400' : 'border-l-emerald-500';
  const progressTone = isRisk ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/projects/${project.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/projects/${project.id}`);
        }
      }}
      className={`min-h-[290px] cursor-pointer border-l-4 ${accent} p-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 hover:-translate-y-0.5 hover:shadow-premium ${!project.active ? 'opacity-70' : ''}`}
      title="Öppna projekt"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-graphite-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
                {runningJob && <StatusBadge label="Löpande jobb" tone="yellow" />}
              </div>
              <h3 className="mt-3 line-clamp-2 text-xl font-semibold leading-tight text-graphite-950">{project.name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-graphite-500">
                <span className="font-semibold text-graphite-700">{project.code}</span>
                <span>{project.customer?.name || 'Intern'}</span>
                {project.site && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{project.site}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isManager && (
                <>
                  <button onClick={(event) => { event.stopPropagation(); onEdit(); }} className="rounded-lg p-2 text-graphite-500 hover:bg-primary-50 hover:text-primary-700" title="Redigera">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={(event) => { event.stopPropagation(); onDelete(); }} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Inaktivera">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
              <ChevronRight className="h-5 w-5 text-graphite-300" />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-graphite-500">
              <span>Budgetläge</span>
              <span>{project.budgetHours ? formatPercent(metrics?.budgetUsagePercent) : 'Löpande jobb'}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-graphite-100">
              <div className={`h-full rounded-full ${progressTone}`} style={{ width: project.budgetHours ? `${budgetUsage}%` : '100%' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ProjectMetric icon={<Clock className="h-4 w-4" />} label="Timmar" value={formatHours(metrics?.totalHours)} />
            <ProjectMetric icon={<Clock className="h-4 w-4" />} label="Denna vecka" value={formatHours(metrics?.weekHours)} />
            <ProjectMetric icon={<Layers className="h-4 w-4" />} label="Budget" value={project.budgetHours ? formatHours(project.budgetHours) : 'Löpande'} />
            <ProjectMetric icon={<Layers className="h-4 w-4" />} label="Material" value={metrics ? formatCurrency(metrics.materialSalesValue) : 'Dolt'} />
            <ProjectMetric
              icon={<Coins className="h-4 w-4" />}
              label="Resultat"
              value={metrics?.projectResult != null ? formatCurrency(metrics.projectResult) : metrics ? '-' : 'Dolt'}
              valueTone={metrics?.projectResult != null && metrics.projectResult < 0 ? 'text-rose-700' : 'text-emerald-700'}
            />
            <ProjectMetric label="Senast" value={metrics?.lastActivityAt ? formatDate(metrics.lastActivityAt) : '-'} />
          </div>

          {metrics?.warnings?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              {metrics.warnings[0]}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function HeroMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function MoneyPanel({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'neutral' | 'profit' | 'loss';
}) {
  const valueClass = tone === 'loss' ? 'text-rose-100' : tone === 'profit' ? 'text-emerald-100' : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4">
      <div className="flex items-center gap-2 text-white/65">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function ProjectMetric({
  icon,
  label,
  value,
  valueTone = 'text-graphite-950',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueTone?: string;
}) {
  return (
    <div className="min-h-[74px] rounded-lg border border-graphite-200 bg-graphite-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-graphite-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`mt-1 break-words text-sm font-semibold sm:text-base ${valueTone}`}>{value}</p>
    </div>
  );
}

function ProjectModal({
  editingProject,
  customers,
  isSaving,
  onClose,
  onSubmit,
}: {
  editingProject: Project | null;
  customers?: Array<{ id: string; name: string }>;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/65 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-graphite-200 bg-white shadow-2xl">
        <div className="border-b border-graphite-200 bg-graphite-950 px-5 py-4 text-white">
          <h2 className="text-lg font-semibold">{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</h2>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
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
            </select>
          </label>
          <Field name="budgetHours" label="Budget timmar" defaultValue={editingProject?.budgetHours} placeholder="80" />
          <label className="md:col-span-2">
            <span className="label">Anteckningar</span>
            <textarea name="notes" defaultValue={editingProject?.notes || ''} className="input" rows={3} />
          </label>
          <label className="md:col-span-2 flex items-center gap-3 rounded-lg border border-graphite-200 bg-graphite-50 p-3 text-sm">
            <input name="employeeCanSeeResults" type="checkbox" defaultChecked={editingProject?.employeeCanSeeResults || false} />
            Visa projekttimmar för anställda
          </label>
          <div className="flex gap-3 md:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Avbryt</button>
            <button type="submit" className="btn-primary flex-1" disabled={isSaving}>
              {editingProject ? 'Spara' : 'Skapa'}
            </button>
          </div>
        </form>
      </div>
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
