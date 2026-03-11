import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Building, Loader2, Lock, Settings as SettingsIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, pushSubscriptionsApi, settingsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { disablePushNotifications, enablePushNotifications, getPushStatus } from '../services/pushNotifications';
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

  const { data: pushSubscriptions = [] } = useQuery({
    queryKey: ['push-subscriptions'],
    queryFn: pushSubscriptionsApi.list,
  });

  const { data: pushStatus } = useQuery({
    queryKey: ['push-status'],
    queryFn: getPushStatus,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      toast.success('Installningar sparade');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Losenord andrat');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enablePushMutation = useMutation({
    mutationFn: enablePushNotifications,
    onSuccess: () => {
      toast.success('Push-notiser aktiverade');
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disablePushMutation = useMutation({
    mutationFn: disablePushNotifications,
    onSuccess: () => {
      toast.success('Push-notiser avaktiverade');
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSettingsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateSettingsMutation.mutate({
      companyName: formData.get('companyName') as string,
      vatRate: parseFloat(formData.get('vatRate') as string),
      csvDelimiter: formData.get('csvDelimiter') as string,
      reminderTime: formData.get('reminderTime') as string,
      reminderEnabled: formData.get('reminderEnabled') === 'true',
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Losenorden matchar inte');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Losenordet maste vara minst 6 tecken');
      return;
    }
    changePasswordMutation.mutate();
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="hero-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="page-title">Installningar</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Hantera konto, foretag och notiser pa ett satt som fungerar lika bra i mobilen som pa datorn.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="chip justify-center">{user?.role === 'ADMIN' ? 'Admin' : user?.role === 'SUPERVISOR' ? 'Arbetsledare' : 'Medarbetare'}</div>
            <div className="chip justify-center">{pushSubscriptions.length} enhet(er)</div>
            <div className="chip justify-center">{pushStatus?.permission || 'standard'}</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Sakerhet</h2>
                <p className="text-sm text-slate-500">Byt losenord utan att lamna sidan.</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="label">Nuvarande losenord</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" required />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Nytt losenord</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" required minLength={6} />
                </div>
                <div>
                  <label className="label">Bekrafta nytt losenord</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" required />
                </div>
              </div>
              <button type="submit" disabled={changePasswordMutation.isPending} className="btn-primary">
                {changePasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Byt losenord'}
              </button>
            </form>
          </div>

          {isAdmin && settings && (
            <div className="card">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="section-title">Foretagsinstallningar</h2>
                  <p className="text-sm text-slate-500">Grundvarden for export, paminnelser och bolagsnamn.</p>
                </div>
              </div>

              <form onSubmit={handleSettingsSubmit} className="space-y-4">
                <div>
                  <label className="label">Foretagsnamn</label>
                  <input name="companyName" defaultValue={settings.companyName} className="input" />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Momssats (%)</label>
                    <input name="vatRate" type="number" defaultValue={settings.vatRate} className="input" min="0" max="100" />
                  </div>
                  <div>
                    <label className="label">CSV-separator</label>
                    <select name="csvDelimiter" defaultValue={settings.csvDelimiter} className="input">
                      <option value=";">Semikolon (;)</option>
                      <option value=",">Komma (,)</option>
                      <option value="\t">Tab</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Paminnelsetid</label>
                    <input name="reminderTime" type="time" defaultValue={settings.reminderTime} className="input" />
                  </div>
                  <div>
                    <label className="label">Paminnelser</label>
                    <select name="reminderEnabled" defaultValue={settings.reminderEnabled ? 'true' : 'false'} className="input">
                      <option value="true">Aktiverade</option>
                      <option value="false">Avaktiverade</option>
                    </select>
                  </div>
                </div>

                <button type="submit" disabled={updateSettingsMutation.isPending} className="btn-primary">
                  {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Spara installningar'}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Push-notiser</h2>
                <p className="text-sm text-slate-500">Se status och hantera registrerade enheter.</p>
              </div>
            </div>

            {!pushStatus?.supported ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Din webblasare stodjer inte push-notiser.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="soft-panel p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Behorighet</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{pushStatus.permission}</p>
                  </div>
                  <div className="soft-panel p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Registrerade enheter</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{pushSubscriptions.length}</p>
                  </div>
                </div>

                {pushSubscriptions.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    <p className="font-semibold uppercase tracking-[0.14em] text-slate-400">Senaste endpoint</p>
                    <p className="mt-2 break-all">{pushSubscriptions[0].endpoint}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => enablePushMutation.mutate()} disabled={enablePushMutation.isPending} className="btn-primary">
                    {enablePushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aktivera notiser'}
                  </button>
                  <button
                    type="button"
                    onClick={() => disablePushMutation.mutate()}
                    disabled={disablePushMutation.isPending || pushSubscriptions.length === 0}
                    className="btn-secondary"
                  >
                    {disablePushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Avaktivera'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Om appen</h2>
                <p className="text-sm text-slate-500">En snabb oversikt over ditt konto.</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <span>Version</span>
                <span className="font-semibold text-slate-900">1.0.0</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <span>Inloggad som</span>
                <span className="font-semibold text-slate-900">{user?.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <span>E-post</span>
                <span className="font-semibold text-slate-900">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <span>Roll</span>
                <span className="font-semibold text-slate-900">
                  {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'SUPERVISOR' ? 'Arbetsledare' : 'Medarbetare'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
