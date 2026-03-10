import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, customersApi } from '../services/api';
import type { Project } from '../types';
import { Plus, Edit2, Trash2, FolderKanban, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';

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

export default function Projects() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Project['status']>('ALL');

  const projectParams = useMemo(() => {
    const params: { status?: string; active?: boolean } = {};
    if (activityFilter === 'ACTIVE') params.active = true;
    if (activityFilter === 'INACTIVE') params.active = false;
    if (statusFilter !== 'ALL') params.status = statusFilter;
    return params;
  }, [activityFilter, statusFilter]);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', projectParams],
    queryFn: () => projectsApi.list(projectParams),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn: () => customersApi.list(true),
  });

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      toast.success('Projekt skapat!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) => projectsApi.update(id, data),
    onSuccess: () => {
      toast.success('Projekt uppdaterat!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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

  const permanentDeleteMutation = useMutation({
    mutationFn: projectsApi.permanentDelete,
    onSuccess: () => {
      toast.success('Projekt raderat permanent');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      customerId: (formData.get('customerId') as string) || undefined,
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      site: (formData.get('site') as string) || undefined,
      status: formData.get('status') as Project['status'],
      budgetHours: formData.get('budgetHours') ? parseFloat(formData.get('budgetHours') as string) : undefined,
      billingModel: formData.get('billingModel') as Project['billingModel'],
      defaultRate: formData.get('defaultRate') ? parseFloat(formData.get('defaultRate') as string) : undefined,
      employeeCanSeeResults: formData.get('employeeCanSeeResults') === 'on',
    };

    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return <ListSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Projekt</h1>
          <p className="text-sm text-slate-500">Översikt över aktiva och avslutade uppdrag.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nytt projekt
        </button>
      </div>

      <div className="card space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Visa</label>
            <select
              className="input"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            >
              <option value="ALL">Alla</option>
              <option value="ACTIVE">Aktiva</option>
              <option value="INACTIVE">Inaktiva</option>
            </select>
          </div>
          <div>
            <label className="label">Projektstatus</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | Project['status'])}
            >
              <option value="ALL">Alla statusar</option>
              <option value="PLANNED">Planerad</option>
              <option value="ONGOING">Pågår</option>
              <option value="COMPLETED">Färdig</option>
              <option value="INVOICED">Fakturerad</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {projects?.length === 0 ? (
          <div className="card py-10 text-center text-slate-500">Inga projekt ännu</div>
        ) : (
          projects?.map((project) => {
            const budgetRatio = project.budgetHours ? (project.totalHours || 0) / project.budgetHours : 0;

            return (
              <div key={project.id} className={`card transition ${!project.active ? 'opacity-65' : 'hover:shadow-md'}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-xl bg-primary-100 p-2.5">
                      <FolderKanban className="h-5 w-5 text-primary-700" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/projects/${project.id}`} className="truncate font-semibold text-slate-900 hover:text-primary-700">
                          {project.name}
                        </Link>
                        <span className={statusColors[project.status]}>{statusLabels[project.status]}</span>
                      </div>
                      <p className="text-sm text-slate-500">
                        {project.code}
                        {project.customer && ` · ${project.customer.name}`}
                      </p>
                      {project.site && <p className="text-sm text-slate-500">{project.site}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 md:justify-end">
                    <div className="min-w-[140px] text-right text-sm">
                      <p className="font-semibold text-slate-900">
                        {project.totalHours?.toFixed(1)} h
                        {project.budgetHours && ` / ${project.budgetHours} h`}
                      </p>
                      {project.budgetHours ? (
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${budgetRatio > 0.9 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(budgetRatio * 100, 100)}%` }}
                          />
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">Ingen budget satt</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Link
                        to={`/projects/${project.id}`}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-50"
                        title="Öppna projekt"
                      >
                        Öppna
                      </Link>
                      <button
                        onClick={() => {
                          setEditingProject(project);
                          setIsModalOpen(true);
                        }}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                        title="Redigera"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {project.active ? (
                        <button
                          onClick={() => {
                            if (confirm('Inaktivera projekt?')) {
                              deleteMutation.mutate(project.id);
                            }
                          }}
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Inaktivera"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const confirmation = prompt(`Skriv RADERA ${project.code} för att radera permanent`);
                            if (confirmation === `RADERA ${project.code}`) {
                              permanentDeleteMutation.mutate(project.id);
                            } else if (confirmation !== null) {
                              toast.error('Fel bekräftelsetext, projektet raderades inte.');
                            }
                          }}
                          className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50"
                          title="Radera permanent"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</h2>
              <button onClick={closeModal} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div>
                <label className="label">Kund</label>
                <select name="customerId" defaultValue={editingProject?.customerId || ''} className="input">
                  <option value="">-- Intern --</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Projektnamn *</label>
                <input name="name" defaultValue={editingProject?.name} className="input" required />
              </div>

              <div>
                <label className="label">Projektkod *</label>
                <input name="code" defaultValue={editingProject?.code} className="input" placeholder="P2024-001" required />
              </div>

              <div>
                <label className="label">Plats/Arbetsplats</label>
                <input name="site" defaultValue={editingProject?.site || ''} className="input" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Status</label>
                  <select name="status" defaultValue={editingProject?.status || 'PLANNED'} className="input">
                    <option value="PLANNED">Planerad</option>
                    <option value="ONGOING">Pågår</option>
                    <option value="COMPLETED">Avslutad</option>
                    <option value="INVOICED">Fakturerad</option>
                  </select>
                </div>
                <div>
                  <label className="label">Debiteringsmodell</label>
                  <select name="billingModel" defaultValue={editingProject?.billingModel || 'HOURLY'} className="input">
                    <option value="HOURLY">Löpande</option>
                    <option value="FIXED">Fastpris</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Budget (timmar)</label>
                  <input name="budgetHours" type="number" defaultValue={editingProject?.budgetHours || ''} className="input" />
                </div>
                <div>
                  <label className="label">Timpris (kr/h)</label>
                  <input name="defaultRate" type="number" defaultValue={editingProject?.defaultRate || ''} className="input" />
                </div>
              </div>

              <label className="surface-muted flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                <input
                  name="employeeCanSeeResults"
                  type="checkbox"
                  defaultChecked={editingProject?.employeeCanSeeResults ?? false}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Visa projektresultat för anställda</span>
                  <span className="block text-xs text-slate-500">Om aktiverat kan anställda se timmar och fakturerbart utfall i projektvyn.</span>
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingProject ? (
                    'Spara'
                  ) : (
                    'Skapa'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
