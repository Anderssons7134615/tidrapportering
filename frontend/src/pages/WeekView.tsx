import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AnimatePresence, motion, PanInfo, useMotionValue, useTransform } from 'framer-motion';
import { CheckCircle, ChevronLeft, ChevronRight, PencilLine, Trash2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeEntriesApi } from '../services/api';
import { WeekViewSkeleton } from '../components/ui/Skeleton';
import { useHaptic } from '../hooks/useHaptic';
import { useOfflineStore } from '../stores/offlineStore';
import type { TimeEntry } from '../types';
import { AppShell, ConfirmDialog } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { parseDateOnlyLocal, toDateInputValue } from '../utils/format';

function SwipeableEntry({
  entry,
  onDelete,
  isDeleting,
  editUrl,
  canDelete,
}: {
  entry: TimeEntry;
  onDelete: () => void;
  isDeleting: boolean;
  editUrl: string;
  canDelete: boolean;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-80, -40, 0], [1, 0.5, 0]);
  const { trigger: haptic } = useHaptic();
  const canModify = entry.status !== 'APPROVED' && canDelete;
  const [revealed, setRevealed] = useState(false);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (canModify && info.offset.x < -40) {
      haptic('medium');
      setRevealed(true);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        className="absolute inset-0 flex items-center justify-end rounded-lg bg-red-500 pr-2"
        style={{ opacity: deleteOpacity }}
      >
        <button type="button" onClick={onDelete} className="btn-danger min-h-11 px-3" disabled={isDeleting}>
          <Trash2 className="h-4 w-4" />
          Ta bort
        </button>
      </motion.div>

      <motion.div
        drag={canModify && !revealed ? 'x' : false}
        animate={{ x: revealed ? -88 : 0 }}
        dragConstraints={{ left: -88, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative rounded-md border border-graphite-200 bg-white p-3"
        onClick={() => {
          if (revealed) setRevealed(false);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {entry.project?.code ? `${entry.project.code} • ${entry.project.name}` : 'Intern tid'}
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {entry.activity?.name}
              {entry.project?.site ? ` • ${entry.project.site}` : ''}
            </p>

            {(entry.startTime || entry.endTime || entry.note) && (
              <p className="mt-1 text-xs text-slate-500">
                {entry.startTime || entry.endTime ? `${entry.startTime || '--:--'}-${entry.endTime || '--:--'}` : ''}
                {entry.note ? `${entry.startTime || entry.endTime ? ' • ' : ''}${entry.note}` : ''}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="font-medium text-slate-900">{entry.hours}h</span>
            {canModify && (
              <>
                <Link
                  to={editUrl}
                  onClick={(event) => event.stopPropagation()}
                  className="icon-button min-h-11 min-w-11 border-0 p-1 text-graphite-600 hover:bg-primary-50 hover:text-primary-700"
                  title="Redigera"
                >
                  <PencilLine className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    haptic('medium');
                    onDelete();
                  }}
                  className="icon-button min-h-11 min-w-11 border-0 p-1 text-rose-700 hover:bg-rose-50"
                  disabled={isDeleting}
                  aria-label="Ta bort tidrad"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            {entry.status === 'APPROVED' && <CheckCircle className="h-4 w-4 text-green-500" />}
            {entry.status === 'REJECTED' && <XCircle className="h-4 w-4 text-red-500" />}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function WeekView() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { trigger: haptic } = useHaptic();
  const { isOnline } = useOfflineStore();
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

  const dateParam = searchParams.get('date');
  const userIdParam = searchParams.get('userId');
  const [selectedDate, setSelectedDate] = useState(() => {
    if (dateParam) return parseDateOnlyLocal(dateParam);
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['week', weekStartStr, userIdParam],
    queryFn: () => timeEntriesApi.getWeek(weekStartStr, userIdParam || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (entry: TimeEntry) => timeEntriesApi.delete(entry.id),
    onSuccess: () => {
      setPendingDelete(null);
      haptic('light');
      toast.success('Tidrad borttagen');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
      queryClient.invalidateQueries({ queryKey: ['team-week-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: Error) => {
      haptic('error');
      toast.error(error.message);
    },
  });

  const navigateWeek = (direction: 'prev' | 'next') => {
    haptic('light');
    const newDate = direction === 'prev' ? subWeeks(weekStart, 1) : addWeeks(weekStart, 1);
    setSelectedDate(newDate);
    const params = new URLSearchParams({ date: format(newDate, 'yyyy-MM-dd') });
    if (userIdParam) params.set('userId', userIdParam);
    setSearchParams(params);
  };

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const getDayReportUrl = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const returnParams = new URLSearchParams({ date: weekStartStr });
    const params = new URLSearchParams({ date: dateStr, return: `/week?${returnParams.toString()}` });
    if (userIdParam) {
      returnParams.set('userId', userIdParam);
      params.set('return', `/week?${returnParams.toString()}`);
      params.set('userId', userIdParam);
    }
    return `/time-entry?${params.toString()}`;
  };

  const getWeekReturnUrl = () => {
    const params = new URLSearchParams({ date: weekStartStr });
    if (userIdParam) params.set('userId', userIdParam);
    return `/week?${params.toString()}`;
  };

  const getEntryEditUrl = (entryId: string) => {
    const params = new URLSearchParams({ id: entryId, return: getWeekReturnUrl() });
    return `/time-entry?${params.toString()}`;
  };

  const getEntriesForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return data?.entries.filter((entry) => toDateInputValue(entry.date) === dateStr) || [];
  };

  const isLocked = data?.weekLock?.status === 'APPROVED';
  const isRejected = data?.weekLock?.status === 'REJECTED';

  const getStatusBadge = () => {
    if (!data?.weekLock) return null;

    switch (data.weekLock.status) {
      case 'SUBMITTED':
        return <span className="badge-yellow">Inskickad</span>;
      case 'APPROVED':
        return <span className="badge-green">Godkänd</span>;
      case 'REJECTED':
        return <span className="badge-red">Nekad</span>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return <WeekViewSkeleton />;
  }

  if (isError) {
    return (
      <AppShell>
        <QueryError title="Kunde inte hämta veckan" onRetry={() => void refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek('prev')}
          className="icon-button"
          aria-label="Föregående vecka"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="page-title">Vecka {format(weekStart, 'w', { locale: sv })}</h1>
          <p className="text-sm text-slate-500">
            {format(weekStart, 'd MMM', { locale: sv })} - {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}
          </p>
        </div>
        <button
          onClick={() => navigateWeek('next')}
          className="icon-button"
          aria-label="Nästa vecka"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <section className="review-summary">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">Summering</span>
          {getStatusBadge()}
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <p className="text-2xl font-bold">{data?.summary.totalHours.toFixed(1)}h</p>
            <p className="text-sm text-slate-500">Total tid</p>
          </div>
        </div>

        {isRejected && data?.weekLock?.comment && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Kommentar:</p>
            <p className="text-sm text-red-600">{data.weekLock.comment}</p>
          </div>
        )}
      </section>

      <div
        className="work-panel overflow-hidden divide-y divide-graphite-100"
      >
        {weekDays.map((day) => {
          const entries = getEntriesForDay(day);
          const dayTotal = entries.reduce((sum, entry) => sum + entry.hours, 0);
          const isToday = format(new Date(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const dayReportUrl = getDayReportUrl(day);

          return (
            <motion.div
              key={day.toISOString()}
              className={`px-3 py-4 ${isToday ? 'bg-primary-50/40 ring-1 ring-inset ring-primary-200' : ''} ${isWeekend ? 'bg-graphite-50' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">{format(day, 'EEEE', { locale: sv })}</span>
                  <span className="ml-2 text-slate-500">{format(day, 'd/M')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={dayReportUrl} className="inline-flex min-h-11 items-center text-xs font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">Rapportera</Link>
                  <span className="font-bold">{dayTotal.toFixed(1)}h</span>
                </div>
              </div>

              {entries.length === 0 ? (
                <p className="text-sm italic text-slate-500">Ingen tid rapporterad</p>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {entries.map((entry) => (
                      <motion.div
                        key={entry.id}
                        exit={{ opacity: 0, x: -200, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SwipeableEntry
                          entry={entry}
                          onDelete={() => setPendingDelete(entry)}
                          isDeleting={deleteMutation.isPending}
                          editUrl={getEntryEditUrl(entry.id)}
                          canDelete={isOnline}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {!isLocked && (
        <Link
          to={getDayReportUrl(weekStart)}
          className="block border-y border-dashed border-graphite-300 bg-white py-3 text-center font-semibold text-graphite-600 transition-colors hover:border-primary-600 hover:text-primary-700"
        >
          + Lägg till tid
        </Link>
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
        title="Ta bort tidrad?"
        description="Kontrollera att du har valt rätt tidrad. Borttagningen går inte att ångra."
        confirmLabel="Ta bort"
        isLoading={deleteMutation.isPending}
      />
    </AppShell>
  );
}
