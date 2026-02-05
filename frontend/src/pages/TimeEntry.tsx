import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, activitiesApi, timeEntriesApi } from '../services/api';
import { useOfflineStore } from '../stores/offlineStore';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Calendar,
  FolderKanban,
  Tags,
  Clock,
  FileText,
  MapPin,
  Save,
  Loader2,
  Check,
} from 'lucide-react';
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
  const [useGps, setUseGps] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => projectsApi.list({ active: true }),
  });

  const { data: activities } = useQuery({
    queryKey: ['activities', 'active'],
    queryFn: () => activitiesApi.list(true),
  });

  // Uppdatera billable baserat på vald aktivitet
  useEffect(() => {
    if (activityId && activities) {
      const activity = activities.find((a) => a.id === activityId);
      if (activity) {
        setBillable(activity.billableDefault);
      }
    }
  }, [activityId, activities]);

  // Hämta GPS-position
  useEffect(() => {
    if (useGps && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsPosition({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('GPS error:', error);
          toast.error('Kunde inte hämta GPS-position');
          setUseGps(false);
        }
      );
    } else {
      setGpsPosition(null);
    }
  }, [useGps]);

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
      // Rensa formulär
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
      gpsLat: gpsPosition?.lat,
      gpsLng: gpsPosition?.lng,
    };

    if (isOnline) {
      createMutation.mutate(entryData);
    } else {
      // Spara offline
      addPendingEntry(entryData);
      haptic('success');
      toast.success('Sparad offline - synkas när du är online');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setHours('');
      setNote('');
    }
  };

  // Gruppera aktiviteter per kategori
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
      <h1 className="page-title">Rapportera tid</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Datum */}
        <div className="card">
          <label className="label flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            Datum
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(date), 'EEEE d MMMM', { locale: sv })}
          </p>
        </div>

        {/* Projekt */}
        <div className="card">
          <label className="label flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-gray-400" />
            Projekt
          </label>
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

        {/* Aktivitet */}
        <div className="card">
          <label className="label flex items-center gap-2">
            <Tags className="w-4 h-4 text-gray-400" />
            Aktivitet
          </label>
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

        {/* Timmar */}
        <div className="card">
          <label className="label flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Antal timmar
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="input flex-1"
              placeholder="0.0"
              min="0"
              max="24"
              step="0.25"
              required
            />
            {/* Snabbknappar */}
            <div className="flex gap-1">
              {[4, 6, 8].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h.toString())}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fakturerbar */}
        <div className="card">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="font-medium">Fakturerbar tid</span>
          </label>
        </div>

        {/* Notering */}
        <div className="card">
          <label className="label flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            Notering
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            rows={2}
            placeholder="Valfri beskrivning..."
          />
        </div>

        {/* GPS */}
        <div className="card">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useGps}
              onChange={(e) => setUseGps(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="font-medium">Bifoga GPS-position</span>
          </label>
          {gpsPosition && (
            <p className="text-sm text-gray-500 mt-2">
              Position: {gpsPosition.lat.toFixed(6)}, {gpsPosition.lng.toFixed(6)}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={createMutation.isPending || !activityId || !hours}
          className={`w-full py-4 rounded-xl font-semibold text-white transition-all active:scale-[0.97] ${
            saved
              ? 'bg-green-500'
              : 'bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:active:scale-100'
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
