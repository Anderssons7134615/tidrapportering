import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Edit2, Loader2, Mail, Phone, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi } from '../services/api';
import type { Customer } from '../types';
import { ListSkeleton } from '../components/ui/Skeleton';
import { AppShell, Card, EmptyState, FilterBar, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';

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
        description="Sök, filtrera och öppna kundens projekt direkt. Korten visar status, kontakt och kopplade jobb."
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
              placeholder="Sök kund, kontakt, e-post eller telefon..."
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
                className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  statusFilter === filter.id
                    ? 'bg-graphite-950 text-white shadow-sm'
                    : 'border border-graphite-200 bg-white text-graphite-700 hover:border-primary-200 hover:bg-primary-50'
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
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredCustomers.map((customer) => (
            <Card key={customer.id} className={`group transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-premium ${!customer.active ? 'opacity-70' : ''}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <Link to={`/projects?customerId=${customer.id}`} className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-semibold text-graphite-950">{customer.name}</p>
                        <StatusBadge label={customer.active ? 'Aktiv' : 'Inaktiv'} tone={customer.active ? 'green' : 'gray'} />
                      </div>
                      <p className="mt-1 text-sm text-graphite-500">
                        {customer.contactPerson || 'Ingen kontaktperson'} · {customer._count?.projects || 0} projekt
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-graphite-600">
                        {customer.email && <span className="inline-flex items-center gap-1 rounded-full bg-graphite-100 px-2.5 py-1"><Mail className="h-3.5 w-3.5" /> E-post</span>}
                        {customer.phone && <span className="inline-flex items-center gap-1 rounded-full bg-graphite-100 px-2.5 py-1"><Phone className="h-3.5 w-3.5" /> Telefon</span>}
                      </div>
                    </div>
                  </div>
                </Link>

                <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
                  <Link to={`/projects?customerId=${customer.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 group-hover:text-primary-600">
                    Visa projekt
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingCustomer(customer);
                        setIsModalOpen(true);
                      }}
                      className="rounded-lg p-2 text-graphite-500 transition hover:bg-primary-50 hover:text-primary-700"
                      aria-label="Redigera kund"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {customer.active && (
                      <button
                        onClick={() => {
                          if (confirm('Inaktivera kund?')) deleteMutation.mutate(customer.id);
                        }}
                        className="rounded-lg p-2 text-graphite-500 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Inaktivera kund"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/65 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-white/80 bg-white shadow-premium">
            <div className="flex items-center justify-between border-b border-graphite-200 p-4">
              <h2 className="font-semibold text-graphite-950">{editingCustomer ? 'Redigera kund' : 'Ny kund'}</h2>
              <button onClick={closeModal} className="rounded-lg p-1.5 text-graphite-500 hover:bg-graphite-100 hover:text-graphite-950">
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
