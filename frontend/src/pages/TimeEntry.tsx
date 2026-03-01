import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, activitiesApi, timeEntriesApi, usersApi } from '../services/api';
import { useOfflineStore } from '../stores/offlineStore';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, Clock, Save, Loader2, Check, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useHaptic } from '../hooks/useHaptic';
import { useAuthStore } from '../stores/authStore';

export default function TimeEntry() {
  const queryClient = useQueryClient();
  const { isOnline, addPendingEntry } = useOfflineStore();
  const { trigger: haptic } = useHaptic();
  const { user } = useAuthStore();
  const canReportForOthers = ['ADMIN', 'SUPERVISOR'].includes(user?.role || '');

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [projectId, setProjectId] = useState<string>('');
  const [activityId, setActivityId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);
  const [saved, setSaved] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => projectsApi.list({ active: true }),
  });

  const { data: activities } = useQuery({
    queryKey: ['activities', 'active'],
    queryFn: () => activitiesApi.list(true),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: canReportForOthers,
  });

  useEffect(() => {
    if (activityId && activities) {
      const activity = activities.find((a) => a.id === activityId);
      if (activity) {
        setBillable(activity.billableDefault);
      }
    }
  }, [activityId, activities]);

  const createMutation = useMutation({
    mutationFn: (data: any) => timeEntriesApi.create(data),
    onSuccess: () => {
      haptic('success');
      toast.success('Tid sparad!');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['week'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setHours('');
      setNote('');
    },
    onError: (error: Error) => {
      haptic('error');
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    haptic('medium');

    const entryData = {
      date,
      projectId: projectId || undefined,
      activityId,
      userId: canReportForOthers ? (selectedUserId || undefined) : undefined,
      hours: parseFloat(hours),
      billable,
      note: note || undefined,
    };

    if (isOnline) {
      createMutation.mutate(entryData);
    } else {
      addPendingEntry(entryData);
      haptic('success');
      toast.success('Sparad offline - synkas när du är online');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setHours('');
      setNote('');
    }
  };

  const groupedActivities = activities?.reduce((acc, activity) => {
    const category = activity.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(activity);
    return acc;
  }, {} as Record<string, typeof activities>);

  const categoryLabels: Record<string, string> = {
    WORK: 'Arbete',
    TRAVEL: 'Resa',
    MEETING: 'Möte',
    INTERNAL: 'Internt',
    CHANGE_ORDER: 'ÄTA',
    ABSENCE: 'Frånvaro',
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Rapportera tid</h1>
        <p className="text-sm text-slate-500">Snabb registrering med tydliga val och minimalt klickande.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {canReportForOthers && (
            <div>
              <label className="label">Anställd</label>
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="input">
                <option value="">Jag själv</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              Datum
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
            <p className="mt-1.5 text-sm text-slate-500">{format(new Date(date), 'EEEE d MMMM', { locale: sv })}</p>
          </div>

          <div>
            <label className="label">Projekt</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
              <option value="">-- Intern tid --</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} - {project.name}
                  {project.customer && ` (${project.customer.name})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Aktivitet</label>
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className="input" required>
              <option value="">Välj aktivitet...</option>
              {groupedActivities &&
                Object.entries(groupedActivities).map(([category, acts]) => (
                  <optgroup key={category} label={categoryLabels[category] || category}>
                    {acts?.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          <div>
            <label className="label flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              Antal timmar
            </label>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="input"
              placeholder="0.0"
              min="0"
              max="24"
              step="0.25"
              required
            />
            <div className="mt-2 flex gap-2">
              {[2, 4, 6, 8].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h.toString())}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        </div>

        <details className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-700">
            Fler val (valfritt)
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </summary>

          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-3 rounded-lg p-1 text-slate-800">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium">Fakturerbar tid</span>
            </label>

            <div>
              <label className="label">Notering</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input"
                rows={2}
                placeholder="Valfri beskrivning..."
              />
            </div>
          </div>
        </details>

        <button
          type="submit"
          disabled={createMutation.isPending || !activityId || !hours}
          className={`w-full rounded-xl py-3.5 text-sm font-semibold text-white transition ${
            saved
              ? 'bg-emerald-500'
              : 'bg-primary-600 hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-300'
          }`}
        >
          {createMutation.isPending ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : saved ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="h-5 w-5" />
              Sparad!
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Save className="h-5 w-5" />
              Spara tidrad
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
