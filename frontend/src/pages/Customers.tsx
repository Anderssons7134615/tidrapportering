import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi } from '../services/api';
import type { Customer } from '../types';
import { ListSkeleton } from '../components/ui/Skeleton';
import { AppShell, DataTable, EmptyState, FilterBar, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';

export default function Customers() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

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
    mutationFn: ({ id, data }: { id: string; data: Partial<Customer> }) => customersApi.update(id, data),
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

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (customers || []).filter((customer) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && customer.active) ||
        (statusFilter === 'inactive' && !customer.active);
      const matchesSearch =
        !query ||
        [customer.name, customer.contactPerson, customer.email, customer.phone, customer.orgNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [customers, search, statusFilter]);

  const activeCount = customers?.filter((customer) => customer.active).length || 0;
  const projectCount = customers?.reduce((sum, customer) => sum + (customer._count?.projects || 0), 0) || 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      orgNumber: (formData.get('orgNumber') as string) || undefined,
      address: (formData.get('address') as string) || undefined,
      contactPerson: (formData.get('contactPerson') as string) || undefined,
      email: (formData.get('email') as string) || undefined,
      phone: (formData.get('phone') as string) || undefined,
    };

    if (editingCustomer) updateMutation.mutate({ id: editingCustomer.id, data });
    else createMutation.mutate(data);
  };

  if (isLoading) return <ListSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title="Kunder"
        description="Kundregister med kontaktuppgifter och kopplade projekt i samma listvy som övriga register."
        action={
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Ny kund
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Kunder totalt" value={customers?.length || 0} tone="slate" />
        <KpiCard label="Aktiva kunder" value={activeCount} tone="green" />
        <KpiCard label="Projekt kopplade" value={projectCount} tone="orange" />
      </div>

      <FilterBar>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input pl-9"
              placeholder="Sök kund, kontakt, e-post eller telefon"
            />
          </label>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            {[
              { id: 'active', label: 'Aktiva' },
              { id: 'inactive', label: 'Inaktiva' },
              { id: 'all', label: 'Alla' },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id as typeof statusFilter)}
                className={`rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                  statusFilter === filter.id
                    ? 'border-primary-700 bg-primary-50 text-primary-800'
                    : 'border-graphite-200 bg-white text-graphite-700 hover:border-primary-200 hover:bg-primary-50'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </FilterBar>

      {!filteredCustomers.length ? (
        <EmptyState title="Inga kunder matchar filtret" description="Testa att ändra sökning eller visa alla kunder." />
      ) : (
        <DataTable>
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Kund</th>
                <th className="px-4 py-3">Kontakt</th>
                <th className="px-4 py-3">E-post</th>
                <th className="px-4 py-3">Telefon</th>
                <th className="px-4 py-3 text-right">Projekt</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className={!customer.active ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <Link to={`/projects?customerId=${customer.id}`} className="font-semibold text-graphite-950 hover:text-primary-700">
                      {customer.name}
                    </Link>
                    {customer.orgNumber && <p className="mt-1 text-xs text-graphite-500">{customer.orgNumber}</p>}
                  </td>
                  <td className="px-4 py-3 text-graphite-700">{customer.contactPerson || '-'}</td>
                  <td className="px-4 py-3 text-graphite-700">{customer.email || '-'}</td>
                  <td className="px-4 py-3 text-graphite-700">{customer.phone || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-graphite-950">{customer._count?.projects || 0}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={customer.active ? 'Aktiv' : 'Inaktiv'} tone={customer.active ? 'green' : 'gray'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingCustomer(customer);
                          setIsModalOpen(true);
                        }}
                        className="rounded-md p-2 text-graphite-500 hover:bg-primary-50 hover:text-primary-700"
                        aria-label="Redigera kund"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {customer.active && (
                        <button
                          onClick={() => {
                            if (confirm('Inaktivera kund?')) deleteMutation.mutate(customer.id);
                          }}
                          className="rounded-md p-2 text-graphite-500 hover:bg-rose-50 hover:text-rose-700"
                          aria-label="Inaktivera kund"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-graphite-200 bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-graphite-200 px-4 py-3">
              <h2 className="font-semibold text-graphite-950">{editingCustomer ? 'Redigera kund' : 'Ny kund'}</h2>
              <button onClick={closeModal} className="rounded-md p-1.5 text-graphite-500 hover:bg-graphite-100 hover:text-graphite-950">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <div>
                <label className="label">Namn *</label>
                <input name="name" defaultValue={editingCustomer?.name} className="input" required />
              </div>
              <div>
                <label className="label">Organisationsnummer</label>
                <input name="orgNumber" defaultValue={editingCustomer?.orgNumber || ''} className="input" placeholder="556xxx-xxxx" />
              </div>
              <div>
                <label className="label">Adress</label>
                <input name="address" defaultValue={editingCustomer?.address || ''} className="input" />
              </div>
              <div>
                <label className="label">Kontaktperson</label>
                <input name="contactPerson" defaultValue={editingCustomer?.contactPerson || ''} className="input" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">E-post</label>
                  <input name="email" type="email" defaultValue={editingCustomer?.email || ''} className="input" />
                </div>
                <div>
                  <label className="label">Telefon</label>
                  <input name="phone" defaultValue={editingCustomer?.phone || ''} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Avbryt
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                  {createMutation.isPending || updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCustomer ? 'Spara' : 'Skapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
