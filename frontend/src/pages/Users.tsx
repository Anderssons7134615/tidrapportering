import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../services/api';
import type { User } from '../types';
import { Plus, Edit2, Trash2, Loader2, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';
import { AppShell, DataTable, PageHeader, StatusBadge } from '../components/ui/design';

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Arbetsledare',
  EMPLOYEE: 'Medarbetare',
  ACCOUNTANT: 'Revisor',
};

const roleTones: Record<string, 'red' | 'yellow' | 'blue' | 'green'> = {
  ADMIN: 'red',
  SUPERVISOR: 'yellow',
  EMPLOYEE: 'blue',
  ACCOUNTANT: 'green',
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      toast.success('Användare skapad!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      toast.success('Användare uppdaterad!');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: usersApi.delete,
    onSuccess: () => {
      toast.success('Användare inaktiverad');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const gdprDeleteMutation = useMutation({
    mutationFn: usersApi.gdprDelete,
    onSuccess: () => {
      toast.success('Användare raderad permanent');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Partial<User> = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      role: formData.get('role') as User['role'],
    };

    if (editingUser) updateMutation.mutate({ id: editingUser.id, data });
    else createMutation.mutate({ ...data, password: formData.get('password') as string });
  };

  if (isLoading) return <ListSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title="Användare"
        description="Hantera medarbetare, roller och åtkomst i samma listvy som övriga register."
        action={
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Ny användare
          </button>
        }
      />

      <DataTable>
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Namn</th>
              <th className="px-4 py-3">E-post</th>
              <th className="px-4 py-3">Roll</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-100">
            {(users || []).map((user) => (
              <tr key={user.id} className={!user.active ? 'opacity-60' : ''}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-graphite-200 bg-graphite-50 text-xs font-semibold text-graphite-700">
                      {user.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <span className="font-semibold text-graphite-950">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-graphite-600">{user.email}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={roleLabels[user.role]} tone={roleTones[user.role]} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={user.active ? 'Aktiv' : 'Inaktiv'} tone={user.active ? 'green' : 'gray'} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditingUser(user);
                        setIsModalOpen(true);
                      }}
                      className="rounded-md p-2 text-graphite-500 hover:bg-primary-50 hover:text-primary-700"
                      aria-label="Redigera användare"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {user.active ? (
                      <button
                        onClick={() => {
                          if (confirm('Inaktivera användare?')) deleteMutation.mutate(user.id);
                        }}
                        className="rounded-md p-2 text-graphite-500 hover:bg-rose-50 hover:text-rose-700"
                        aria-label="Inaktivera användare"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm('GDPR: Radera användare och ALL data permanent? Detta kan inte ångras.')) {
                            gdprDeleteMutation.mutate(user.id);
                          }
                        }}
                        className="rounded-md p-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        title="GDPR: Radera permanent"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-graphite-200 bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-graphite-200 px-4 py-3">
              <h2 className="font-semibold text-graphite-950">
                {editingUser ? 'Redigera användare' : 'Ny användare'}
              </h2>
              <button onClick={closeModal} className="rounded-md p-1.5 text-graphite-500 hover:bg-graphite-100 hover:text-graphite-950">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <div>
                <label className="label">Namn *</label>
                <input name="name" defaultValue={editingUser?.name} className="input" required />
              </div>
              <div>
                <label className="label">E-post *</label>
                <input name="email" type="email" defaultValue={editingUser?.email} className="input" required />
              </div>
              {!editingUser && (
                <div>
                  <label className="label">Lösenord *</label>
                  <input name="password" type="password" className="input" required minLength={6} placeholder="Minst 6 tecken" />
                </div>
              )}
              <div>
                <label className="label">Roll</label>
                <select name="role" defaultValue={editingUser?.role || 'EMPLOYEE'} className="input">
                  <option value="EMPLOYEE">Medarbetare</option>
                  <option value="ACCOUNTANT">Revisor</option>
                  <option value="SUPERVISOR">Arbetsledare</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Avbryt
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                  {createMutation.isPending || updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingUser ? 'Spara' : 'Skapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
