import { useMemo, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Edit2, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi, projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectListItem } from '../types';
import { AppShell, Dialog, EmptyState, PageHeader, StatusBadge, Toolbar } from '../components/ui/design';
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

  const { data: nextCodeResult } = useQuery({
    queryKey: ['projects', 'next-code'],
    queryFn: projectsApi.nextCode,
    enabled: isManager,
  });

  const projectItems = (projects || []) as ProjectListItem[];
  const nextProjectCode = nextCodeResult?.code || '';

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
    return projectItems.filter((project) => {
      const metrics = project.metrics;
      const matchesSearch = !term || [project.name, project.code, project.customer?.name, project.site]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'RUNNING_JOB' ? !project.budgetHours : metrics?.status.code === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [projectItems, search, statusFilter]);

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

  const openCreateModal = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const budgetHours = formData.get('budgetHours') as string;
    const enteredCode = String(formData.get('code') || '').trim();
    const data = {
      customerId: (formData.get('customerId') as string) || undefined,
      name: formData.get('name') as string,
      code: editingProject || enteredCode !== nextProjectCode ? enteredCode : undefined,
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
        description="Sök, följ upp och öppna jobb i en gemensam radlista."
        action={isManager ? (
          <div className="flex flex-wrap items-center gap-3">
            {nextProjectCode && <span className="text-sm text-graphite-600">Nästa nummer: <strong className="tabular-nums text-graphite-950">{nextProjectCode}</strong></span>}
            <button type="button" onClick={openCreateModal} className="btn-primary">
              <Plus className="h-4 w-4" />
              Nytt projekt
            </button>
          </div>
        ) : undefined}
      />
      <Toolbar className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
        <div className="grid grid-cols-1 gap-3 lg:col-span-3 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-graphite-400" />
            <input className="input pl-9" placeholder="Sök jobb, projektnummer, kund eller plats" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>

          {isManager && (
            <select className="input" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} aria-label="Filtrera på kund">
              <option value="">Alla kunder</option>
              {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          )}

          <select className="input" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} aria-label="Visa projekt">
            <option value="ACTIVE">Aktiva projekt</option>
            <option value="INACTIVE">Inaktiva projekt</option>
            <option value="ALL">Alla projekt</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm lg:col-span-3">
          {statusFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={`border-b-2 pb-1 font-semibold transition ${
                statusFilter === filter.id
                  ? 'border-primary-600 text-primary-800'
                  : 'border-transparent text-graphite-500 hover:border-graphite-300 hover:text-graphite-900'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </Toolbar>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 text-sm leading-6 text-graphite-700 lg:flex-row lg:items-center lg:justify-between">
          <p>
            Visar <strong>{filteredProjects.length}</strong> projekt. Totalt <strong>{formatHours(totals.hours)}</strong>,
            {' '}varav <strong>{formatHours(totals.weekHours)}</strong> denna vecka.
            {totals.risk > 0 && <span className="ml-1 font-semibold text-rose-700">{totals.risk} projekt behöver kollas.</span>}
            {totals.missingBudget > 0 && <span className="ml-1">{totals.missingBudget} löpande jobb saknar budget.</span>}
          </p>
        </div>

        {!filteredProjects.length ? (
          <EmptyState title="Inga projekt matchar filtret" description="Justera filtren eller skapa ett nytt projekt." />
        ) : (
          <ProjectTable
            projects={filteredProjects}
            isManager={isManager}
            onEdit={(project) => {
              setEditingProject(project);
              setIsModalOpen(true);
            }}
            onDelete={(project) => window.confirm('Inaktivera projekt?') && deleteMutation.mutate(project.id)}
          />
        )}

        {totals.withFinancials && (
          <p className="border-t border-graphite-200 pt-3 text-sm leading-6 text-graphite-600">
            Material i urvalet: <strong>{formatCurrency(totals.material)}</strong>. Resultat i urvalet:{' '}
            <strong className={totals.result < 0 ? 'text-rose-700' : 'text-emerald-700'}>{formatCurrency(totals.result)}</strong>.
          </p>
        )}
      </section>

      {isManager && isModalOpen && (
        <ProjectModal
          editingProject={editingProject}
          customers={customers}
          suggestedCode={nextProjectCode}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </AppShell>
  );
}

function ProjectTable({
  projects,
  isManager,
  onEdit,
  onDelete,
}: {
  projects: ProjectListItem[];
  isManager: boolean;
  onEdit: (project: ProjectListItem) => void;
  onDelete: (project: ProjectListItem) => void;
}) {
  return (
    <>
      <div className="divide-y divide-graphite-100 border-y border-graphite-200 bg-white md:hidden">
        {projects.map((project) => (
          <MobileProjectRow
            key={project.id}
            project={project}
            isManager={isManager}
            onEdit={() => onEdit(project)}
            onDelete={() => onDelete(project)}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto border-y border-graphite-200 bg-white/90 md:block">
      <table className="min-w-[980px] w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-graphite-200 bg-[#f3f6f4] text-left text-xs font-semibold uppercase tracking-normal text-graphite-500">
          <tr>
            <th className="px-3 py-3">Projektnr</th>
            <th className="px-3 py-3">Projekt</th>
            <th className="px-3 py-3">Kund och plats</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Timmar</th>
            <th className="px-3 py-3">Budget</th>
            <th className="px-3 py-3">Senast</th>
            <th className="px-3 py-3 text-right">Resultat</th>
            <th className="px-3 py-3 text-right">Öppna</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-graphite-100">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              isManager={isManager}
              onEdit={() => onEdit(project)}
              onDelete={() => onDelete(project)}
            />
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function MobileProjectRow({
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
  const metrics = project.metrics;
  const runningJob = !project.budgetHours && !['MISSING_BUDGET', 'ONGOING'].includes(metrics?.status.code || '');
  const usagePercent = metrics?.budgetUsagePercent ?? null;

  return (
    <div
      className={`px-3 py-4 text-sm ${!project.active ? 'opacity-65' : ''}`}
      title="Ã–ppna projekt"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/projects/${project.id}`} className="font-semibold text-graphite-950 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">{project.code} - {project.name}</Link>
          <p className="mt-1 text-graphite-600">{project.customer?.name || 'Intern'}{project.site ? ` · ${project.site}` : ''}</p>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-graphite-400" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
        {runningJob && <StatusBadge label="Löpande" tone="yellow" />}
        <span className="font-semibold text-graphite-950">{formatHours(metrics?.totalHours)}</span>
        <span className="text-graphite-500">{project.budgetHours ? `${formatPercent(usagePercent)} av budget` : 'Utan timbudget'}</span>
      </div>

      {isManager && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onEdit} className="icon-button text-graphite-700" title="Redigera" aria-label="Redigera projekt">
            <Edit2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="icon-button border-rose-200 text-rose-600 hover:bg-rose-50" title="Inaktivera" aria-label="Inaktivera projekt">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectRow({
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
  const metrics = project.metrics;
  const runningJob = !project.budgetHours;
  const usagePercent = metrics?.budgetUsagePercent ?? null;
  const isRisk = metrics?.status.code === 'RISK' || (usagePercent ?? 0) >= 100;
  const isWarning = !isRisk && (runningJob || (usagePercent ?? 0) >= 80);
  const progressClass = isRisk ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';
  const progressWidth = `${Math.max(0, Math.min(usagePercent || 0, 100))}%`;

  return (
    <tr
      className={`transition hover:bg-primary-50/60 ${!project.active ? 'opacity-65' : ''}`}
      title="Öppna projekt"
    >
      <td className="whitespace-nowrap px-3 py-3 font-semibold text-graphite-900 tabular-nums"><Link to={`/projects/${project.id}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">{project.code}</Link></td>
      <td className="px-3 py-3">
        <Link to={`/projects/${project.id}`} className="font-semibold text-graphite-950 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">{project.name}</Link>
        {metrics?.warnings?.length ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {metrics.warnings[0]}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-graphite-700">
        <p>{project.customer?.name || 'Intern'}</p>
        {project.site && (
          <p className="mt-1 inline-flex max-w-[220px] items-center gap-1 text-xs text-graphite-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{project.site}</span>
          </p>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
          {runningJob && metrics?.status.code !== 'MISSING_BUDGET' && <StatusBadge label="Löpande" tone="yellow" />}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-graphite-950 tabular-nums">
        {formatHours(metrics?.totalHours)}
        <p className="text-xs font-normal text-graphite-500">{formatHours(metrics?.weekHours)} denna vecka</p>
      </td>
      <td className="px-3 py-3">
        <div className="min-w-[150px]">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-graphite-500 tabular-nums">
            <span>{project.budgetHours ? formatHours(project.budgetHours) : 'Löpande jobb'}</span>
            <span>{project.budgetHours ? formatPercent(usagePercent) : ''}</span>
          </div>
          {project.budgetHours && (
            <div className="h-1 overflow-hidden bg-graphite-100">
              <div className={`h-full ${progressClass}`} style={{ width: progressWidth }} />
            </div>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-graphite-700">{metrics?.lastActivityAt ? formatDate(metrics.lastActivityAt) : '-'}</td>
      <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${metrics?.projectResult != null && metrics.projectResult < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
        {metrics?.projectResult != null ? formatCurrency(metrics.projectResult) : metrics ? '-' : 'Dolt'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right">
        <div className="inline-flex items-center justify-end gap-1">
          {isManager && (
            <>
              <button type="button" onClick={onEdit} className="icon-button border-0 text-graphite-500 hover:bg-white hover:text-primary-700" title="Redigera" aria-label="Redigera projekt">
                <Edit2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={onDelete} className="icon-button border-0 text-rose-600 hover:bg-white" title="Inaktivera" aria-label="Inaktivera projekt">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <ChevronRight className="h-5 w-5 text-graphite-400" />
        </div>
      </td>
    </tr>
  );
}

function ProjectModal({
  editingProject,
  customers,
  suggestedCode,
  isSaving,
  onClose,
  onSubmit,
}: {
  editingProject: Project | null;
  customers?: Array<{ id: string; name: string }>;
  suggestedCode: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isEditing = Boolean(editingProject);
  const codeDefault = editingProject?.code || suggestedCode;

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEditing ? 'Redigera projekt' : 'Nytt projekt'}
      description={!isEditing && suggestedCode ? `Nästa lediga projektnummer är förifyllt: ${suggestedCode}.` : undefined}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Avbryt</button>
          <button type="submit" form="project-form" className="btn-primary" disabled={isSaving}>
            {isEditing ? 'Spara' : 'Skapa'}
          </button>
        </div>
      }
    >
        <form id="project-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="label">Kund</span>
            <select name="customerId" defaultValue={editingProject?.customerId || ''} className="input">
              <option value="">Intern</option>
              {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <Field name="name" label="Projektnamn" defaultValue={editingProject?.name} required />
          <Field
            key={codeDefault || 'project-code'}
            name="code"
            label="Projektnummer"
            defaultValue={codeDefault}
            placeholder={suggestedCode || 'Skapas automatiskt'}
            required={isEditing}
          />
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
          <label className="md:col-span-2 flex items-center gap-3 border border-graphite-200 bg-graphite-50 p-3 text-sm">
            <input name="employeeCanSeeResults" type="checkbox" defaultChecked={editingProject?.employeeCanSeeResults || false} />
            Visa projekttimmar för anställda
          </label>
        </form>
    </Dialog>
  );
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input {...props} className="input" />
    </label>
  );
}
