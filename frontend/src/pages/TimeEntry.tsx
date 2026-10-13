import { refreshTimeQueries } from '../utils/timeQueries';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Check, ChevronDown, Copy, Loader2, PencilLine, RefreshCw, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { activitiesApi, projectsApi, timeEntriesApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { enqueueTimeWrite, dispatchTimeWrite, ownsOperation } from '../services/timeWriteQueue';
import { useHaptic } from '../hooks/useHaptic';
import { AppShell, Button, DataList, DataRow, FormField, PageHeader, ReviewSummary, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { ProjectPicker } from '../components/ProjectPicker';
import { formatHours, getDisabledReason, parseDateOnlyLocal, parseSwedishNumber, toDateInputValue } from '../utils/format';
import { referenceQueryCache } from '../utils/referenceQuery';
import type { Activity, ProjectOption, User } from '../types';

function readReferenceCache<T>(key: string): T | undefined {
  if (!key) return undefined;
  try {
    const value = localStorage.getItem(key);
    if (!value) return undefined;
    const data = JSON.parse(value);
    // These offline choices never need prices, rates or payroll costs, even
    // when a pre-upgrade cache was populated by an administrator.
    if (!Array.isArray(data)) return undefined;
    return data.map(item => {
      if (key.includes('projects')) return { id: item.id, code: item.code, name: item.name, customer: item.customer ? { id: item.customer.id, name: item.customer.name } : null };
      const { hourlyCost, rateOverride, ...safe } = item;
      return safe;
    }) as T;
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
  const [searchParams] = useSearchParams();
  return <TimeEntryForm key={`${searchParams.get('id') || ''}:${searchParams.get('pending') || ''}`} />;
}

function TimeEntryForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { isOnline, pendingEntries, removePendingEntries } = useOfflineStore();
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
  const hydratedId = useRef<string | null>(null);
  const [baseRevision, setBaseRevision] = useState<number>();
  const [operationKey, setOperationKey] = useState<string | null>(searchParams.get('pending'));
  const activeWrite = useRef<ReturnType<typeof enqueueTimeWrite> | null>(null);
  const abandonedAttempts = useRef(new Set<string>());
  const observedOperations = useRef(new Set<string>());
  const pending = pendingEntries.find(row => ownsOperation(row) && (row.localId === operationKey || (entryId && row.write && 'id' in row.write && row.write.id === entryId)));
  useEffect(() => { if (pending) observedOperations.current.add(pending.localId); }, [pending]);
  const restoredCreate = useRef<string | null>(null);
  useEffect(() => {
    if (pending?.write?.operation !== 'CREATE' || restoredCreate.current === pending.localId) return;
    restoredCreate.current = pending.localId;
    const draft = pending.write.payload;
    setDate(draft.date); setProjectId(draft.projectId || ''); setActivityId(draft.activityId);
    setSelectedUserId(draft.userId || user?.id || ''); setHours(String(draft.hours).replace('.', ','));
    setNote(draft.note || ''); setBillable(draft.billable); setStartTime(draft.startTime || ''); setEndTime(draft.endTime || '');
  }, [pending, user?.id]);
  const loadEntry = (entry: NonNullable<typeof existingEntry>) => {
    hydratedId.current = entry.id;
    setBaseRevision(entry.revision);
    setDate(toDateInputValue(entry.date)); setProjectId(entry.projectId || '');
    setActivityId(entry.activityId); setSelectedUserId(entry.userId);
    setHours(String(entry.hours).replace('.', ',')); setNote(entry.note || '');
    setBillable(entry.billable); setStartTime(entry.startTime || ''); setEndTime(entry.endTime || '');
  };
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

  const {
    data: projects,
    isError: projectsFailed,
    isFetching: projectsFetching,
    refetch: refetchProjects,
  } = useQuery<ProjectOption[]>({
    queryKey: ['projects', 'options', 'active', user?.id],
    queryFn: projectsApi.options,
    ...referenceQueryCache(() => readReferenceCache<ProjectOption[]>(projectsCacheKey)),
  });
  const {
    data: activities,
    isError: activitiesFailed,
    isFetching: activitiesFetching,
    refetch: refetchActivities,
  } = useQuery<Activity[]>({
    queryKey: ['activities', 'active', user?.id],
    queryFn: () => activitiesApi.list(true),
    ...referenceQueryCache(() => readReferenceCache<Activity[]>(activitiesCacheKey)),
  });
  const { data: users } = useQuery<User[]>({
    queryKey: ['users', user?.id],
    queryFn: usersApi.list,
    enabled: canReportForOthers,
    ...referenceQueryCache(() => readReferenceCache<User[]>(usersCacheKey)),
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
  const {
    data: existingEntry,
    isLoading: isLoadingEntry,
    isError: isExistingEntryError,
    error: existingEntryError,
    refetch: refetchExistingEntry,
  } = useQuery({
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
    // Restore the saved draft after reload, including a rejected update.
    if (pending?.write?.operation === 'UPDATE') {
      if (hydratedId.current === `pending-${pending.localId}`) return;
      hydratedId.current = `pending-${pending.localId}`;
      const draft = pending.write.payload;
      setOperationKey(pending.localId); setBaseRevision(pending.write.revision);
      setDate(draft.date || (existingEntry ? toDateInputValue(existingEntry.date) : ''));
      setProjectId(draft.projectId || ''); setActivityId(draft.activityId || existingEntry?.activityId || '');
      setSelectedUserId(draft.userId || existingEntry?.userId || '');
      setHours(String(draft.hours ?? existingEntry?.hours ?? '').replace('.', ','));
      setNote(draft.note || ''); setBillable(draft.billable ?? existingEntry?.billable ?? false);
      setStartTime(draft.startTime || ''); setEndTime(draft.endTime || '');
      return;
    }
    if (!existingEntry || hydratedId.current === existingEntry.id) return;
    loadEntry(existingEntry);
  }, [existingEntry, pending]);

  useEffect(() => writeReferenceCache(projectsCacheKey, projects), [projects, projectsCacheKey]);
  useEffect(() => writeReferenceCache(activitiesCacheKey, activities?.map(({ rateOverride, ...activity }) => activity)), [activities, activitiesCacheKey]);
  useEffect(() => writeReferenceCache(usersCacheKey, users?.map(({ hourlyCost, ...person }) => person)), [users, usersCacheKey]);

  useEffect(() => {
    if (pending) return;
    const activity = activities?.find((item) => item.id === activityId);
    if (!activity) return;
    if (isEditMode && existingEntry?.activityId === activityId) return;
    setBillable(activity.billableDefault);
  }, [activityId, activities, isEditMode, existingEntry?.activityId, pending]);

  const groupedActivities = useMemo(() => {
    return activities?.reduce((acc, activity) => {
      if (!acc[activity.category]) acc[activity.category] = [];
      acc[activity.category].push(activity);
      return acc;
    }, {} as Record<string, typeof activities>);
  }, [activities]);

  const invalidate = () => {
    void refreshTimeQueries(queryClient);
  };

  const rememberProject = (id: string) => {
    if (!id) return;
    const next = [id, ...recentProjectIds.filter((recentId) => recentId !== id)].slice(0, 4);
    setRecentProjectIds(next);
    localStorage.setItem('tidapp-recent-projects', JSON.stringify(next));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const row = pending || activeWrite.current || enqueueTimeWrite(isEditMode
        ? { operation: 'UPDATE', id: entryId!, revision: baseRevision!, payload: data }
        : { operation: 'CREATE', payload: data });
      activeWrite.current = row;
      setOperationKey(row.localId);
      return isOnline ? dispatchTimeWrite(row) : null;
    },
    onSuccess: (ack) => {
      haptic('success');
      toast.success(ack ? (isEditMode ? 'Tidrad uppdaterad' : 'Tid sparad') : 'Sparad på enheten – väntar på synkning');
      rememberProject(projectId);
      invalidate();
      if (!ack) return navigate(defaultReturnUrl);
      activeWrite.current = null;
      setOperationKey(null);
      if (isEditMode || returnTo) return navigate(defaultReturnUrl);
      setSaved(true); setTimeout(() => setSaved(false), 1800);
      setHours(''); setNote(''); setStartTime(''); setEndTime('');
    },
    onError: (error: Error) => { haptic('error'); toast.error(error.message); },
  });

  useEffect(() => {
    // A background replay can confirm an earlier timed-out foreground save.
    if (!operationKey || pending || !observedOperations.current.has(operationKey) || abandonedAttempts.current.has(operationKey)) return;
    activeWrite.current = null;
    setOperationKey(null); setHours(''); setNote(''); setStartTime(''); setEndTime('');
    toast.success('Servern har bekräftat sparandet');
    if (isEditMode) navigate(defaultReturnUrl);
  }, [operationKey, pending, isEditMode, navigate, defaultReturnUrl]);

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
    [hoursNumber > 24, 'En tidrad kan högst vara 24 timmar'],
  ]);
  const isSaving = saveMutation.isPending;
  const canEditEntry = existingEntry?.status !== 'APPROVED';
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
      userId: canReportForOthers ? selectedUserId || user!.id : user!.id,
      hours: hoursNumber,
      billable,
      startTime: startTime || null,
      endTime: endTime || null,
      note: note || null,
    };

    haptic('medium');
    if (isSaving || pending) return;
    saveMutation.mutate(entryData);
  };

  if (isEditMode && isLoadingEntry && !pending) {
    return <div className="task-section flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-graphite-500" /></div>;
  }

  if (isEditMode && isExistingEntryError && !existingEntry && !pending) {
    return (
      <AppShell>
        <QueryError
          title="Kunde inte hämta tidraden"
          description={existingEntryError instanceof Error ? existingEntryError.message : 'Försök igen innan du ändrar något.'}
          onRetry={() => void refetchExistingEntry()}
        />
      </AppShell>
    );
  }

  if (isEditMode && existingEntry && !canEditEntry && !pending) {
    return <div className="task-section text-sm text-graphite-600">Godkända tidrader kan inte ändras.</div>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          title={isEditMode ? 'Redigera tidrad' : 'Rapportera tid'}
          description="Välj projekt, aktivitet och timmar för din arbetsdag."
        />

        {!isEditMode && (
          <ReviewSummary>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-graphite-950">{selectedDateLabel}</p>
                <p className="mt-0.5 text-sm text-graphite-600">
                  {dailyEntries?.length ? `${formatHours(dailyTotal)} rapporterat på dagen` : 'Ingen tid rapporterad på dagen ännu'}
                </p>
              </div>
              <Link to={defaultReturnUrl} className="text-link inline-flex min-h-11 items-center">
                Tillbaka till veckan
              </Link>
            </div>
          </ReviewSummary>
        )}

        {pending && <TaskSection title="Sparandet ligger kvar på enheten">
          <p role="status" className="text-sm">{pending.syncError || 'Väntar på kvittens från servern. Skicka inte en ny kopia.'}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {pending.retryable !== false && <Button type="button" disabled={!isOnline || isSaving} onClick={() => saveMutation.mutate({})}>Kontrollera sparandet</Button>}
            {pending.retryable === false && !pending.mayHaveCommitted && <Button type="button" onClick={async () => {
              if (isEditMode) {
                const result = await refetchExistingEntry();
                if (!result.data || result.isError) return toast.error('Kunde inte hämta den senaste versionen. Dina uppgifter finns kvar.');
                if (result.data.status === 'APPROVED') return toast.error('Veckan är fortfarande godkänd. Be en attestant låsa upp den. Dina sparade uppgifter ligger kvar.');
                // Keep the user's draft; explicitly adopt only the new revision.
                setBaseRevision(result.data.revision);
                hydratedId.current = result.data.id;
              }
              abandonedAttempts.current.add(pending.localId);
              activeWrite.current = null;
              setOperationKey(null); removePendingEntries([pending.localId]);
            }}>{pending.syncErrorCode === 'WEEK_APPROVED' ? 'Kontrollera om veckan är upplåst' : 'Behåll mina uppgifter och hämta senaste version'}</Button>}
          </div>
        </TaskSection>}
        <form onSubmit={handleSubmit} className="space-y-5 pb-16 lg:pb-0"><fieldset disabled={Boolean(pending) || isSaving} className="space-y-5">
          {!isEditMode && (
            <TaskSection className="time-entry-section space-y-4" aria-label="Snabbval">
              <div className="border-b border-graphite-200 pb-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-medium text-graphite-500">Snabbval</span>
                    <button type="button" onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))} className="btn-secondary">Idag</button>
                    <button type="button" onClick={() => setDate(yesterday)} className="btn-secondary">Igår</button>
                    <button type="button" onClick={copyYesterday} className="btn-secondary">
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Kopiera gårdagen
                    </button>
                  </div>
                  {!!recentProjects?.length && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {recentProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => setProjectId(project.id)}
                          className={`choice-tile text-left ${
                            projectId === project.id ? 'choice-tile-selected' : 'text-graphite-700'
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
            </TaskSection>
          )}

          <TaskSection className="time-entry-section space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {canReportForOthers && (
                <FormField label="Anställd" controlId="time-entry-user">
                  <select id="time-entry-user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input">
                    <option value="">Jag själv</option>
                    {users?.filter((entryUser) => entryUser.role !== 'ACCOUNTANT').map((entryUser) => <option key={entryUser.id} value={entryUser.id}>{entryUser.name}</option>)}
                  </select>
                </FormField>
              )}
              <FormField label="Datum" controlId="time-entry-date">
                <input id="time-entry-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" required />
                <p className="mt-1 text-xs font-medium text-graphite-500">{selectedDateLabel}</p>
              </FormField>
              <div>
                <FormField label="Projekt" controlId="time-entry-project">
                  <ProjectPicker id="time-entry-project" projects={projects || []} value={projectId} onChange={setProjectId} required={projectRequired} />
                </FormField>
                <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-2" aria-live="polite">
                  <div className="min-w-0 text-xs font-medium">
                    {!isOnline && Boolean(projects?.length) && <p className="text-amber-800">Offline – visar senast sparade projekt.</p>}
                    {!isOnline && !projects?.length && <p className="text-amber-800">Offline – inga sparade projekt finns på enheten.</p>}
                    {isOnline && projectsFailed && <p role="alert" className="text-rose-700">Projektlistan kunde inte uppdateras. Den sparade listan kan vara gammal.</p>}
                    {isOnline && !projectsFailed && !projectsFetching && projects?.length === 0 && <p className="text-amber-800">Inga aktiva projekt hittades.</p>}
                    {!projectRequired && <p className="text-graphite-500">Projekt är valfritt för intern tid och frånvaro.</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void refetchProjects()}
                    disabled={!isOnline || projectsFetching}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-primary-800 transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:text-graphite-400"
                  >
                    <RefreshCw className={`h-4 w-4 ${projectsFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                    {projectsFetching ? 'Uppdaterar projekt' : 'Uppdatera projekt'}
                  </button>
                </div>
              </div>
              <FormField label="Aktivitet" group>
                {activitiesFailed && !activities?.length ? (
                  <QueryError title="Aktiviteterna kunde inte hämtas" description="Tid kan inte sparas förrän aktivitetslistan är tillgänglig." onRetry={() => void refetchActivities()} />
                ) : (
                  <>
                {!!commonActivities.length && (
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    {commonActivities.map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        onClick={() => setActivityId(activity.id)}
                        className={`choice-tile px-3 py-2.5 text-left text-sm ${
                          activityId === activity.id
                            ? 'choice-tile-selected text-primary-800'
                            : 'text-graphite-700'
                        }`}
                      >
                        {activity.name}
                      </button>
                    ))}
                  </div>
                )}
                <label htmlFor="time-entry-activity" className="sr-only">Alla aktiviteter</label>
                <select id="time-entry-activity" value={activityId} onChange={(event) => setActivityId(event.target.value)} className="input" disabled={activitiesFetching && !activities?.length}>
                  <option value="">Välj aktivitet...</option>
                  {groupedActivities && Object.entries(groupedActivities).map(([category, items]) => (
                    <optgroup key={category} label={categoryLabels[category] || category}>
                      {items?.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                  </>
                )}
                {activitiesFailed && Boolean(activities?.length) && (
                  <p role="alert" className="mt-2 text-sm text-amber-800">Aktivitetslistan kunde inte uppdateras. Den sparade listan kan vara gammal.</p>
                )}
              </FormField>
            </div>

            <FormField label="Antal timmar" group>
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3">
                <input aria-label="Antal timmar" className="input min-h-[48px] text-lg font-semibold sm:text-xl" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="7,5" />
                <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => adjustHours(-0.5)}>-0,5</button>
                <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => adjustHours(0.5)}>+0,5</button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[2, 4, 7.5, 8].map((preset) => (
                  <button key={preset} type="button" onClick={() => setHours(String(preset).replace('.', ','))} className="choice-tile py-2 text-sm">{String(preset).replace('.', ',')} h</button>
                ))}
              </div>
            </FormField>

            <FormField label="Kommentar" controlId="time-entry-note">
              <textarea id="time-entry-note" value={note} onChange={(event) => setNote(event.target.value)} className="input" rows={3} placeholder="Kort kommentar, valfritt" />
            </FormField>

            <details className="rounded-lg border border-graphite-200 bg-graphite-50/80 px-3.5">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-semibold text-graphite-800">
                Fler val
                <ChevronDown className="h-4 w-4 text-graphite-500" />
              </summary>
              <div className="mb-3.5 mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label="Starttid" controlId="time-entry-start"><input id="time-entry-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="input" /></FormField>
                <FormField label="Sluttid" controlId="time-entry-end"><input id="time-entry-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="input" /></FormField>
              </div>
            </details>

            <div className="rounded-lg border border-graphite-200 bg-graphite-50 p-3 text-sm text-graphite-700">
              <span className="font-semibold text-graphite-950">Nästa steg:</span>{' '}
              {selectedProject ? `${selectedProject.code} · ${selectedProject.name}` : 'välj projekt'} · {hours || 'ange timmar'} h · {selectedActivity?.name || 'välj aktivitet'}
            </div>

            <Button type="submit" className="mobile-sticky-submit" isLoading={isSaving} variant={saved ? 'success' : 'primary'} disabledReason={disabledReason}>
              {saved ? <><Check className="h-5 w-5" /> Sparad!</> : <>{isEditMode ? <PencilLine className="h-5 w-5" /> : <Save className="h-5 w-5" />}{isEditMode ? 'Uppdatera tidrad' : 'Spara tidrad'}</>}
            </Button>
          </TaskSection>
        </fieldset></form>

        {!isEditMode && !!dailyEntries?.length && (
          <TaskSection title="Redan rapporterat den här dagen">
            <DataList>
              {dailyEntries.map((entry) => (
                <Link
                  key={entry.id}
                  to={`/time-entry?id=${entry.id}&return=${encodeURIComponent(defaultReturnUrl)}`}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
                >
                  <DataRow>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-graphite-950">
                        {entry.project?.code ? `${entry.project.code} · ${entry.project.name}` : 'Intern tid'}
                      </p>
                      <p className="text-xs font-medium text-graphite-500">
                        {entry.activity?.name}{entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-primary-800">{entry.hours} h</span>
                  </DataRow>
                </Link>
              ))}
            </DataList>
          </TaskSection>
        )}
      </div>
    </AppShell>
  );
}
