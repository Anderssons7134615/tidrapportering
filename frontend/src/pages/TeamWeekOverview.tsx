import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  Search,
  UserX,
  Users,
} from 'lucide-react';
import { timeEntriesApi } from '../services/api';
import type { TeamWeekAttentionStatus, TeamWeekSummaryDay, TeamWeekSummaryUser } from '../types';
import { AppShell, Card, EmptyState, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
import { formatDate, formatHours } from '../utils/format';

const weekStatusLabel: Record<string, string> = {
  DRAFT: 'Ej inskickad',
  SUBMITTED: 'Väntar attest',
  APPROVED: 'Godkänd',
  REJECTED: 'Nekad',
};

const attentionMeta: Record<TeamWeekAttentionStatus, { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }> = {
  OK: { label: 'I fas', tone: 'green' },
  MISSING: { label: 'Saknar tid', tone: 'red' },
  DEVIATION: { label: 'Avvikelse', tone: 'yellow' },
  PENDING: { label: 'Väntar attest', tone: 'blue' },
  APPROVED: { label: 'Godkänd', tone: 'gray' },
  REJECTED: { label: 'Nekad', tone: 'red' },
};

const dayClass: Record<string, string> = {
  REPORTED: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  APPROVED: 'border-slate-200 bg-slate-100 text-slate-700',
  MISSING: 'border-rose-200 bg-rose-50 text-rose-900',
  DEVIATION: 'border-amber-200 bg-amber-50 text-amber-900',
  EMPTY: 'border-slate-200 bg-white text-slate-400',
  OFF: 'border-slate-200 bg-slate-50 text-slate-400',
  FUTURE: 'border-slate-200 bg-white text-slate-300',
};

const filterTabs = [
  { id: 'needs-action', label: 'Behöver åtgärd' },
  { id: 'missing', label: 'Ej rapporterat' },
  { id: 'pending', label: 'Väntar attest' },
  { id: 'deviation', label: 'Avvikelser' },
  { id: 'all', label: 'Alla' },
] as const;

type FilterId = typeof filterTabs[number]['id'];

export default function TeamWeekOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(() => startOfWeek(dateParam ? new Date(dateParam) : new Date(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterId>('needs-action');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['team-week-summary', weekStartStr],
    queryFn: () => timeEntriesApi.getTeamWeekSummary(weekStartStr),
  });

  const sortedUsers = useMemo(() => {
    const users = data?.users || [];
    const priority: Record<string, number> = {
      MISSING: 0,
      REJECTED: 1,
      DEVIATION: 2,
      PENDING: 3,
      OK: 4,
      APPROVED: 5,
    };

    return [...users].sort((a, b) => {
      const aPriority = priority[a.attentionStatus || 'OK'] ?? 6;
      const bPriority = priority[b.attentionStatus || 'OK'] ?? 6;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.userName.localeCompare(b.userName, 'sv');
    });
  }, [data?.users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return sortedUsers.filter((user) => {
      const matchesFilter =
        activeFilter === 'all'
          ? true
          : activeFilter === 'needs-action'
            ? user.needsAction || user.status === 'SUBMITTED' || user.status === 'REJECTED'
            : activeFilter === 'missing'
              ? user.attentionStatus === 'MISSING'
              : activeFilter === 'pending'
                ? user.attentionStatus === 'PENDING'
                : user.attentionStatus === 'DEVIATION' || user.attentionStatus === 'REJECTED';

      if (!matchesFilter) return false;
      if (!q) return true;

      const projectMatch = (user.projects || []).some((project) =>
        `${project.projectCode} ${project.projectName}`.toLowerCase().includes(q)
      );

      return user.userName.toLowerCase().includes(q) || projectMatch;
    });
  }, [activeFilter, search, sortedUsers]);

  const totals = useMemo(() => {
    const users = data?.users || [];
    return {
      missingUsers: data?.totals.missingUsers ?? users.filter((u) => u.attentionStatus === 'MISSING').length,
      pendingUsers: data?.totals.pendingUsers ?? users.filter((u) => u.attentionStatus === 'PENDING').length,
      deviationUsers: data?.totals.deviationUsers ?? users.filter((u) => u.attentionStatus === 'DEVIATION' || u.attentionStatus === 'REJECTED').length,
      approvedUsers: data?.totals.approvedUsers ?? users.filter((u) => u.attentionStatus === 'APPROVED').length,
      needsActionUsers: data?.totals.needsActionUsers ?? users.filter((u) => u.needsAction).length,
      totalHours: data?.totals.totalHours ?? 0,
    };
  }, [data]);

  const navigateWeek = (dir: 'prev' | 'next') => {
    const nextDate = dir === 'prev' ? subWeeks(weekStart, 1) : addWeeks(weekStart, 1);
    setSelectedDate(nextDate);
    setSearchParams({ date: format(nextDate, 'yyyy-MM-dd') });
  };

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <AppShell>
      <PageHeader
        title="Teamvecka"
        description="Se direkt vilka som saknar tid, vilka veckor som väntar på attest och var det finns avvikelser."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => navigateWeek('prev')} className="btn-secondary px-3" type="button" aria-label="Föregående vecka">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vecka {format(weekStart, 'w', { locale: sv })}</p>
              <p className="text-sm font-semibold text-slate-900">{format(weekStart, 'd MMM', { locale: sv })}</p>
            </div>
            <button onClick={() => navigateWeek('next')} className="btn-secondary px-3" type="button" aria-label="Nästa vecka">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <KpiCard label="Behöver åtgärd" value={totals.needsActionUsers} hint="Personer att följa upp" tone={totals.needsActionUsers ? 'red' : 'green'} />
        <KpiCard label="Ej rapporterat" value={totals.missingUsers} hint="Saknar vardagar" tone={totals.missingUsers ? 'red' : 'green'} />
        <KpiCard label="Väntar attest" value={totals.pendingUsers} hint="Inskickade veckor" tone={totals.pendingUsers ? 'blue' : 'slate'} />
        <KpiCard label="Avvikelser" value={totals.deviationUsers} hint="Över 10 h eller nekad" tone={totals.deviationUsers ? 'yellow' : 'green'} />
        <KpiCard label="Totalt" value={formatHours(totals.totalHours)} hint="Rapporterade timmar" tone="slate" />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Users className="h-5 w-5 text-primary-700" />
            <div>
              <h2 className="section-title">Rapporteringskontroll</h2>
              <p className="text-sm text-slate-500">Vardagar till och med idag räknas som förväntade rapportdagar.</p>
            </div>
          </div>

          <div className="relative w-full xl:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök anställd eller projekt..."
              className="input pl-9"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeFilter === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !data?.users?.length ? (
          <EmptyState title="Inga anställda hittades" description="När aktiva användare finns i bolaget visas deras vecka här." />
        ) : !filteredUsers.length ? (
          <EmptyState title="Inga träffar" description="Testa ett annat filter eller sök på namn/projekt." />
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <TeamWeekUserRow
                key={user.userId}
                user={user}
                expanded={!!expandedUsers[user.userId]}
                onToggle={() => toggleUser(user.userId)}
                weekStart={weekStartStr}
              />
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function TeamWeekUserRow({
  user,
  expanded,
  onToggle,
  weekStart,
}: {
  user: TeamWeekSummaryUser;
  expanded: boolean;
  onToggle: () => void;
  weekStart: string;
}) {
  const attention = attentionMeta[user.attentionStatus || 'OK'] || attentionMeta.OK;
  const missingDays = user.missingDays || [];
  const missingText = missingDays.length
    ? `${missingDays.length} saknade dag${missingDays.length === 1 ? '' : 'ar'}`
    : 'Inga saknade vardagar';

  return (
    <article className={`overflow-hidden rounded-xl border bg-white shadow-sm ${user.needsAction ? 'border-rose-200' : 'border-slate-200'}`}>
      <button type="button" onClick={onToggle} className="w-full px-4 py-3 text-left transition hover:bg-slate-50">
        <div className="grid gap-3 xl:grid-cols-[minmax(170px,0.75fr)_minmax(350px,1.35fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-slate-950">{user.userName}</p>
              <StatusBadge label={attention.label} tone={attention.tone} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {weekStatusLabel[user.status] || user.status} · {missingText}
            </p>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {(user.days || []).map((day) => (
              <DayCell key={day.date} day={day} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 text-sm xl:justify-end">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-900">{formatHours(user.totalHours)}</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 px-4 pb-4 pt-3">
          <ActionPanel user={user} weekStart={weekStart} />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="table-wrap">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="px-3 py-2">Projekt</th>
                    <th className="px-3 py-2">Kod</th>
                    <th className="px-3 py-2 text-right">Timmar</th>
                  </tr>
                </thead>
                <tbody>
                  {(user.projects || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-slate-500">Ingen projektrad för veckan.</td>
                    </tr>
                  ) : (
                    user.projects.map((project) => (
                      <tr key={`${user.userId}-${project.projectId || 'intern'}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{project.projectName}</td>
                        <td className="px-3 py-2 text-slate-600">{project.projectCode}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatHours(project.hours)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="px-3 py-2">Datum</th>
                    <th className="px-3 py-2">Projekt</th>
                    <th className="px-3 py-2">Aktivitet</th>
                    <th className="px-3 py-2 text-right">Timmar</th>
                  </tr>
                </thead>
                <tbody>
                  {(user.entries || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-slate-500">Inga tidrader för veckan.</td>
                    </tr>
                  ) : (
                    user.entries.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{formatDate(entry.date)}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{entry.project?.name || 'Intern tid'}</td>
                        <td className="px-3 py-2 text-slate-600">{entry.activity?.name || '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatHours(entry.hours)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function DayCell({ day }: { day: TeamWeekSummaryDay }) {
  return (
    <div
      title={`${day.dayName} ${day.date}: ${formatHours(day.hours)}${day.warnings.length ? ` - ${day.warnings.join(', ')}` : ''}`}
      className={`min-h-[58px] rounded-lg border px-2 py-1.5 text-center ${dayClass[day.status] || dayClass.EMPTY}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{day.dayName}</p>
      <p className="mt-1 text-sm font-bold">{day.hours > 0 ? formatHours(day.hours) : day.expected ? '0 h' : '-'}</p>
    </div>
  );
}

function ActionPanel({ user, weekStart }: { user: TeamWeekSummaryUser; weekStart: string }) {
  if (user.attentionStatus === 'APPROVED') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Veckan är godkänd och behöver ingen åtgärd.
      </div>
    );
  }

  const warnings = [
    ...(user.missingDays || []).map((date) => `Saknar tid ${formatDate(date)}`),
    ...(user.deviations || []).map((deviation) => deviation.date ? `${deviation.type} ${formatDate(deviation.date)}` : deviation.type),
  ];

  return (
    <div className="grid gap-3 rounded-xl border border-white bg-white p-3 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex items-center gap-2">
          {user.attentionStatus === 'MISSING' ? <UserX className="h-4 w-4 text-rose-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <p className="font-semibold text-slate-900">
            {user.needsAction ? 'Följ upp den här personen' : 'Veckan ser okej ut'}
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {warnings.length ? warnings.slice(0, 3).join(' · ') : 'Inga tydliga avvikelser hittades.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {user.status === 'SUBMITTED' && (
          <Link to="/approval" className="btn-primary">
            <FileCheck2 className="h-4 w-4" />
            Attestera
          </Link>
        )}
        <Link to={`/time-entry?${new URLSearchParams({ userId: user.userId, date: weekStart, return: `/team-week?date=${weekStart}` }).toString()}`} className="btn-secondary">
          <Clock className="h-4 w-4" />
          Öppna tid
        </Link>
      </div>
    </div>
  );
}
