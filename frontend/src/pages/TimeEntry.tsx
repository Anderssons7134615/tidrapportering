import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, activitiesApi, timeEntriesApi } from '../services/api';
import { useOfflineStore } from '../stores/offlineStore';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, Clock, Save, Loader2, Check, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useHaptic } from '../hooks/useHaptic';

export default function TimeEntry() {
  const queryClient = useQueryClient();
  const { isOnline, addPendingEntry } = useOfflineStore();
  const { trigger: haptic } = useHaptic();

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [projectId, setProjectId] = useState<string>('');
  const [activityId, setActivityId] = useState<string>('');
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
      <div>
        <h1 className="page-title">Rapportera tid</h1>
        <p className="text-sm text-gray-400">Snabb registrering på en sida</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              required
            />
            <p className="text-sm text-gray-400 mt-1">
              {format(new Date(date), 'EEEE d MMMM', { locale: sv })}
            </p>
          </div>

          <div>
            <label className="label">Projekt</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input"
            >
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Aktivitet</label>
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="input"
              required
            >
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
              <Clock className="w-4 h-4 text-gray-500" />
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
            <div className="flex gap-2 mt-2">
              {[2, 4, 6, 8].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h.toString())}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        </div>

        <details className="bg-gray-800 rounded-lg p-3">
          <summary className="cursor-pointer flex items-center justify-between font-medium text-gray-200 list-none">
            Fler val (valfritt)
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </summary>

          <div className="space-y-3 mt-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 text-primary-500 focus:ring-primary-500 bg-gray-900"
              />
              <span className="font-medium">Fakturerbar tid</span>
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
          className={`w-full py-4 rounded-xl font-semibold text-white transition-all active:scale-[0.97] ${
            saved
              ? 'bg-green-500'
              : 'bg-primary-500 hover:bg-primary-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:active:scale-100'
          }`}
        >
          {createMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : saved ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              Sparad!
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Save className="w-5 h-5" />
              Spara tidrad
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
