import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { timeEntriesApi } from '../services/api';

const statusLabel: Record<string, string> = {
  DRAFT: 'Utkast',
  SUBMITTED: 'Inskickad',
  APPROVED: 'Godkänd',
  REJECTED: 'Nekad',
};

export default function TeamWeekOverview() {
  const [selectedDate, setSelectedDate] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['team-week-summary', weekStartStr],
    queryFn: () => timeEntriesApi.getTeamWeekSummary(weekStartStr),
  });

  const navigateWeek = (dir: 'prev' | 'next') => {
    setSelectedDate((d) => (dir === 'prev' ? subWeeks(d, 1) : addWeeks(d, 1)));
  };

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];

    const q = search.trim().toLowerCase();
    if (!q) return data.users;

    return data.users.filter((u) => {
      const userMatch = u.userName.toLowerCase().includes(q);
      const projects = u.projects || [];
      const projectMatch = projects.some((p) =>
        `${p.projectCode} ${p.projectName}`.toLowerCase().includes(q)
      );
      return userMatch || projectMatch;
    });
  }, [data?.users, search]);

  const visibleTotals = useMemo(() => ({
    totalHours: filteredUsers.reduce((sum, u) => sum + u.totalHours, 0),
    billableHours: filteredUsers.reduce((sum, u) => sum + u.billableHours, 0),
    entryCount: filteredUsers.reduce((sum, u) => sum + u.entryCount, 0),
  }), [filteredUsers]);

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
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

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-700" />
            <h2 className="section-title">Alla anställdas timmar</h2>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök anställd eller projekt..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-slate-500">Laddar...</p>
        ) : !data?.users?.length ? (
          <p className="text-slate-500">Ingen data för vald vecka.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Totala timmar</p>
                <p className="text-lg font-semibold">{visibleTotals.totalHours.toFixed(1)} h</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Fakturerbara</p>
                <p className="text-lg font-semibold">{visibleTotals.billableHours.toFixed(1)} h</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Antal personer</p>
                <p className="text-lg font-semibold">{filteredUsers.length}</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-xs text-slate-500">Tidrader</p>
                <p className="text-lg font-semibold">{visibleTotals.entryCount}</p>
              </div>
            </div>

            {!filteredUsers.length ? (
              <p className="text-sm text-slate-500">Ingen träff på sökningen.</p>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((u) => {
                  const isExpanded = !!expandedUsers[u.userId];
                  return (
                    <div key={u.userId} className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleUser(u.userId)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 text-left"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{u.userName}</p>
                          <p className="text-xs text-slate-500">{statusLabel[u.status] || u.status}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-slate-700">{u.totalHours.toFixed(1)} h</span>
                          <span className="text-slate-500">{u.billableHours.toFixed(1)} h fakt.</span>
                          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/40">
                          <div className="overflow-x-auto pt-3">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                  <th className="px-2 py-2">Projekt</th>
                                  <th className="px-2 py-2">Kod</th>
                                  <th className="px-2 py-2">Timmar</th>
                                  <th className="px-2 py-2">Fakturerbara</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(u.projects || []).length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-2 py-3 text-slate-500">Ingen projektrad för veckan.</td>
                                  </tr>
                                ) : (
                                  (u.projects || []).map((p) => (
                                    <tr key={`${u.userId}-${p.projectId || 'intern'}`} className="border-b border-slate-100 last:border-b-0">
                                      <td className="px-2 py-2 font-medium text-slate-900">{p.projectName}</td>
                                      <td className="px-2 py-2 text-slate-600">{p.projectCode}</td>
                                      <td className="px-2 py-2">{p.hours.toFixed(1)} h</td>
                                      <td className="px-2 py-2">{p.billableHours.toFixed(1)} h</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
