import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Check, ChevronDown, Clock, Copy, Loader2, PencilLine, Save, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { activitiesApi, projectsApi, timeEntriesApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useHaptic } from '../hooks/useHaptic';
import { AppShell, Button, Card, FormField, PageHeader } from '../components/ui/design';
import { getDisabledReason, parseSwedishNumber } from '../utils/format';

export default function TimeEntry() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { isOnline, addPendingEntry } = useOfflineStore();
  const { trigger: haptic } = useHaptic();
  const canReportForOthers = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const entryId = searchParams.get('id');
  const returnTo = searchParams.get('return');
  const isEditMode = Boolean(entryId);

  const [date, setDate] = useState(searchParams.get('date') || format(new Date(), 'yyyy-MM-dd'));
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(searchParams.get('userId') || '');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saved, setSaved] = useState(false);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('tidapp-recent-projects') || '[]');
    } catch {
      return [];
    }
  });

  const { data: projects } = useQuery({ queryKey: ['projects', 'active'], queryFn: () => projectsApi.list({ active: true }) });
  const { data: activities } = useQuery({ queryKey: ['activities', 'active'], queryFn: () => activitiesApi.list(true) });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: canReportForOthers });
  const yesterday = format(new Date(new Date(date).getTime() - 86400000), 'yyyy-MM-dd');
  const { refetch: fetchYesterday } = useQuery({
    queryKey: ['copy-yesterday', yesterday, selectedUserId],
    queryFn: () => timeEntriesApi.list({ from: yesterday, to: yesterday, userId: canReportForOthers ? selectedUserId || undefined : undefined }),
    enabled: false,
  });
  const { data: existingEntry, isLoading: isLoadingEntry } = useQuery({
    queryKey: ['timeEntry', entryId],
    queryFn: () => timeEntriesApi.get(entryId || ''),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (!existingEntry) return;
    setDate(format(new Date(existingEntry.date), 'yyyy-MM-dd'));
    setProjectId(existingEntry.projectId || '');
    setActivityId(existingEntry.activityId);
    setSelectedUserId(existingEntry.userId);
    setHours(String(existingEntry.hours).replace('.', ','));
    setNote(existingEntry.note || '');
    setBillable(existingEntry.billable);
    setStartTime(existingEntry.startTime || '');
    setEndTime(existingEntry.endTime || '');
  }, [existingEntry]);

  useEffect(() => {
    const activity = activities?.find((item) => item.id === activityId);
    if (activity) setBillable(activity.billableDefault);
  }, [activityId, activities]);

  const groupedActivities = useMemo(() => {
    return activities?.reduce((acc, activity) => {
      if (!acc[activity.category]) acc[activity.category] = [];
      acc[activity.category].push(activity);
      return acc;
    }, {} as Record<string, typeof activities>);
  }, [activities]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    queryClient.invalidateQueries({ queryKey: ['week'] });
    queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
    queryClient.invalidateQueries({ queryKey: ['team-week-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    if (projectId) queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const rememberProject = (id: string) => {
    if (!id) return;
    const next = [id, ...recentProjectIds.filter((recentId) => recentId !== id)].slice(0, 4);
    setRecentProjectIds(next);
    localStorage.setItem('tidapp-recent-projects', JSON.stringify(next));
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => timeEntriesApi.create(data),
    onSuccess: () => {
      haptic('success');
      toast.success('Tid sparad');
      rememberProject(projectId);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      invalidate();
      if (returnTo) return navigate(returnTo);
      setHours('');
      setNote('');
      setStartTime('');
      setEndTime('');
    },
    onError: (error: Error) => {
      haptic('error');
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => timeEntriesApi.update(id, data),
    onSuccess: () => {
      haptic('success');
      toast.success('Tidrad uppdaterad');
      invalidate();
      navigate(returnTo || `/week?date=${date}`);
    },
    onError: (error: Error) => {
      haptic('error');
      toast.error(error.message);
    },
  });

  const categoryLabels: Record<string, string> = {
    WORK: 'Arbete',
    TRAVEL: 'Resa',
    MEETING: 'Möte',
    INTERNAL: 'Internt',
    CHANGE_ORDER: 'ÄTA',
    ABSENCE: 'Frånvaro',
  };

  const hoursNumber = parseSwedishNumber(hours);
  const disabledReason = getDisabledReason([
    [!projectId, 'Välj projekt'],
    [!activityId, 'Välj aktivitet'],
    [!hours || !Number.isFinite(hoursNumber) || hoursNumber <= 0, 'Ange antal timmar större än 0'],
  ]);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canEditEntry = existingEntry?.status !== 'APPROVED' || canReportForOthers;
  const recentProjects = projects
    ?.filter((project) => recentProjectIds.includes(project.id))
    .sort((a, b) => recentProjectIds.indexOf(a.id) - recentProjectIds.indexOf(b.id));

  const adjustHours = (delta: number) => {
    const current = Number.isFinite(hoursNumber) ? hoursNumber : 0;
    setHours(String(Math.max(current + delta, 0)).replace('.', ','));
  };

  const copyYesterday = async () => {
    const result = await fetchYesterday();
    const first = result.data?.[0];
    if (!first) {
      toast.error('Hittade ingen tidrad från gårdagen');
      return;
    }
    setProjectId(first.projectId || '');
    setActivityId(first.activityId);
    setHours(String(first.hours).replace('.', ','));
    setNote(first.note || '');
    setBillable(first.billable);
    toast.success('Kopierade gårdagens första tidrad');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabledReason) return;

    const entryData = {
      date,
      projectId,
      activityId,
      userId: canReportForOthers ? selectedUserId || undefined : undefined,
      hours: hoursNumber,
      billable,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      note: note || undefined,
    };

    haptic('medium');
    if (isEditMode) {
      if (!isOnline) return toast.error('Redigering kräver uppkoppling');
      updateMutation.mutate({ id: entryId!, data: entryData });
      rememberProject(projectId);
      return;
    }

    if (isOnline) createMutation.mutate(entryData);
    else {
      addPendingEntry(entryData);
      rememberProject(projectId);
      haptic('success');
      toast.success('Sparad offline - synkas när du är online');
      setHours('');
      setNote('');
    }
  };

  if (isEditMode && isLoadingEntry) {
    return <div className="card flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-graphite-500" /></div>;
  }

  if (isEditMode && existingEntry && !canEditEntry) {
    return <div className="card text-sm text-graphite-600">Godkända tidrader kan inte ändras.</div>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          title={isEditMode ? 'Redigera tidrad' : 'Rapportera tid'}
          description="Fyll i projekt, aktivitet och timmar. Allt viktigt ligger först, resten finns under fler val."
          action={
            <div className="hidden rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800 sm:flex sm:items-center sm:gap-2">
              <Clock className="h-4 w-4" />
              {format(new Date(date), 'EEEE d MMMM', { locale: sv })}
            </div>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isEditMode && (
            <Card className="bg-graphite-950 text-white">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-primary-300">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Snabbval</p>
                  </div>
                  <p className="mt-1 text-sm text-graphite-200">Kopiera gårdagen eller välj ett nyligen använt projekt.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copyYesterday} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                    <Copy className="h-4 w-4" />
                    Kopiera gårdagen
                  </button>
                  {recentProjects?.map((project) => (
                    <button key={project.id} type="button" onClick={() => setProjectId(project.id)} className="rounded-lg border border-primary-300/20 bg-primary-500/15 px-3 py-2 text-sm font-semibold text-primary-100 transition hover:bg-primary-500/25">
                      {project.code}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <Card className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {canReportForOthers && (
                <FormField label="Anställd">
                  <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input">
                    <option value="">Jag själv</option>
                    {users?.map((entryUser) => <option key={entryUser.id} value={entryUser.id}>{entryUser.name}</option>)}
                  </select>
                </FormField>
              )}
              <FormField label="Datum">
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" required />
                <p className="mt-1 text-xs font-medium text-graphite-500">{format(new Date(date), 'EEEE d MMMM', { locale: sv })}</p>
              </FormField>
              <FormField label="Projekt">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input">
                  <option value="">Välj projekt...</option>
                  {projects?.map((project) => <option key={project.id} value={project.id}>{project.code} - {project.name}{project.customer ? ` (${project.customer.name})` : ''}</option>)}
                </select>
              </FormField>
              <FormField label="Aktivitet">
                <select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="input">
                  <option value="">Välj aktivitet...</option>
                  {groupedActivities && Object.entries(groupedActivities).map(([category, items]) => (
                    <optgroup key={category} label={categoryLabels[category] || category}>
                      {items?.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="Antal timmar">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3">
                <input className="input min-h-[48px] text-lg font-semibold sm:text-xl" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="7,5" />
                <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => adjustHours(-0.5)}>-0,5</button>
                <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => adjustHours(0.5)}>+0,5</button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[2, 4, 6, 8].map((preset) => (
                  <button key={preset} type="button" onClick={() => setHours(String(preset))} className="rounded-lg border border-graphite-200 bg-graphite-50 px-3 py-2 text-sm font-semibold text-graphite-800 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800">{preset} h</button>
                ))}
              </div>
            </FormField>

            <FormField label="Kommentar">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} className="input" rows={3} placeholder="Kort kommentar, valfritt" />
            </FormField>

            <details className="rounded-lg border border-graphite-200 bg-graphite-50/80 p-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-graphite-800">
                Fler val
                <ChevronDown className="h-4 w-4 text-graphite-500" />
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label="Starttid"><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="input" /></FormField>
                <FormField label="Sluttid"><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="input" /></FormField>
                <label className="flex items-center gap-3 rounded-lg border border-graphite-200 bg-white p-3 text-graphite-800 md:col-span-2">
                  <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} className="h-4 w-4 rounded border-graphite-300 text-primary-600" />
                  <span className="text-sm font-semibold">Fakturerbar tid</span>
                </label>
              </div>
            </details>

            <Button type="submit" isLoading={isSaving} variant={saved ? 'success' : 'primary'} disabledReason={disabledReason}>
              {saved ? <><Check className="h-5 w-5" /> Sparad!</> : <>{isEditMode ? <PencilLine className="h-5 w-5" /> : <Save className="h-5 w-5" />}{isEditMode ? 'Uppdatera tidrad' : 'Spara tidrad'}</>}
            </Button>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
