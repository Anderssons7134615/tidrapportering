import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CheckCircle, ChevronDown, Loader2, PencilLine, Plus, Trash2, Unlock, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeEntriesApi, weekLocksApi } from '../services/api';
import { ApprovalSkeleton } from '../components/ui/Skeleton';
import type { TimeEntry, WeekLock } from '../types';
import { AppShell, Card, DataTable, EmptyState, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
import { formatHours } from '../utils/format';

const weekdayLabels = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

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
  const pendingHours = pendingLocks.reduce((sum, lock) => sum + (lock.totalHours || 0), 0);
  const pendingBillable = pendingLocks.reduce((sum, lock) => sum + (lock.billableHours || 0), 0);

  const rows = useMemo(() => {
    return pendingLocks.map((lock) => {
      const weekStart = new Date(lock.weekStartDate);
      const details = expandedId === lock.id ? weekDetails?.entries || [] : [];
      const dayHours = Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index);
        const key = format(day, 'yyyy-MM-dd');
        const entries = details.filter((entry) => format(new Date(entry.date), 'yyyy-MM-dd') === key);
        return {
          date: day,
          hours: entries.reduce((sum, entry) => sum + entry.hours, 0),
          entries,
        };
      });
      return { lock, weekStart, dayHours, deviations: getLockDeviations(lock, details, Boolean(expandedId === lock.id && weekDetails)) };
    });
  }, [pendingLocks, expandedId, weekDetails]);

  const toggleLock = (id: string) => {
    setRejectingId(null);
    setRejectComment('');
    setExpandedId((current) => (current === id ? null : id));
  };

  if (isLoading) return <ApprovalSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title="Attestering"
        description="Granska veckor per anställd, hitta avvikelser och godkänn när allt stämmer."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Väntande veckor" value={pendingLocks.length} tone={pendingLocks.length ? 'yellow' : 'green'} />
        <KpiCard label="Timmar att attestera" value={formatHours(pendingHours)} tone="blue" />
        <KpiCard label="Fakturerbara timmar" value={formatHours(pendingBillable)} tone="green" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Veckovy</h2>
            <p className="text-sm text-slate-500">Klicka på en rad för att se tidrader och rätta detaljer.</p>
          </div>
          <StatusBadge label={`${pendingLocks.length} väntar`} tone={pendingLocks.length ? 'yellow' : 'green'} />
        </div>

        {!pendingLocks.length ? (
          <EmptyState title="Inga veckor att attestera" description="När medarbetare rapporterar tid dyker veckorna upp här." />
        ) : (
          <DataTable>
            <table className="min-w-[960px] w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Anställd</th>
                  <th className="px-3 py-2">Vecka</th>
                  {weekdayLabels.map((day) => <th key={day} className="px-3 py-2 text-center">{day}</th>)}
                  <th className="px-3 py-2 text-right">Totalt</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Avvikelser</th>
                  <th className="px-3 py-2 text-right">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ lock, weekStart, dayHours, deviations }) => (
                  <>
                    <tr key={lock.id} className="border-b border-slate-100 align-middle hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => toggleLock(lock.id)} className="flex items-center gap-2 font-semibold text-slate-900">
                          <ChevronDown className={`h-4 w-4 transition ${expandedId === lock.id ? 'rotate-180' : ''}`} />
                          {lock.user?.name}
                        </button>
                        <p className="text-xs text-slate-500">{lock.user?.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">v{format(weekStart, 'w', { locale: sv })}</p>
                        <p className="text-xs text-slate-500">{format(weekStart, 'd/M')} - {format(addDays(weekStart, 6), 'd/M')}</p>
                      </td>
                      {dayHours.map((day) => (
                        <td key={day.date.toISOString()} className="px-2 py-3 text-center">
                          <div className={`rounded-lg border px-2 py-1.5 ${day.hours > 10 ? 'border-rose-200 bg-rose-50 text-rose-700' : day.hours === 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-900'}`}>
                            <p className="font-semibold">{formatHours(day.hours)}</p>
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatHours(lock.totalHours)}</td>
                      <td className="px-3 py-3"><StatusBadge label="Väntar" tone="yellow" /></td>
                      <td className="px-3 py-3">
                        {deviations.length ? (
                          <div className="flex flex-wrap gap-1">
                            {deviations.slice(0, 2).map((deviation) => <StatusBadge key={deviation} label={deviation} tone="red" />)}
                          </div>
                        ) : (
                          <StatusBadge label="OK" tone="green" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button onClick={() => approveMutation.mutate(lock.id)} disabled={approveMutation.isPending} className="btn-success">
                          <CheckCircle className="h-4 w-4" />
                          Godkänn
                        </button>
                      </td>
                    </tr>
                    {expandedId === lock.id && (
                      <tr className="border-b border-slate-200 bg-slate-50/70">
                        <td colSpan={13} className="px-3 py-4">
                          {renderWeekDetails({
                            lock,
                            entries: weekDetails?.entries || [],
                            isLoading: isLoadingDetails,
                            rejectingId,
                            rejectComment,
                            setRejectComment,
                            setRejectingId,
                            rejectMutation,
                            deleteEntryMutation,
                          })}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </Card>

      {processedLocks.length > 0 && (
        <Card>
          <h2 className="section-title mb-3">Senaste historik</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {processedLocks.slice(0, 12).map((lock) => (
              <div key={lock.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{lock.user?.name}</p>
                    <p className="text-sm text-slate-500">Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })} · {formatHours(lock.totalHours)}</p>
                  </div>
                  <StatusBadge label={lock.status === 'APPROVED' ? 'Godkänd' : 'Nekad'} tone={lock.status === 'APPROVED' ? 'green' : 'red'} />
                </div>
                <button onClick={() => unlockMutation.mutate(lock.id)} disabled={unlockMutation.isPending} className="mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white">
                  <Unlock className="h-4 w-4" />
                  Lås upp
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function renderWeekDetails({
  lock,
  entries,
  isLoading,
  rejectingId,
  rejectComment,
  setRejectComment,
  setRejectingId,
  rejectMutation,
  deleteEntryMutation,
}: {
  lock: WeekLock;
  entries: TimeEntry[];
  isLoading: boolean;
  rejectingId: string | null;
  rejectComment: string;
  setRejectComment: (value: string) => void;
  setRejectingId: (value: string | null) => void;
  rejectMutation: any;
  deleteEntryMutation: any;
}) {
  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">Tidrader för {lock.user?.name}</p>
          <p className="text-sm text-slate-500">Rätta datum, projekt, timmar eller ta bort felaktiga rader.</p>
        </div>
        <Link to={`/time-entry?date=${format(new Date(lock.weekStartDate), 'yyyy-MM-dd')}&userId=${lock.userId}&return=/approval`} className="btn-secondary inline-flex">
          <Plus className="h-4 w-4" />
          Lägg till tid
        </Link>
      </div>

      {!entries.length ? (
        <EmptyState title="Inga tidrader för veckan" />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{format(new Date(entry.date), 'EEE d/M', { locale: sv })}</span>
                  <StatusBadge label={entry.billable ? 'Fakturerbar' : 'Ej fakturerbar'} tone={entry.billable ? 'green' : 'gray'} />
                  {!entry.projectId && <StatusBadge label="Saknar projekt" tone="yellow" />}
                  {!entry.activityId && <StatusBadge label="Saknar aktivitet" tone="red" />}
                </div>
                <p className="mt-1 truncate font-semibold text-slate-900">{entry.project?.name || 'Intern tid'}</p>
                <p className="text-sm text-slate-500">{entry.activity?.name || 'Aktivitet saknas'} · {entry.note || 'Ingen kommentar'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 font-semibold text-slate-900">{formatHours(entry.hours)}</span>
                <Link to={`/time-entry?id=${entry.id}&return=/approval`} className="btn-secondary inline-flex">
                  <PencilLine className="h-4 w-4" />
                  Ändra
                </Link>
                <button type="button" onClick={() => window.confirm('Ta bort tidraden?') && deleteEntryMutation.mutate(entry.id)} disabled={deleteEntryMutation.isPending} className="btn-danger inline-flex">
                  <Trash2 className="h-4 w-4" />
                  Ta bort
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectingId === lock.id ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <textarea value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} placeholder="Ange anledning till nekande..." className="input" rows={2} />
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setRejectingId(null); setRejectComment(''); }} className="btn-secondary flex-1">Avbryt</button>
            <button onClick={() => rejectMutation.mutate({ id: lock.id, comment: rejectComment })} disabled={!rejectComment || rejectMutation.isPending} className="btn-danger flex-1">
              <XCircle className="h-4 w-4" />
              Neka vecka
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setRejectingId(lock.id)} className="btn-secondary">
          <XCircle className="h-4 w-4" />
          Neka eller skicka tillbaka
        </button>
      )}
    </div>
  );
}

function getLockDeviations(lock: WeekLock, entries: TimeEntry[], hasDetails: boolean) {
  const deviations: string[] = [];
  if ((lock.totalHours || 0) === 0) deviations.push('Saknar tid');
  if ((lock.totalHours || 0) > 50) deviations.push('Hög vecka');
  if (!hasDetails) return deviations;

  const dayTotals = new Map<string, number>();
  entries.forEach((entry) => {
    const key = format(new Date(entry.date), 'yyyy-MM-dd');
    dayTotals.set(key, (dayTotals.get(key) || 0) + entry.hours);
    if (!entry.activityId) deviations.push('Saknar aktivitet');
    if (!entry.projectId) deviations.push('Saknar projekt');
  });
  if (Array.from(dayTotals.values()).some((hours) => hours > 10)) deviations.push('Över 10 h/dag');
  if (Array.from(new Set(deviations)).length !== deviations.length) return Array.from(new Set(deviations));
  return deviations;
}
