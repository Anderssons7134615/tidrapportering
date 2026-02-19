import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workItemsApi, workLogsApi, projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { WorkLog } from '../types';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Wrench,
  Plus,
  Trash2,
  BarChart2,
  ListChecks,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../components/ui/Skeleton';

const HOURLY_RATE = 650; // kr/h för kostnadskalkyl

export default function Productivity() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const [view, setView] = useState<'log' | 'stats'>('log');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [workItemId, setWorkItemId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');

  const { data: workItems, isLoading: loadingItems } = useQuery({
    queryKey: ['work-items'],
    queryFn: () => workItemsApi.list(true),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => projectsApi.list({ active: true }),
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ['work-logs'],
    queryFn: () => workLogsApi.list(),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['work-logs-stats'],
    queryFn: () => workLogsApi.getStats(),
    enabled: view === 'stats',
  });

  const createMutation = useMutation({
    mutationFn: workLogsApi.create,
    onSuccess: () => {
      toast.success('Logg sparad!');
      setWorkItemId('');
      setProjectId('');
      setQuantity('');
      setMinutes('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['work-logs'] });
      queryClient.invalidateQueries({ queryKey: ['work-logs-stats'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: workLogsApi.delete,
    onSuccess: () => {
      toast.success('Logg borttagen');
      queryClient.invalidateQueries({ queryKey: ['work-logs'] });
      queryClient.invalidateQueries({ queryKey: ['work-logs-stats'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workItemId) {
      toast.error('Välj ett arbetsmoment');
      return;
    }
    createMutation.mutate({
      workItemId,
      projectId: projectId || undefined,
      date,
      quantity: parseFloat(quantity),
      minutes: parseInt(minutes),
      note: note || undefined,
    });
  };

  if (loadingItems || loadingLogs) {
    return <ListSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-900/30 rounded-lg">
            <Wrench className="w-5 h-5 text-primary-400" />
          </div>
          <h1 className="page-title">Produktivitet</h1>
        </div>
        {isAdmin && (
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => setView('log')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                view === 'log'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              Loggar
            </button>
            <button
              onClick={() => setView('stats')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                view === 'stats'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              Statistik
            </button>
          </div>
        )}
      </div>

      {view === 'log' && (
        <>
          {/* Log form */}
          <div className="card p-4 space-y-4">
            <h2 className="font-medium text-gray-200">Logga arbete</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Arbetsmoment *</label>
                  <select
                    value={workItemId}
                    onChange={(e) => setWorkItemId(e.target.value)}
                    className="input"
                    required
                  >
                    <option value="">Välj arbetsmoment...</option>
                    {workItems?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                  {workItems?.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Inga arbetsmoment – be admin skapa ett
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Projekt (valfritt)</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="input"
                  >
                    <option value="">Inget projekt</option>
                    {projects?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} – {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Datum *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">
                    Antal{workItemId && workItems
                      ? ` (${workItems.find((w) => w.id === workItemId)?.unit ?? ''})`
                      : ''} *
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="label">Minuter *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className="input"
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Anteckning</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input"
                  placeholder="Valfri anteckning..."
                />
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary w-full sm:w-auto"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Spara logg
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Log list */}
          <div>
            <h2 className="font-medium text-gray-400 mb-3">
              {isAdmin ? 'Alla loggar' : 'Mina loggar'}
            </h2>

            {!logs || logs.length === 0 ? (
              <div className="card p-8 text-center">
                <Wrench className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Inga loggar ännu</p>
                <p className="text-sm text-gray-600 mt-1">
                  Fyll i formuläret ovan för att logga ditt första arbete
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log: WorkLog) => (
                  <div key={log.id} className="card flex items-center justify-between py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {log.workItem?.name}
                        </span>
                        <span className="badge-gray text-xs">
                          {log.quantity} {log.workItem?.unit}
                        </span>
                        <span className="badge-gray text-xs">
                          {log.minutes} min
                        </span>
                        {log.project && (
                          <span className="badge-green text-xs">
                            {log.project.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                        <span>
                          {format(new Date(log.date), 'd MMM yyyy', { locale: sv })}
                        </span>
                        {log.user && isAdmin && (
                          <span>{log.user.name}</span>
                        )}
                        {log.note && <span className="truncate">{log.note}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Ta bort logg?')) {
                          deleteMutation.mutate(log.id);
                        }
                      }}
                      className="p-2 text-gray-500 hover:text-red-400 ml-2 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'stats' && isAdmin && (
        <div>
          <h2 className="font-medium text-gray-400 mb-3">Produktivitetsstatistik</h2>

          {loadingStats ? (
            <ListSkeleton />
          ) : !stats || stats.length === 0 ? (
            <div className="card p-8 text-center">
              <BarChart2 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Ingen statistik ännu</p>
              <p className="text-sm text-gray-600 mt-1">
                Logga arbeten för att se statistik här
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-3 text-gray-400 font-medium">Arbetsmoment</th>
                    <th className="text-right p-3 text-gray-400 font-medium">Enhet</th>
                    <th className="text-right p-3 text-gray-400 font-medium">Antal loggar</th>
                    <th className="text-right p-3 text-gray-400 font-medium">Tot. antal</th>
                    <th className="text-right p-3 text-gray-400 font-medium">Snitt min/enhet</th>
                    <th className="text-right p-3 text-gray-400 font-medium">
                      Kr/enhet ({HOURLY_RATE} kr/h)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => {
                    const costPerUnit = (s.avgMinPerUnit / 60) * HOURLY_RATE;
                    return (
                      <tr key={s.workItemId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 text-right text-gray-400">{s.unit}</td>
                        <td className="p-3 text-right text-gray-400">{s.entryCount}</td>
                        <td className="p-3 text-right text-gray-400">
                          {s.totalQuantity % 1 === 0 ? s.totalQuantity : s.totalQuantity.toFixed(1)}
                        </td>
                        <td className="p-3 text-right text-primary-400">
                          {s.avgMinPerUnit.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {costPerUnit.toFixed(2)} kr
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
