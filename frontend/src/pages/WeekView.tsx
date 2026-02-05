import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { timeEntriesApi, weekLocksApi } from '../services/api';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { WeekViewSkeleton } from '../components/ui/Skeleton';
import { useHaptic } from '../hooks/useHaptic';

function SwipeableEntry({
  entry,
  onDelete,
  isDeleting,
}: {
  entry: any;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-80, -40, 0], [1, 0.5, 0]);
  const { trigger: haptic } = useHaptic();

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -80) {
      haptic('medium');
      onDelete();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background */}
      <motion.div
        className="absolute inset-0 bg-red-500 flex items-center justify-end pr-4 rounded-lg"
        style={{ opacity: deleteOpacity }}
      >
        <Trash2 className="w-5 h-5 text-white" />
      </motion.div>

      {/* Swipeable content */}
      <motion.div
        drag={entry.status === 'DRAFT' ? 'x' : false}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg relative"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {entry.project?.name || 'Intern'}
            </span>
            {entry.billable ? (
              <span className="w-2 h-2 bg-green-500 rounded-full" title="Fakturerbar" />
            ) : (
              <span className="w-2 h-2 bg-gray-300 rounded-full" title="Ej fakturerbar" />
            )}
          </div>
          <p className="text-xs text-gray-500">
            {entry.activity?.name}
            {entry.note && ` - ${entry.note}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{entry.hours}h</span>
          {entry.status === 'DRAFT' && (
            <button
              onClick={() => {
                haptic('medium');
                onDelete();
              }}
              className="p-1 text-gray-400 hover:text-red-500"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {entry.status === 'APPROVED' && (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
          {entry.status === 'REJECTED' && (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
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

  const submitMutation = useMutation({
    mutationFn: () => weekLocksApi.submit(weekStartStr),
    onSuccess: () => {
      haptic('success');
      toast.success('Veckan skickad för attest!');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => {
      haptic('error');
      toast.error(error.message);
    },
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

  // Skapa veckostruktur
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getEntriesForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return data?.entries.filter(
      (entry) => format(new Date(entry.date), 'yyyy-MM-dd') === dateStr
    ) || [];
  };

  const isLocked = data?.weekLock && ['SUBMITTED', 'APPROVED'].includes(data.weekLock.status);
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
    }
  };

  if (isLoading) {
    return <WeekViewSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header med veckonavigering */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek('prev')}
          className="p-2 hover:bg-gray-100 rounded-lg active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h1 className="page-title">
            Vecka {format(weekStart, 'w', { locale: sv })}
          </h1>
          <p className="text-sm text-gray-500">
            {format(weekStart, 'd MMM', { locale: sv })} -{' '}
            {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}
          </p>
        </div>
        <button
          onClick={() => navigateWeek('next')}
          className="p-2 hover:bg-gray-100 rounded-lg active:scale-90 transition-transform"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Status och summering */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">Summering</span>
          {getStatusBadge()}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold">{data?.summary.totalHours.toFixed(1)}h</p>
            <p className="text-sm text-gray-500">Total tid</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {data?.summary.billableHours.toFixed(1)}h
            </p>
            <p className="text-sm text-gray-500">Fakturerbar</p>
          </div>
        </div>

        {isRejected && data?.weekLock?.comment && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800">Kommentar:</p>
            <p className="text-sm text-red-700">{data.weekLock.comment}</p>
          </div>
        )}
      </div>

      {/* Dagvy med staggered animation */}
      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {weekDays.map((day) => {
          const entries = getEntriesForDay(day);
          const dayTotal = entries.reduce((sum, e) => sum + e.hours, 0);
          const isToday = format(new Date(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <motion.div
              key={day.toISOString()}
              className={`card ${isToday ? 'border-2 border-primary-300' : ''} ${
                isWeekend ? 'bg-gray-50' : ''
              }`}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium">
                    {format(day, 'EEEE', { locale: sv })}
                  </span>
                  <span className="text-gray-500 ml-2">
                    {format(day, 'd/M')}
                  </span>
                </div>
                <span className="font-bold">{dayTotal.toFixed(1)}h</span>
              </div>

              {entries.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Ingen tid rapporterad</p>
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

      {/* Skicka för attest */}
      {data?.entries && data.entries.length > 0 && !isLocked && (
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="btn-primary w-full py-4"
        >
          {submitMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Send className="w-5 h-5" />
              Skicka vecka för attest
            </span>
          )}
        </button>
      )}

      {/* Lägg till tid */}
      {!isLocked && (
        <Link
          to="/time-entry"
          className="block text-center py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
        >
          + Lägg till tid
        </Link>
      )}
    </div>
  );
}
