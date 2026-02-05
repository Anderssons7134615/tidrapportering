import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesApi } from '../services/api';
import type { Activity } from '../types';
import { Plus, Edit2, Trash2, Tags, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';

const categoryLabels: Record<string, string> = {
  WORK: 'Arbete',
  TRAVEL: 'Resa',
  MEETING: 'Möte',
  INTERNAL: 'Internt',
  CHANGE_ORDER: 'ÄTA',
  ABSENCE: 'Frånvaro',
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
      billableDefault: formData.get('billableDefault') === 'true',
      rateOverride: formData.get('rateOverride')
        ? parseFloat(formData.get('rateOverride') as string)
        : undefined,
      sortOrder: formData.get('sortOrder')
        ? parseInt(formData.get('sortOrder') as string)
        : 0,
    };

    if (editingActivity) {
      updateMutation.mutate({ id: editingActivity.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Gruppera aktiviteter per kategori
  const groupedActivities = activities?.reduce((acc, activity) => {
    const category = activity.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(activity);
    return acc;
  }, {} as Record<string, Activity[]>);

  if (isLoading) {
    return <ListSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Aktiviteter</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ny aktivitet
        </button>
      </div>

      {/* Lista grupperad per kategori */}
      {groupedActivities && Object.entries(groupedActivities).map(([category, acts]) => (
        <div key={category}>
          <h2 className="font-medium text-gray-500 mb-2">
            {categoryLabels[category] || category}
          </h2>
          <div className="space-y-2">
            {acts.map((activity) => (
              <div
                key={activity.id}
                className={`card flex items-center justify-between py-3 ${
                  !activity.active ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Tags className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-sm text-gray-500">
                      Kod: {activity.code}
                      {activity.rateOverride && ` · ${activity.rateOverride} kr/h`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activity.billableDefault ? (
                    <span className="badge-green">Fakturerbar</span>
                  ) : (
                    <span className="badge-gray">Ej fakt.</span>
                  )}
                  <button
                    onClick={() => {
                      setEditingActivity(activity);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Ta bort aktivitet?')) {
                        deleteMutation.mutate(activity.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">
                {editingActivity ? 'Redigera aktivitet' : 'Ny aktivitet'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Namn *</label>
                <input
                  name="name"
                  defaultValue={editingActivity?.name}
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Kod *</label>
                  <input
                    name="code"
                    defaultValue={editingActivity?.code}
                    className="input"
                    placeholder="MONT"
                    required
                  />
                </div>
                <div>
                  <label className="label">Kategori</label>
                  <select
                    name="category"
                    defaultValue={editingActivity?.category || 'WORK'}
                    className="input"
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Fakturerbar som standard</label>
                <select
                  name="billableDefault"
                  defaultValue={editingActivity?.billableDefault ? 'true' : 'false'}
                  className="input"
                >
                  <option value="true">Ja</option>
                  <option value="false">Nej</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Timpris (override)</label>
                  <input
                    name="rateOverride"
                    type="number"
                    defaultValue={editingActivity?.rateOverride || ''}
                    className="input"
                    placeholder="Lämna tomt för standard"
                  />
                </div>
                <div>
                  <label className="label">Sorteringsordning</label>
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={editingActivity?.sortOrder || 0}
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
                  ) : editingActivity ? (
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
