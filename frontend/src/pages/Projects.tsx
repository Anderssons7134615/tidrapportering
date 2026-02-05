import { useState } from 'react';
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

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
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
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      projectsApi.update(id, data),
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

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      customerId: formData.get('customerId') as string || undefined,
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      site: formData.get('site') as string || undefined,
      status: formData.get('status') as Project['status'],
      budgetHours: formData.get('budgetHours')
        ? parseFloat(formData.get('budgetHours') as string)
        : undefined,
      billingModel: formData.get('billingModel') as Project['billingModel'],
      defaultRate: formData.get('defaultRate')
        ? parseFloat(formData.get('defaultRate') as string)
        : undefined,
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
      <div className="flex items-center justify-between">
        <h1 className="page-title">Projekt</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nytt projekt
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {projects?.length === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            Inga projekt ännu
          </div>
        ) : (
          projects?.map((project) => (
            <div
              key={project.id}
              className={`card ${!project.active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <FolderKanban className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{project.name}</p>
                      <span className={statusColors[project.status]}>
                        {statusLabels[project.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {project.code}
                      {project.customer && ` · ${project.customer.name}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      {project.totalHours?.toFixed(1)}h
                      {project.budgetHours && ` / ${project.budgetHours}h`}
                    </p>
                    {project.budgetHours && (
                      <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className={`h-1.5 rounded-full ${
                            (project.totalHours || 0) / project.budgetHours > 0.9
                              ? 'bg-red-500'
                              : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              ((project.totalHours || 0) / project.budgetHours) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingProject(project);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {project.active && (
                    <button
                      onClick={() => {
                        if (confirm('Inaktivera projekt?')) {
                          deleteMutation.mutate(project.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">
                {editingProject ? 'Redigera projekt' : 'Nytt projekt'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Kund</label>
                <select
                  name="customerId"
                  defaultValue={editingProject?.customerId || ''}
                  className="input"
                >
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
                <input
                  name="name"
                  defaultValue={editingProject?.name}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Projektkod *</label>
                <input
                  name="code"
                  defaultValue={editingProject?.code}
                  className="input"
                  placeholder="P2024-001"
                  required
                />
              </div>
              <div>
                <label className="label">Plats/Arbetsplats</label>
                <input
                  name="site"
                  defaultValue={editingProject?.site || ''}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Status</label>
                  <select
                    name="status"
                    defaultValue={editingProject?.status || 'PLANNED'}
                    className="input"
                  >
                    <option value="PLANNED">Planerad</option>
                    <option value="ONGOING">Pågår</option>
                    <option value="COMPLETED">Avslutad</option>
                    <option value="INVOICED">Fakturerad</option>
                  </select>
                </div>
                <div>
                  <label className="label">Debiteringsmodell</label>
                  <select
                    name="billingModel"
                    defaultValue={editingProject?.billingModel || 'HOURLY'}
                    className="input"
                  >
                    <option value="HOURLY">Löpande</option>
                    <option value="FIXED">Fastpris</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Budget (timmar)</label>
                  <input
                    name="budgetHours"
                    type="number"
                    defaultValue={editingProject?.budgetHours || ''}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Timpris (kr/h)</label>
                  <input
                    name="defaultRate"
                    type="number"
                    defaultValue={editingProject?.defaultRate || ''}
                    className="input"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
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
