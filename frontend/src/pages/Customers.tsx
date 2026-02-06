import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../services/api';
import type { Customer } from '../types';
import { Plus, Edit2, Trash2, Building2, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';

export default function Customers() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      toast.success('Kund skapad!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Customer> }) =>
      customersApi.update(id, data),
    onSuccess: () => {
      toast.success('Kund uppdaterad!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: customersApi.delete,
    onSuccess: () => {
      toast.success('Kund inaktiverad');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      orgNumber: formData.get('orgNumber') as string || undefined,
      address: formData.get('address') as string || undefined,
      contactPerson: formData.get('contactPerson') as string || undefined,
      email: formData.get('email') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      defaultRate: formData.get('defaultRate')
        ? parseFloat(formData.get('defaultRate') as string)
        : undefined,
    };

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data });
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
        <h1 className="page-title">Kunder</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ny kund
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {customers?.length === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            Inga kunder ännu
          </div>
        ) : (
          customers?.map((customer) => (
            <div
              key={customer.id}
              className={`card flex items-center justify-between ${
                !customer.active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Building2 className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-gray-400">
                    {customer.contactPerson && `${customer.contactPerson} · `}
                    {customer._count?.projects || 0} projekt
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {customer.defaultRate && (
                  <span className="text-sm text-gray-400">
                    {customer.defaultRate} kr/h
                  </span>
                )}
                <button
                  onClick={() => {
                    setEditingCustomer(customer);
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-gray-500 hover:text-gray-300"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {customer.active && (
                  <button
                    onClick={() => {
                      if (confirm('Inaktivera kund?')) {
                        deleteMutation.mutate(customer.id);
                      }
                    }}
                    className="p-2 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold">
                {editingCustomer ? 'Redigera kund' : 'Ny kund'}
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
                  defaultValue={editingCustomer?.name}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Organisationsnummer</label>
                <input
                  name="orgNumber"
                  defaultValue={editingCustomer?.orgNumber || ''}
                  className="input"
                  placeholder="556xxx-xxxx"
                />
              </div>
              <div>
                <label className="label">Adress</label>
                <input
                  name="address"
                  defaultValue={editingCustomer?.address || ''}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Kontaktperson</label>
                <input
                  name="contactPerson"
                  defaultValue={editingCustomer?.contactPerson || ''}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">E-post</label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingCustomer?.email || ''}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Telefon</label>
                  <input
                    name="phone"
                    defaultValue={editingCustomer?.phone || ''}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Standard timpris (kr/h)</label>
                <input
                  name="defaultRate"
                  type="number"
                  defaultValue={editingCustomer?.defaultRate || ''}
                  className="input"
                  placeholder="750"
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
                  ) : editingCustomer ? (
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
