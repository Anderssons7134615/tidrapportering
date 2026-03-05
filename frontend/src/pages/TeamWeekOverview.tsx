import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { timeEntriesApi } from '../services/api';

export default function TeamWeekOverview() {
  const [selectedDate, setSelectedDate] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['team-week-summary', weekStartStr],
    queryFn: () => timeEntriesApi.getTeamWeekSummary(weekStartStr),
  });

  const navigateWeek = (dir: 'prev' | 'next') => {
    setSelectedDate((d) => (dir === 'prev' ? subWeeks(d, 1) : addWeeks(d, 1)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigateWeek('prev')} className="p-2 hover:bg-slate-100 rounded-lg">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="page-title">Team – Veckoöversikt</h1>
          <p className="text-sm text-slate-500">
            Vecka {format(weekStart, 'w', { locale: sv })} · {format(weekStart, 'd MMM', { locale: sv })}
          </p>
        </div>
        <button onClick={() => navigateWeek('next')} className="p-2 hover:bg-slate-100 rounded-lg">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-5 w-5 text-primary-700" />
          <h2 className="section-title">Alla anställdas timmar</h2>
        </div>

        {isLoading ? (
          <p className="text-slate-500">Laddar...</p>
        ) : !data?.users?.length ? (
          <p className="text-slate-500">Ingen data för vald vecka.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Totala timmar</p>
                <p className="text-lg font-semibold">{data.totals.totalHours.toFixed(1)} h</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Fakturerbara</p>
                <p className="text-lg font-semibold">{data.totals.billableHours.toFixed(1)} h</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Antal personer</p>
                <p className="text-lg font-semibold">{data.users.length}</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Snitt / person</p>
                <p className="text-lg font-semibold">{(data.totals.totalHours / Math.max(data.users.length, 1)).toFixed(1)} h</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Anställd</th>
                    <th className="px-3 py-2">Timmar</th>
                    <th className="px-3 py-2">Fakturerbara</th>
                    <th className="px-3 py-2">Rader</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.userId} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 font-medium text-slate-900">{u.userName}</td>
                      <td className="px-3 py-2">{u.totalHours.toFixed(1)} h</td>
                      <td className="px-3 py-2">{u.billableHours.toFixed(1)} h</td>
                      <td className="px-3 py-2">{u.entryCount}</td>
                      <td className="px-3 py-2">{u.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
