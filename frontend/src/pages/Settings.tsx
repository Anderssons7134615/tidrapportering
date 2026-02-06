import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { Settings as SettingsIcon, Loader2, Lock, Building } from 'lucide-react';
import toast from 'react-hot-toast';
import { SettingsSkeleton } from '../components/ui/Skeleton';

export default function Settings() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      toast.success('Inställningar sparade!');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Lösenord ändrat!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSettingsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      companyName: formData.get('companyName') as string,
      vatRate: parseFloat(formData.get('vatRate') as string),
      csvDelimiter: formData.get('csvDelimiter') as string,
      reminderTime: formData.get('reminderTime') as string,
      reminderEnabled: formData.get('reminderEnabled') === 'true',
    };
    updateSettingsMutation.mutate(data);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Lösenorden matchar inte');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Lösenordet måste vara minst 6 tecken');
      return;
    }
    changePasswordMutation.mutate();
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Inställningar</h1>

      {/* Lösenord */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold">Byt lösenord</h2>
        </div>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="label">Nuvarande lösenord</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Nytt lösenord</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="label">Bekräfta nytt lösenord</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="btn-primary"
          >
            {changePasswordMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Byt lösenord'
            )}
          </button>
        </form>
      </div>

      {/* Företagsinställningar - endast admin */}
      {isAdmin && settings && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Building className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold">Företagsinställningar</h2>
          </div>
          <form onSubmit={handleSettingsSubmit} className="space-y-4">
            <div>
              <label className="label">Företagsnamn</label>
              <input
                name="companyName"
                defaultValue={settings.companyName}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Momssats (%)</label>
                <input
                  name="vatRate"
                  type="number"
                  defaultValue={settings.vatRate}
                  className="input"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="label">CSV-separator</label>
                <select
                  name="csvDelimiter"
                  defaultValue={settings.csvDelimiter}
                  className="input"
                >
                  <option value=";">Semikolon (;)</option>
                  <option value=",">Komma (,)</option>
                  <option value="\t">Tab</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Påminnelsetid</label>
                <input
                  name="reminderTime"
                  type="time"
                  defaultValue={settings.reminderTime}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Påminnelser</label>
                <select
                  name="reminderEnabled"
                  defaultValue={settings.reminderEnabled ? 'true' : 'false'}
                  className="input"
                >
                  <option value="true">Aktiverade</option>
                  <option value="false">Avaktiverade</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={updateSettingsMutation.isPending}
              className="btn-primary"
            >
              {updateSettingsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Spara inställningar'
              )}
            </button>
          </form>
        </div>
      )}

      {/* App-info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold">Om appen</h2>
        </div>
        <div className="space-y-2 text-sm text-gray-400">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Inloggad som:</strong> {user?.name} ({user?.email})</p>
          <p><strong>Roll:</strong> {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'SUPERVISOR' ? 'Arbetsledare' : 'Medarbetare'}</p>
        </div>
      </div>
    </div>
  );
}
