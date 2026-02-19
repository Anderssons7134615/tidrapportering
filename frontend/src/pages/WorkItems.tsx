import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workItemsApi } from '../services/api';
import type { WorkItem } from '../types';
import { Plus, Edit2, Trash2, Wrench, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';

const UNITS = ['meter', 'm²', 'styck', 'löpmeter', 'kg', 'tim'];

export default function WorkItems() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);

  const { data: workItems, isLoading } = useQuery({
    queryKey: ['work-items'],
    queryFn: () => workItemsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: workItemsApi.create,
    onSuccess: () => {
      toast.success('Arbetsmoment skapat!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WorkItem> }) =>
      workItemsApi.update(id, data),
    onSuccess: () => {
      toast.success('Arbetsmoment uppdaterat!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: workItemsApi.delete,
    onSuccess: () => {
      toast.success('Arbetsmoment borttaget');
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      unit: formData.get('unit') as string,
      description: (formData.get('description') as string) || undefined,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
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
        <h1 className="page-title">Arbetsmoment</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nytt moment
        </button>
      </div>

      <p className="text-sm text-gray-400">
        Arbetsmoment används för att mäta produktivitet och bygga kalkyleringsunderlag.
        Anställda loggar antal enheter och tidsåtgång under "Produktivitet".
      </p>

      {!workItems || workItems.length === 0 ? (
        <div className="card p-8 text-center">
          <Wrench className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Inga arbetsmoment ännu</p>
          <p className="text-sm text-gray-600 mt-1">
            Skapa ditt första arbetsmoment, t.ex. "22-40 Plastplåt" med enhet "meter"
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {workItems.map((item) => (
            <div
              key={item.id}
              className={`card flex items-center justify-between py-3 ${
                !item.active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Wrench className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-400">
                    Enhet: {item.unit}
                    {item.description && ` · ${item.description}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!item.active && (
                  <span className="badge-gray">Inaktiv</span>
                )}
                <button
                  onClick={() => {
                    setEditingItem(item);
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-gray-500 hover:text-gray-300"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Ta bort arbetsmoment?')) {
                      deleteMutation.mutate(item.id);
                    }
                  }}
                  className="p-2 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-md w-full border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold">
                {editingItem ? 'Redigera arbetsmoment' : 'Nytt arbetsmoment'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-800 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Namn *</label>
                <input
                  name="name"
                  defaultValue={editingItem?.name}
                  className="input"
                  placeholder="t.ex. 22-40 Plastplåt"
                  required
                />
              </div>
              <div>
                <label className="label">Enhet *</label>
                <div className="flex gap-2">
                  <select
                    name="unit"
                    defaultValue={editingItem?.unit || 'meter'}
                    className="input flex-1"
                    required
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Beskrivning</label>
                <input
                  name="description"
                  defaultValue={editingItem?.description || ''}
                  className="input"
                  placeholder="Valfri beskrivning..."
                />
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
                  ) : editingItem ? (
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
