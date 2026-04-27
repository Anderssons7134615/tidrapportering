import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Check, ChevronDown, Loader2, PencilLine, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { activitiesApi, projectsApi, timeEntriesApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useHaptic } from '../hooks/useHaptic';
import { Button, FormField } from '../components/ui/design';
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
    return <div className="card flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>;
  }

  if (isEditMode && existingEntry && !canEditEntry) {
    return <div className="card text-sm text-slate-600">Godkända tidrader kan inte ändras.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">{isEditMode ? 'Redigera tidrad' : 'Rapportera tid'}</h1>
        <p className="mt-1 text-sm text-slate-500">Välj projekt, aktivitet och antal timmar. Start- och sluttid finns under fler val.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {!isEditMode && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-sm font-semibold text-slate-700">Snabbval</span>
            <button type="button" onClick={copyYesterday} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Kopiera gårdagen
            </button>
            {recentProjects?.map((project) => (
              <button key={project.id} type="button" onClick={() => setProjectId(project.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {project.code}
              </button>
            ))}
          </div>
        )}

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
            <p className="mt-1 text-xs text-slate-500">{format(new Date(date), 'EEEE d MMMM', { locale: sv })}</p>
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
          <div className="flex gap-3">
            <input className="input text-lg font-semibold" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="7,5" />
            <button type="button" className="btn-secondary shrink-0" onClick={() => adjustHours(-0.5)}>-0,5 h</button>
            <button type="button" className="btn-secondary shrink-0" onClick={() => adjustHours(0.5)}>+0,5 h</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[2, 4, 6, 8].map((preset) => (
              <button key={preset} type="button" onClick={() => setHours(String(preset))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{preset} h</button>
            ))}
          </div>
        </FormField>

        <FormField label="Kommentar">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} className="input" rows={2} placeholder="Kort kommentar, valfritt" />
        </FormField>

        <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-700">
            Fler val
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="Starttid"><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="input" /></FormField>
            <FormField label="Sluttid"><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="input" /></FormField>
            <label className="flex items-center gap-3 rounded-lg p-1 text-slate-800 md:col-span-2">
              <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
              <span className="text-sm font-medium">Fakturerbar tid</span>
            </label>
          </div>
        </details>

        <Button type="submit" isLoading={isSaving} variant={saved ? 'success' : 'primary'} disabledReason={disabledReason}>
          {saved ? <><Check className="h-5 w-5" /> Sparad!</> : <>{isEditMode ? <PencilLine className="h-5 w-5" /> : <Save className="h-5 w-5" />}{isEditMode ? 'Uppdatera tidrad' : 'Spara tidrad'}</>}
        </Button>
      </form>
    </div>
  );
}
