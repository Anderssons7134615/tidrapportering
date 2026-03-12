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
import type { TimeEntry } from '../types';

function SwipeableEntry({
  entry,
  onDelete,
  isDeleting,
}: {
  entry: TimeEntry;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-80, -40, 0], [1, 0.5, 0]);
  const { trigger: haptic } = useHaptic();
  const canModify = entry.status !== 'APPROVED';

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (canModify && info.offset.x < -80) {
      haptic('medium');
      onDelete();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        className="absolute inset-0 flex items-center justify-end rounded-lg bg-red-500 pr-4"
        style={{ opacity: deleteOpacity }}
      >
        <Trash2 className="h-5 w-5 text-white" />
      </motion.div>

      <motion.div
        drag={canModify ? 'x' : false}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative rounded-lg border border-slate-200 bg-white p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {entry.project?.code ? `${entry.project.code} • ${entry.project.name}` : 'Intern tid'}
              </span>
              {entry.billable ? (
                <span className="h-2 w-2 rounded-full bg-green-500" title="Fakturerbar" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-slate-400" title="Ej fakturerbar" />
              )}
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
                  to={`/time-entry?id=${entry.id}`}
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-primary-700"
                  title="Redigera"
                >
                  <PencilLine className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => {
                    haptic('medium');
                    onDelete();
                  }}
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-red-500"
                  disabled={isDeleting}
                  title="Ta bort"
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

  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(() => {
    if (dateParam) return new Date(dateParam);
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['week', weekStartStr],
    queryFn: () => timeEntriesApi.getWeek(weekStartStr),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timeEntriesApi.delete(id),
    onSuccess: () => {
      haptic('light');
      toast.success('Tidrad borttagen');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
    setSearchParams({ date: format(newDate, 'yyyy-MM-dd') });
  };

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const getEntriesForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return data?.entries.filter((entry) => format(new Date(entry.date), 'yyyy-MM-dd') === dateStr) || [];
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek('prev')}
          className="rounded-lg p-2 transition-transform hover:bg-slate-100 active:scale-90"
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
          className="rounded-lg p-2 transition-transform hover:bg-slate-100 active:scale-90"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">Summering</span>
          {getStatusBadge()}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold">{data?.summary.totalHours.toFixed(1)}h</p>
            <p className="text-sm text-slate-500">Total tid</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{data?.summary.billableHours.toFixed(1)}h</p>
            <p className="text-sm text-slate-500">Fakturerbar</p>
          </div>
        </div>

        {isRejected && data?.weekLock?.comment && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Kommentar:</p>
            <p className="text-sm text-red-600">{data.weekLock.comment}</p>
          </div>
        )}
      </div>

      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {weekDays.map((day) => {
          const entries = getEntriesForDay(day);
          const dayTotal = entries.reduce((sum, entry) => sum + entry.hours, 0);
          const isToday = format(new Date(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <motion.div
              key={day.toISOString()}
              className={`card ${isToday ? 'border-2 border-primary-700' : ''} ${isWeekend ? 'bg-slate-50' : ''}`}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">{format(day, 'EEEE', { locale: sv })}</span>
                  <span className="ml-2 text-slate-500">{format(day, 'd/M')}</span>
                </div>
                <span className="font-bold">{dayTotal.toFixed(1)}h</span>
              </div>

              {entries.length === 0 ? (
                <p className="text-sm italic text-slate-500">Ingen tid rapporterad</p>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {entries.map((entry) => (
                      <motion.div key={entry.id} exit={{ opacity: 0, x: -200, height: 0 }} transition={{ duration: 0.2 }}>
                        <SwipeableEntry
                          entry={entry}
                          onDelete={() => deleteMutation.mutate(entry.id)}
                          isDeleting={deleteMutation.isPending}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {!isLocked && (
        <Link
          to="/time-entry"
          className="block rounded-xl border-2 border-dashed border-slate-300 py-3 text-center text-slate-500 transition-colors hover:border-primary-600 hover:text-primary-700"
        >
          + Lägg till tid
        </Link>
      )}
    </div>
  );
}
