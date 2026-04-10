import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  PencilLine,
  Plus,
  Trash2,
  Unlock,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { timeEntriesApi, weekLocksApi } from '../services/api';
import { ApprovalSkeleton } from '../components/ui/Skeleton';
import type { WeekLock } from '../types';

export default function Approval() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: weekLocks, isLoading } = useQuery({
    queryKey: ['weekLocks'],
    queryFn: () => weekLocksApi.list(),
  });

  const expandedLock = weekLocks?.find((lock) => lock.id === expandedId);

  const { data: weekDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['weekDetails', expandedId],
    queryFn: () => {
      if (!expandedLock) return null;
      return timeEntriesApi.getWeek(format(new Date(expandedLock.weekStartDate), 'yyyy-MM-dd'), expandedLock.userId);
    },
    enabled: Boolean(expandedLock),
  });

  const invalidateApprovalData = () => {
    queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
    queryClient.invalidateQueries({ queryKey: ['weekDetails'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['team-week-summary'] });
    queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => weekLocksApi.approve(id),
    onSuccess: () => {
      toast.success('Vecka godkänd');
      invalidateApprovalData();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => weekLocksApi.reject(id, comment),
    onSuccess: () => {
      toast.success('Vecka nekad');
      setRejectingId(null);
      setRejectComment('');
      invalidateApprovalData();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => weekLocksApi.unlock(id),
    onSuccess: () => {
      toast.success('Vecka upplåst');
      invalidateApprovalData();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => timeEntriesApi.delete(id),
    onSuccess: () => {
      toast.success('Tidrad borttagen');
      invalidateApprovalData();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pendingLocks = weekLocks?.filter((lock) => lock.status === 'SUBMITTED') || [];
  const processedLocks = weekLocks?.filter((lock) => lock.status !== 'SUBMITTED') || [];

  const getWeekDate = (lock: WeekLock) => format(new Date(lock.weekStartDate), 'yyyy-MM-dd');

  const toggleLock = (id: string) => {
    setRejectingId(null);
    setRejectComment('');
    setExpandedId((current) => (current === id ? null : id));
  };

  const deleteEntry = (entryId: string) => {
    if (!window.confirm('Ta bort tidraden?')) return;
    deleteEntryMutation.mutate(entryId);
  };

  const renderStatus = (status: WeekLock['status']) => {
    if (status === 'APPROVED') return <span className="badge-green">Godkänd</span>;
    if (status === 'REJECTED') return <span className="badge-red">Nekad</span>;
    return <span className="badge-blue">Inskickad</span>;
  };

  const renderWeekDetails = (lock: WeekLock, showApprovalActions: boolean) => (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Tidrader</p>
          <p className="text-sm text-slate-500">Rätta datum, projekt, timmar eller ta bort felaktiga rader.</p>
        </div>
        <Link
          to={`/time-entry?date=${getWeekDate(lock)}&userId=${lock.userId}&return=/approval`}
          className="btn-secondary inline-flex"
        >
          <Plus className="h-4 w-4" />
          Lägg till tid
        </Link>
      </div>

      {isLoadingDetails ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          {!weekDetails?.entries?.length ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Inga tidrader för veckan.</p>
          ) : (
            weekDetails.entries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {format(new Date(entry.date), 'EEE d/M', { locale: sv })}
                    </span>
                    <span className={entry.billable ? 'badge-green' : 'badge-gray'}>
                      {entry.billable ? 'Fakturerbar' : 'Ej fakturerbar'}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-semibold text-slate-900">{entry.project?.name || 'Intern'}</p>
                  <p className="text-sm text-slate-500">{entry.activity?.name || 'Aktivitet saknas'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-2 font-semibold text-slate-900">{entry.hours.toFixed(1)} h</span>
                  <Link to={`/time-entry?id=${entry.id}&return=/approval`} className="btn-secondary inline-flex">
                    <PencilLine className="h-4 w-4" />
                    Ändra
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteEntry(entry.id)}
                    disabled={deleteEntryMutation.isPending}
                    className="btn-danger inline-flex"
                  >
                    <Trash2 className="h-4 w-4" />
                    Ta bort
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showApprovalActions && (
        rejectingId === lock.id ? (
          <div className="space-y-3">
            <textarea
              value={rejectComment}
              onChange={(event) => setRejectComment(event.target.value)}
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
                onClick={() => rejectMutation.mutate({ id: lock.id, comment: rejectComment })}
                disabled={!rejectComment || rejectMutation.isPending}
                className="btn-danger flex-1"
              >
                {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Neka'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setRejectingId(lock.id)} className="btn-secondary flex-1">
              <XCircle className="mr-2 h-4 w-4" />
              Neka
            </button>
            <button
              onClick={() => approveMutation.mutate(lock.id)}
              disabled={approveMutation.isPending}
              className="btn-success flex-1"
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Godkänn
                </>
              )}
            </button>
          </div>
        )
      )}
    </div>
  );

  const renderLockCard = (lock: WeekLock, showApprovalActions: boolean) => (
    <div key={lock.id} className="card">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => toggleLock(lock.id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{lock.user?.name}</p>
            <p className="text-sm text-slate-500">
              Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })} (
              {format(new Date(lock.weekStartDate), 'd/M')} - {format(addDays(new Date(lock.weekStartDate), 6), 'd/M')})
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="font-bold text-slate-900">{lock.totalHours?.toFixed(1) || '0.0'} h</p>
              <p className="text-xs text-slate-500">{lock.billableHours?.toFixed(1) || '0.0'} h fakt.</p>
            </div>
            {expandedId === lock.id ? (
              <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
            )}
          </div>
        </button>

        {!showApprovalActions && (
          <div className="flex items-center gap-2">
            {renderStatus(lock.status)}
            <button
              onClick={() => unlockMutation.mutate(lock.id)}
              disabled={unlockMutation.isPending}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Lås upp"
            >
              <Unlock className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {expandedId === lock.id && renderWeekDetails(lock, showApprovalActions)}
    </div>
  );

  if (isLoading) {
    return <ApprovalSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Attestera</h1>
        <p className="mt-2 text-sm text-slate-500">
          Öppna en vecka för att rätta, ta bort eller lägga till tid innan du godkänner.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Väntande ({pendingLocks.length})</h2>
        {pendingLocks.length === 0 ? (
          <div className="card py-8 text-center text-slate-500">Inga veckor att attestera</div>
        ) : (
          <div className="space-y-3">{pendingLocks.map((lock) => renderLockCard(lock, true))}</div>
        )}
      </div>

      {processedLocks.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">Historik</h2>
          <div className="space-y-2">{processedLocks.slice(0, 20).map((lock) => renderLockCard(lock, false))}</div>
        </div>
      )}
    </div>
  );
}
