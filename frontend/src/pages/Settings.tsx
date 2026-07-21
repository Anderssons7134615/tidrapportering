import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Building, CheckCircle2, Loader2, Lock, Send, Settings as SettingsIcon, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, pushSubscriptionsApi, settingsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { disablePushNotifications, enablePushNotifications, getPushStatus } from '../services/pushNotifications';
import { SettingsSkeleton } from '../components/ui/Skeleton';
import { AppShell, PageHeader } from '../components/ui/design';

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

  const { data: pushSubscriptions = [], isLoading: isPushSubscriptionsLoading } = useQuery({
    queryKey: ['push-subscriptions'],
    queryFn: pushSubscriptionsApi.list,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: pushStatus, isLoading: isPushStatusLoading } = useQuery({
    queryKey: ['push-status'],
    queryFn: getPushStatus,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      toast.success('Inställningar sparade');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Lösenord ändrat');
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
    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
    },
  });

  const testPushMutation = useMutation({
    mutationFn: () => {
      if (!pushStatus?.endpoint) throw new Error('Aktivera notiser på den här enheten först');
      return pushSubscriptionsApi.test(pushStatus.endpoint);
    },
    onSuccess: () => {
      toast.success('Provnotisen är skickad');
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
    },
  });

  const permissionLabel = pushStatus?.permission === 'granted'
    ? 'Tillåtet'
    : pushStatus?.permission === 'denied'
      ? 'Blockerat'
      : 'Inte valt';
  const isPushLoading = isPushSubscriptionsLoading || isPushStatusLoading;
  const currentDeviceActive = Boolean(
    pushStatus?.endpoint
    && pushSubscriptions.some((subscription) => subscription.endpoint === pushStatus.endpoint)
  );

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
    <AppShell>
      <PageHeader
        title="Inställningar"
        description="Hantera konto, företag och notiser på ett sätt som fungerar lika bra i mobilen som på datorn."
        action={
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="chip justify-center">{user?.role === 'ADMIN' ? 'Admin' : user?.role === 'SUPERVISOR' ? 'Arbetsledare' : user?.role === 'ACCOUNTANT' ? 'Lön och ekonomi' : 'Medarbetare'}</div>
            <div className="chip justify-center">Notiser på {pushSubscriptions.length} enhet(er)</div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-graphite-100 p-3 text-graphite-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Säkerhet</h2>
                <p className="text-sm text-slate-500">Byt lösenord utan att lämna sidan.</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="label">Nuvarande lösenord</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" required />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Nytt lösenord</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" required minLength={6} />
                </div>
                <div>
                  <label className="label">Bekräfta nytt lösenord</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" required />
                </div>
              </div>
              <button type="submit" disabled={changePasswordMutation.isPending} className="btn-primary">
                {changePasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Byt lösenord'}
              </button>
            </form>
          </div>

          {isAdmin && settings && (
            <div className="card">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-sky-100 p-3 text-sky-700">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="section-title">Företagsinställningar</h2>
                  <p className="text-sm text-slate-500">Grundvärden för export, påminnelser och bolagsnamn.</p>
                </div>
              </div>

              <form onSubmit={handleSettingsSubmit} className="space-y-4">
                <div>
                  <label className="label">Företagsnamn</label>
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
                    <label className="label">Fredagspåminnelse</label>
                    <input name="reminderTime" type="time" defaultValue={settings.reminderTime} className="input" />
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-md border border-graphite-200 bg-white px-3.5 py-2.5">
                    <span>
                      <span className="block text-sm font-semibold text-graphite-900">Automatisk påminnelse</span>
                      <span className="block text-xs leading-5 text-graphite-600">Skickas på fredagar efter vald tid.</span>
                    </span>
                    <input
                      name="reminderEnabled"
                      type="checkbox"
                      value="true"
                      defaultChecked={settings.reminderEnabled}
                      className="h-5 w-5 shrink-0 accent-primary-700"
                    />
                  </label>
                </div>

                <button type="submit" disabled={updateSettingsMutation.isPending} className="btn-primary">
                  {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Spara inställningar'}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-3 text-amber-700">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Push-notiser</h2>
                <p className="text-sm text-slate-500">Se status och hantera registrerade enheter.</p>
              </div>
            </div>

            {isPushLoading ? (
              <p className="border-y border-graphite-200 py-4 text-sm text-graphite-600">Kontrollerar notisstatus...</p>
            ) : pushStatus?.requiresHomeScreenInstall ? (
              <div className="border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                På iPhone behöver TidApp ligga på hemskärmen. Öppna sidan i Safari, välj Dela och sedan Lägg till på hemskärmen. Öppna därefter TidApp från hemskärmen.
              </div>
            ) : !pushStatus?.supported ? (
              <p className="border-y border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Den här webbläsaren kan inte ta emot push-notiser.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="divide-y divide-graphite-200 border-y border-graphite-200">
                  <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                    <span className="flex items-center gap-3 text-sm text-graphite-700">
                      <Smartphone className="h-4 w-4 text-graphite-500" aria-hidden="true" />
                      Den här enheten
                    </span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-graphite-950">
                      {currentDeviceActive && <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />}
                      {currentDeviceActive ? 'Aktiv' : 'Inte aktiv'}
                    </span>
                  </div>
                  <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                    <span className="text-sm text-graphite-700">Tillstånd i webbläsaren</span>
                    <span className="text-sm font-semibold text-graphite-950">{permissionLabel}</span>
                  </div>
                  <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                    <span className="text-sm text-graphite-700">Dina registrerade enheter</span>
                    <span className="text-sm font-semibold tabular-nums text-graphite-950">{pushSubscriptions.length}</span>
                  </div>
                </div>

                <p className="max-w-[65ch] text-sm leading-6 text-graphite-600">TidApp påminner på fredagar när veckan ännu inte har skickats in. Varje mobil och dator aktiveras separat.</p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {!currentDeviceActive ? (
                    <button type="button" onClick={() => enablePushMutation.mutate()} disabled={enablePushMutation.isPending} className="btn-primary">
                      {enablePushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
                      Aktivera notiser
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => testPushMutation.mutate()} disabled={testPushMutation.isPending} className="btn-primary">
                        {testPushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        Skicka provnotis
                      </button>
                      <button
                        type="button"
                        onClick={() => disablePushMutation.mutate()}
                        disabled={disablePushMutation.isPending}
                        className="btn-secondary"
                      >
                        {disablePushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
                        Stäng av på enheten
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-graphite-100 p-3 text-graphite-700">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Om appen</h2>
                <p className="text-sm text-slate-500">En snabb översikt över ditt konto.</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-graphite-50 px-4 py-3">
                <span>Version</span>
                <span className="font-semibold text-slate-900">1.0.0</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-graphite-50 px-4 py-3">
                <span>Inloggad som</span>
                <span className="font-semibold text-slate-900">{user?.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-graphite-50 px-4 py-3">
                <span>E-post</span>
                <span className="font-semibold text-slate-900">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-graphite-50 px-4 py-3">
                <span>Roll</span>
                <span className="font-semibold text-slate-900">
                  {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'SUPERVISOR' ? 'Arbetsledare' : user?.role === 'ACCOUNTANT' ? 'Lön och ekonomi' : 'Medarbetare'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
