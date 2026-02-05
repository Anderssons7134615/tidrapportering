import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { weekLocksApi, timeEntriesApi } from '../services/api';
import { format, addDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  CheckCircle,
  XCircle,
  Unlock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ApprovalSkeleton } from '../components/ui/Skeleton';

export default function Approval() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: weekLocks, isLoading } = useQuery({
    queryKey: ['weekLocks'],
    queryFn: () => weekLocksApi.list(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => weekLocksApi.approve(id),
    onSuccess: () => {
      toast.success('Vecka godkänd!');
      queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      weekLocksApi.reject(id, comment),
    onSuccess: () => {
      toast.success('Vecka nekad');
      setRejectingId(null);
      setRejectComment('');
      queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => weekLocksApi.unlock(id),
    onSuccess: () => {
      toast.success('Vecka upplåst');
      queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Hämta detaljer för expanderad vecka
  const { data: weekDetails } = useQuery({
    queryKey: ['weekDetails', expandedId],
    queryFn: () => {
      const lock = weekLocks?.find((l) => l.id === expandedId);
      if (!lock) return null;
      return timeEntriesApi.getWeek(
        format(new Date(lock.weekStartDate), 'yyyy-MM-dd'),
        lock.userId
      );
    },
    enabled: !!expandedId,
  });

  const pendingLocks = weekLocks?.filter((l) => l.status === 'SUBMITTED') || [];
  const processedLocks = weekLocks?.filter((l) => l.status !== 'SUBMITTED') || [];

  if (isLoading) {
    return <ApprovalSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Attestera</h1>

      {/* Väntande */}
      <div>
        <h2 className="font-semibold mb-3">
          Väntande ({pendingLocks.length})
        </h2>
        {pendingLocks.length === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            Inga veckor att attestera
          </div>
        ) : (
          <div className="space-y-3">
            {pendingLocks.map((lock) => (
              <div key={lock.id} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(expandedId === lock.id ? null : lock.id)}
                >
                  <div>
                    <p className="font-medium">{lock.user?.name}</p>
                    <p className="text-sm text-gray-500">
                      Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })} (
                      {format(new Date(lock.weekStartDate), 'd/M')} -{' '}
                      {format(addDays(new Date(lock.weekStartDate), 6), 'd/M')})
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold">{lock.totalHours?.toFixed(1)}h</p>
                      <p className="text-xs text-gray-500">
                        {lock.billableHours?.toFixed(1)}h fakt.
                      </p>
                    </div>
                    {expandedId === lock.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanderad vy */}
                {expandedId === lock.id && (
                  <div className="mt-4 pt-4 border-t">
                    {/* Tidrader */}
                    {weekDetails?.entries && (
                      <div className="space-y-2 mb-4">
                        {weekDetails.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                          >
                            <div>
                              <span className="font-medium">
                                {format(new Date(entry.date), 'EEE d/M', { locale: sv })}
                              </span>
                              <span className="mx-2">·</span>
                              <span>{entry.project?.name || 'Intern'}</span>
                              <span className="mx-2">·</span>
                              <span className="text-gray-500">{entry.activity?.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{entry.hours}h</span>
                              {entry.billable && (
                                <span className="w-2 h-2 bg-green-500 rounded-full" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Neka-formulär */}
                    {rejectingId === lock.id ? (
                      <div className="space-y-3">
                        <textarea
                          value={rejectComment}
                          onChange={(e) => setRejectComment(e.target.value)}
                          placeholder="Ange anledning till nekande..."
                          className="input"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setRejectingId(null);
                              setRejectComment('');
                            }}
                            className="btn-secondary flex-1"
                          >
                            Avbryt
                          </button>
                          <button
                            onClick={() =>
                              rejectMutation.mutate({ id: lock.id, comment: rejectComment })
                            }
                            disabled={!rejectComment || rejectMutation.isPending}
                            className="btn-danger flex-1"
                          >
                            {rejectMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Neka'
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRejectingId(lock.id)}
                          className="btn-secondary flex-1"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Neka
                        </button>
                        <button
                          onClick={() => approveMutation.mutate(lock.id)}
                          disabled={approveMutation.isPending}
                          className="btn-success flex-1"
                        >
                          {approveMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Godkänn
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historik */}
      {processedLocks.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Historik</h2>
          <div className="space-y-2">
            {processedLocks.slice(0, 20).map((lock) => (
              <div
                key={lock.id}
                className="card flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">{lock.user?.name}</p>
                  <p className="text-sm text-gray-500">
                    Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {lock.status === 'APPROVED' ? (
                    <span className="badge-green">Godkänd</span>
                  ) : (
                    <span className="badge-red">Nekad</span>
                  )}
                  <button
                    onClick={() => unlockMutation.mutate(lock.id)}
                    disabled={unlockMutation.isPending}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="Lås upp"
                  >
                    <Unlock className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
