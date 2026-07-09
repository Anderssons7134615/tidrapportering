import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesApi } from '../services/api';
import type { Activity } from '../types';
import { Plus, Edit2, Trash2, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';
import { AppShell, DataTable, PageHeader, StatusBadge } from '../components/ui/design';

const categoryLabels: Record<string, string> = {
  WORK: 'Arbete',
  TRAVEL: 'Resa',
  MEETING: 'Möte',
  INTERNAL: 'Internt',
  CHANGE_ORDER: 'ÄTA',
  ABSENCE: 'Frånvaro',
};

const categoryTones: Record<string, 'blue' | 'green' | 'yellow' | 'gray' | 'orange'> = {
  WORK: 'blue',
  TRAVEL: 'orange',
  MEETING: 'yellow',
  INTERNAL: 'gray',
  CHANGE_ORDER: 'green',
  ABSENCE: 'gray',
};

export default function Activities() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: activitiesApi.create,
    onSuccess: () => {
      toast.success('Aktivitet skapad!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Activity> }) =>
      activitiesApi.update(id, data),
    onSuccess: () => {
      toast.success('Aktivitet uppdaterad!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: activitiesApi.delete,
    onSuccess: () => {
      toast.success('Aktivitet borttagen');
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingActivity(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      category: formData.get('category') as Activity['category'],
      billableDefault: editingActivity?.billableDefault ?? true,
      sortOrder: formData.get('sortOrder')
        ? parseInt(formData.get('sortOrder') as string, 10)
        : 0,
    };

    if (editingActivity) updateMutation.mutate({ id: editingActivity.id, data });
    else createMutation.mutate(data);
  };

  const sortedActivities = [...(activities || [])].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
  });

  if (isLoading) return <ListSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title="Aktiviteter"
        description="Standardaktiviteter för tidrapportering. Koder och kategorier används i rapporter och löneunderlag."
        action={
          <button type="button" onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Ny aktivitet
          </button>
        }
      />

      <DataTable>
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Aktivitet</th>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Sortering</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-100">
            {sortedActivities.map((activity) => (
              <tr key={activity.id} className={!activity.active ? 'opacity-60' : ''}>
                <td className="px-4 py-3 font-semibold text-graphite-950">{activity.name}</td>
                <td className="px-4 py-3 text-graphite-700">{activity.code}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={categoryLabels[activity.category] || activity.category} tone={categoryTones[activity.category] || 'gray'} />
                </td>
                <td className="px-4 py-3 text-graphite-600">{activity.sortOrder || 0}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={activity.active ? 'Aktiv' : 'Inaktiv'} tone={activity.active ? 'green' : 'gray'} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditingActivity(activity);
                        setIsModalOpen(true);
                      }}
                      className="rounded-md p-2 text-graphite-500 hover:bg-primary-50 hover:text-primary-700"
                      aria-label="Redigera aktivitet"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Ta bort aktivitet?')) deleteMutation.mutate(activity.id);
                      }}
                      className="rounded-md p-2 text-graphite-500 hover:bg-rose-50 hover:text-rose-700"
                      aria-label="Ta bort aktivitet"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/45 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-dialog-title"
            className="w-full max-w-md overflow-hidden rounded-lg border border-graphite-200 bg-white shadow-md"
          >
            <div className="flex items-center justify-between border-b border-graphite-200 px-4 py-3">
              <h2 id="activity-dialog-title" className="font-semibold text-graphite-950">
                {editingActivity ? 'Redigera aktivitet' : 'Ny aktivitet'}
              </h2>
              <button type="button" onClick={closeModal} aria-label="Stäng" className="rounded-md p-1.5 text-graphite-500 hover:bg-graphite-100 hover:text-graphite-950">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <div>
                <label htmlFor="activity-name" className="label">Namn *</label>
                <input id="activity-name" name="name" defaultValue={editingActivity?.name} className="input" required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="activity-code" className="label">Kod *</label>
                  <input id="activity-code" name="code" defaultValue={editingActivity?.code} className="input" placeholder="MONT" required />
                </div>
                <div>
                  <label htmlFor="activity-category" className="label">Kategori</label>
                  <select id="activity-category" name="category" defaultValue={editingActivity?.category || 'WORK'} className="input">
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="activity-sort-order" className="label">Sorteringsordning</label>
                <input id="activity-sort-order" name="sortOrder" type="number" defaultValue={editingActivity?.sortOrder || 0} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Avbryt
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                  {createMutation.isPending || updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingActivity ? 'Spara' : 'Skapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
