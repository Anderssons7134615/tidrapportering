import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Check, ChevronDown, Clock, Copy, Loader2, PencilLine, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { activitiesApi, projectsApi, timeEntriesApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useHaptic } from '../hooks/useHaptic';
import { AppShell, Button, Card, FormField, PageHeader } from '../components/ui/design';
import { getDisabledReason, parseDateOnlyLocal, parseSwedishNumber, toDateInputValue } from '../utils/format';
import type { Activity, Project, User } from '../types';

function readReferenceCache<T>(key: string): T | undefined {
  if (!key) return undefined;
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
}

function writeReferenceCache(key: string, value: unknown) {
  if (!key || !value) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Offline-cachen är en bekvämlighet; formuläret fungerar fortfarande online.
  }
}

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
  const effectiveListUserId = canReportForOthers ? selectedUserId || user?.id : undefined;
  const weekReturnUrl = useMemo(() => {
    const params = new URLSearchParams({ date });
    if (selectedUserId) params.set('userId', selectedUserId);
    return `/week?${params.toString()}`;
  }, [date, selectedUserId]);
  const defaultReturnUrl = returnTo || weekReturnUrl;
  const projectsCacheKey = user?.id ? `tidapp-reference-projects:${user.id}` : '';
  const activitiesCacheKey = user?.id ? `tidapp-reference-activities:${user.id}` : '';
  const usersCacheKey = user?.id ? `tidapp-reference-users:${user.id}` : '';

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['projects', 'active', user?.id],
    queryFn: () => projectsApi.list({ active: true }),
    initialData: () => readReferenceCache<Project[]>(projectsCacheKey),
  });
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ['activities', 'active', user?.id],
    queryFn: () => activitiesApi.list(true),
    initialData: () => readReferenceCache<Activity[]>(activitiesCacheKey),
  });
  const { data: users } = useQuery<User[]>({
    queryKey: ['users', user?.id],
    queryFn: usersApi.list,
    enabled: canReportForOthers,
    initialData: () => readReferenceCache<User[]>(usersCacheKey),
  });
  const yesterdayDate = date ? parseDateOnlyLocal(date) : new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateInputValue(yesterdayDate);
  const selectedDateLabel = date ? format(parseDateOnlyLocal(date), 'EEEE d MMMM', { locale: sv }) : 'Välj datum';
  const { refetch: fetchYesterday } = useQuery({
    queryKey: ['copy-yesterday', yesterday, effectiveListUserId],
    queryFn: () => timeEntriesApi.list({ from: yesterday, to: yesterday, userId: effectiveListUserId }),
    enabled: false,
  });
  const { data: existingEntry, isLoading: isLoadingEntry } = useQuery({
    queryKey: ['timeEntry', entryId],
    queryFn: () => timeEntriesApi.get(entryId || ''),
    enabled: isEditMode,
  });
  const { data: dailyEntries } = useQuery({
    queryKey: ['timeEntries', 'day', date, effectiveListUserId],
    queryFn: () => timeEntriesApi.list({
      from: date,
      to: date,
      userId: effectiveListUserId,
    }),
    enabled: !isEditMode && (!canReportForOthers || Boolean(effectiveListUserId)),
  });

  useEffect(() => {
    if (!existingEntry) return;
    setDate(toDateInputValue(existingEntry.date));
    setProjectId(existingEntry.projectId || '');
    setActivityId(existingEntry.activityId);
    setSelectedUserId(existingEntry.userId);
    setHours(String(existingEntry.hours).replace('.', ','));
    setNote(existingEntry.note || '');
    setBillable(existingEntry.billable);
    setStartTime(existingEntry.startTime || '');
    setEndTime(existingEntry.endTime || '');
  }, [existingEntry]);

  useEffect(() => writeReferenceCache(projectsCacheKey, projects), [projects, projectsCacheKey]);
  useEffect(() => writeReferenceCache(activitiesCacheKey, activities), [activities, activitiesCacheKey]);
  useEffect(() => writeReferenceCache(usersCacheKey, users), [users, usersCacheKey]);

  useEffect(() => {
    const activity = activities?.find((item) => item.id === activityId);
    if (!activity) return;
    if (isEditMode && existingEntry?.activityId === activityId) return;
    setBillable(activity.billableDefault);
  }, [activityId, activities, isEditMode, existingEntry?.activityId]);

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
      navigate(defaultReturnUrl);
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
  const selectedActivity = activities?.find((item) => item.id === activityId);
  const projectRequired = !selectedActivity || !['ABSENCE', 'INTERNAL'].includes(selectedActivity.category);
  const disabledReason = getDisabledReason([
    [!activityId, 'Välj aktivitet'],
    [projectRequired && !projectId, 'Välj projekt'],
    [!hours || !Number.isFinite(hoursNumber) || hoursNumber <= 0, 'Ange antal timmar större än 0'],
  ]);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canEditEntry = existingEntry?.status !== 'APPROVED' || canReportForOthers;
  const recentProjects = projects
    ?.filter((project) => recentProjectIds.includes(project.id))
    .sort((a, b) => recentProjectIds.indexOf(a.id) - recentProjectIds.indexOf(b.id));
  const commonActivities = activities?.slice(0, 4) || [];
  const selectedProject = projects?.find((project) => project.id === projectId);
  const dailyTotal = dailyEntries?.reduce((sum, entry) => sum + entry.hours, 0) || 0;

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
      projectId: projectId || null,
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
      addPendingEntry({ ...entryData, ownerUserId: user!.id });
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
              {selectedDateLabel}
            </div>
          }
        />

        {!isEditMode && (
            <Card className="border-primary-100 bg-white/90">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Vald dag</p>
                <h2 className="mt-1 text-lg font-black text-graphite-950">
                  {selectedDateLabel}
                </h2>
                <p className="text-sm font-semibold text-graphite-600">
                  {dailyEntries?.length ? `${dailyTotal.toFixed(1)} h rapporterat på dagen` : 'Ingen tid rapporterad på dagen ännu'}
                </p>
              </div>
              <Link to={defaultReturnUrl} className="btn-secondary shrink-0">
                Tillbaka till veckan
              </Link>
            </div>

            {!!dailyEntries?.length && (
              <div className="mt-4 space-y-2">
                {dailyEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/time-entry?id=${entry.id}&return=${encodeURIComponent(defaultReturnUrl)}`}
                    className="block rounded-lg border border-primary-100 bg-white px-3 py-2.5 transition hover:border-primary-300 hover:bg-primary-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-graphite-950">
                          {entry.project?.code ? `${entry.project.code} · ${entry.project.name}` : 'Intern tid'}
                        </p>
                        <p className="text-xs font-medium text-graphite-500">
                          {entry.activity?.name}{entry.note ? ` · ${entry.note}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black text-primary-800">{entry.hours} h</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 pb-16 lg:pb-0">
          {!isEditMode && (
            <Card className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <div className="flex items-center gap-2 text-primary-700">
                    <Clock className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Snabbval</p>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-graphite-950">Börja med dagens tid</h2>
                  <p className="mt-1 text-sm leading-6 text-graphite-600">Välj datum, projekt och standardtimmar utan att lämna formuläret.</p>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))} className="rounded-md border border-graphite-200 bg-white px-3 py-3 text-sm font-semibold text-graphite-800 transition hover:border-primary-200 hover:bg-primary-50">Idag</button>
                    <button type="button" onClick={() => setDate(yesterday)} className="rounded-md border border-graphite-200 bg-white px-3 py-3 text-sm font-semibold text-graphite-800 transition hover:border-primary-200 hover:bg-primary-50">Igår</button>
                    <button type="button" onClick={copyYesterday} className="rounded-md border border-primary-200 bg-primary-50 px-3 py-3 text-sm font-semibold text-primary-800 transition hover:border-primary-300 hover:bg-primary-100">
                      <Copy className="mx-auto mb-1 h-4 w-4" />
                      Kopiera
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[7.5, 8, 4, 2].map((preset) => (
                      <button key={preset} type="button" onClick={() => setHours(String(preset).replace('.', ','))} className="rounded-md border border-graphite-200 bg-white px-3 py-3 text-base font-semibold text-graphite-900 transition hover:border-primary-200 hover:bg-primary-50">{String(preset).replace('.', ',')} h</button>
                    ))}
                  </div>
                  {!!recentProjects?.length && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {recentProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => setProjectId(project.id)}
                          className={`rounded-md border px-3 py-3 text-left transition ${
                            projectId === project.id ? 'border-primary-400 bg-primary-50 text-primary-900' : 'border-graphite-200 bg-white text-graphite-700 hover:border-primary-200 hover:bg-primary-50'
                          }`}
                        >
                          <span className="block text-sm font-semibold">{project.code}</span>
                          <span className="block truncate text-xs opacity-80">{project.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
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
                <p className="mt-1 text-xs font-medium text-graphite-500">{selectedDateLabel}</p>
              </FormField>
              <FormField label="Projekt">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input">
                  <option value="">{projectRequired ? 'Välj projekt...' : 'Inget projekt (intern/frånvaro)'}</option>
                  {projects?.map((project) => <option key={project.id} value={project.id}>{project.code} - {project.name}{project.customer ? ` (${project.customer.name})` : ''}</option>)}
                </select>
                {!projectRequired && <p className="mt-1 text-xs font-medium text-graphite-500">Projekt är valfritt för intern tid och frånvaro.</p>}
              </FormField>
              <FormField label="Aktivitet">
                {!!commonActivities.length && (
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    {commonActivities.map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        onClick={() => setActivityId(activity.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                          activityId === activity.id
                            ? 'border-primary-300 bg-primary-50 text-primary-800 ring-2 ring-primary-100'
                            : 'border-graphite-200 bg-white text-graphite-700 hover:border-primary-200 hover:bg-primary-50'
                        }`}
                      >
                        {activity.name}
                      </button>
                    ))}
                  </div>
                )}
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
                  <button key={preset} type="button" onClick={() => setHours(String(preset))} className="rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm font-semibold text-graphite-800 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800">{preset} h</button>
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
              </div>
            </details>

            <div className="rounded-lg border border-graphite-200 bg-graphite-50 p-3 text-sm text-graphite-700">
              <span className="font-semibold text-graphite-950">Nästa steg:</span>{' '}
              {selectedProject ? `${selectedProject.code} · ${selectedProject.name}` : 'välj projekt'} · {hours || 'ange timmar'} h · {selectedActivity?.name || 'välj aktivitet'}
            </div>

            <Button type="submit" className="mobile-sticky-submit" isLoading={isSaving} variant={saved ? 'success' : 'primary'} disabledReason={disabledReason}>
              {saved ? <><Check className="h-5 w-5" /> Sparad!</> : <>{isEditMode ? <PencilLine className="h-5 w-5" /> : <Save className="h-5 w-5" />}{isEditMode ? 'Uppdatera tidrad' : 'Spara tidrad'}</>}
            </Button>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
