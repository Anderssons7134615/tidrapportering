import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../services/api';
import type { User } from '../types';
import { Plus, Edit2, Trash2, Loader2, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Arbetsledare',
  EMPLOYEE: 'Medarbetare',
};

const roleColors: Record<string, string> = {
  ADMIN: 'badge-red',
  SUPERVISOR: 'badge-yellow',
  EMPLOYEE: 'badge-blue',
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
    const data: any = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      role: formData.get('role') as User['role'],
      hourlyCost: formData.get('hourlyCost')
        ? parseFloat(formData.get('hourlyCost') as string)
        : undefined,
    };

    if (!editingUser) {
      data.password = formData.get('password') as string;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data });
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
        <h1 className="page-title">Användare</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ny användare
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {users?.map((user) => (
          <div
            key={user.id}
            className={`card flex items-center justify-between ${
              !user.active ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-900/30 rounded-full flex items-center justify-center">
                <span className="text-primary-400 font-medium">
                  {user.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{user.name}</p>
                  <span className={roleColors[user.role]}>
                    {roleLabels[user.role]}
                  </span>
                </div>
                <p className="text-sm text-gray-400">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user.hourlyCost && (
                <span className="text-sm text-gray-400">
                  {user.hourlyCost} kr/h
                </span>
              )}
              <button
                onClick={() => {
                  setEditingUser(user);
                  setIsModalOpen(true);
                }}
                className="p-2 text-gray-500 hover:text-gray-300"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              {user.active && (
                <button
                  onClick={() => {
                    if (confirm('Inaktivera användare?')) {
                      deleteMutation.mutate(user.id);
                    }
                  }}
                  className="p-2 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {!user.active && (
                <button
                  onClick={() => {
                    if (confirm('GDPR: Radera användare och ALL data permanent? Detta kan inte ångras.')) {
                      gdprDeleteMutation.mutate(user.id);
                    }
                  }}
                  className="p-2 text-red-400 hover:text-red-600"
                  title="GDPR: Radera permanent"
                >
                  <Shield className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-md w-full border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold">
                {editingUser ? 'Redigera användare' : 'Ny användare'}
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
                  defaultValue={editingUser?.name}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">E-post *</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingUser?.email}
                  className="input"
                  required
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="label">Lösenord *</label>
                  <input
                    name="password"
                    type="password"
                    className="input"
                    required
                    minLength={6}
                    placeholder="Minst 6 tecken"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Roll</label>
                  <select
                    name="role"
                    defaultValue={editingUser?.role || 'EMPLOYEE'}
                    className="input"
                  >
                    <option value="EMPLOYEE">Medarbetare</option>
                    <option value="SUPERVISOR">Arbetsledare</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="label">Timkostnad (kr/h)</label>
                  <input
                    name="hourlyCost"
                    type="number"
                    defaultValue={editingUser?.hourlyCost || ''}
                    className="input"
                    placeholder="350"
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
                  ) : editingUser ? (
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
