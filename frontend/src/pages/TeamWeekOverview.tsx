import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, addWeeks, format, startOfWeek, subWeeks } from 'date-fns';
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
} from 'lucide-react';
import { timeEntriesApi } from '../services/api';
import type { TeamWeekAttentionStatus, TeamWeekSummaryDay, TeamWeekSummaryUser } from '../types';
import { AppShell, EmptyState, PageHeader, ReviewSummary, StatusBadge, TaskSection } from '../components/ui/design';
import { formatDate, formatHours } from '../utils/format';
import { parseDateOnlyLocal } from '../utils/format';
import { QueryError } from '../components/ui/QueryError';
import { IdentityMark } from '../components/ui/IdentityMark';

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
  APPROVED: { label: 'Godkänd', tone: 'green' },
  REJECTED: { label: 'Nekad', tone: 'red' },
};

const dayClass: Record<string, string> = {
  REPORTED: 'text-graphite-900',
  APPROVED: 'text-graphite-700',
  MISSING: 'text-rose-800',
  DEVIATION: 'text-amber-800',
  EMPTY: 'text-graphite-500',
  OFF: 'text-graphite-500',
  FUTURE: 'text-graphite-500',
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
  const requestedDate = dateParam ? parseDateOnlyLocal(dateParam) : new Date();
  const selectedDate = Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate;
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterId>('needs-action');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [showWeekend, setShowWeekend] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const { data, isLoading, isError, refetch } = useQuery({
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
    setSearchParams({ date: format(nextDate, 'yyyy-MM-dd') });
    setExpandedUsers({});
  };

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <AppShell>
      <PageHeader
        title="Teamvecka"
        description="Tid, avvikelser och attest. Hela teamets vecka på samma plats."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => navigateWeek('prev')} className="btn-secondary px-3" type="button" aria-label="Föregående vecka">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-1 py-1 text-center">
              <p className="text-sm font-semibold text-graphite-950">Vecka {format(weekStart, 'w', { locale: sv })}</p>
              <p className="text-xs text-graphite-500">{format(weekStart, weekStart.getFullYear() !== addDays(weekStart, 6).getFullYear() ? 'd MMM yyyy' : 'd MMM', { locale: sv })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}</p>
            </div>
            <button onClick={() => navigateWeek('next')} className="btn-secondary px-3" type="button" aria-label="Nästa vecka">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {!isLoading && !isError && data && <ReviewSummary>
        <p className="text-sm leading-6 text-graphite-700">
          <strong className="text-graphite-950">{totals.needsActionUsers} personer</strong> behöver följas upp. {totals.missingUsers} saknar tid, {totals.pendingUsers} väntar attest och {totals.deviationUsers} har avvikelse. Totalt <strong className="tabular-nums text-graphite-950">{formatHours(totals.totalHours)}</strong>.
        </p>
      </ReviewSummary>}

      <TaskSection className="team-week-section space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0"><h2 className="sr-only">Rapporteringskontroll</h2><p className="text-xs text-graphite-500">Vardagar till och med idag förväntas vara rapporterade.</p></div>

          <div className="relative w-full xl:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <label htmlFor="team-week-search" className="sr-only">Sök medarbetare eller projekt</label>
            <input
              id="team-week-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök anställd eller projekt..."
              className="input pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-graphite-200">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              aria-pressed={activeFilter === tab.id}
              className={`min-h-11 min-w-11 whitespace-nowrap border-b-2 px-1 py-2 text-[13px] font-medium transition ${
                activeFilter === tab.id ? 'border-primary-600 text-primary-800' : 'border-transparent text-graphite-600 hover:border-graphite-300 hover:text-graphite-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button type="button" className="ml-auto min-h-11 px-2 text-xs font-medium text-graphite-600 hover:text-primary-800" aria-pressed={showWeekend} onClick={() => setShowWeekend((value) => !value)}>{showWeekend ? 'Dölj helg' : 'Visa helg'}</button>
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse border-y border-graphite-100 bg-graphite-50" />
            ))}
          </div>
        ) : isError ? (
          <QueryError title="Kunde inte hämta teamveckan" onRetry={() => void refetch()} />
        ) : !data?.users?.length ? (
          <EmptyState title="Inga anställda hittades" description="När aktiva användare finns i bolaget visas deras vecka här." />
        ) : !filteredUsers.length ? (
          <EmptyState title="Inga träffar" description="Testa ett annat filter eller sök på namn/projekt." />
        ) : (
          <div className={`team-week-list ${showWeekend ? 'team-week-seven' : ''}`}>
            <div className="team-week-columns" aria-hidden="true"><span>Medarbetare</span><div className="team-week-days">{Array.from({ length: showWeekend ? 7 : 5 }, (_, index) => <span key={index}>{format(addDays(weekStart, index), 'EEE d', { locale: sv })}</span>)}</div><span className="text-right">Totalt</span><span /></div>
            {filteredUsers.map((user) => (
              <TeamWeekUserRow
                key={`${weekStartStr}-${user.userId}`}
                user={user}
                expanded={!!expandedUsers[user.userId]}
                onToggle={() => toggleUser(user.userId)}
                weekStart={weekStartStr}
                showWeekend={showWeekend}
              />
            ))}
          </div>
        )}
      </TaskSection>
    </AppShell>
  );
}

function TeamWeekUserRow({
  user,
  expanded,
  onToggle,
  weekStart,
  showWeekend,
}: {
  user: TeamWeekSummaryUser;
  expanded: boolean;
  onToggle: () => void;
  weekStart: string;
  showWeekend: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => {
    if (!showWeekend) setSelectedDay((day) => day && [0, 6].includes(parseDateOnlyLocal(day).getDay()) ? null : day);
  }, [showWeekend]);
  const { data: weekDetails, isLoading: detailsLoading, isError: detailsFailed, refetch: refetchDetails } = useQuery({
    queryKey: ['week', weekStart, user.userId],
    queryFn: () => timeEntriesApi.getWeek(weekStart, user.userId),
    enabled: expanded,
  });
  const attention = attentionMeta[user.attentionStatus || 'OK'] || attentionMeta.OK;
  const missingDays = user.missingDays || [];
  const missingText = missingDays.length
    ? `${missingDays.length} saknade dag${missingDays.length === 1 ? '' : 'ar'}`
    : 'Inga saknade vardagar';

  // The summary contains only recent rows. Day details require the complete week.
  const weekEntries = weekDetails?.entries || [];
  const entries = selectedDay ? weekEntries.filter((entry) => formatDate(entry.date) === selectedDay) : weekEntries;
  const weekendHours = user.days.filter((day) => [0, 6].includes(parseDateOnlyLocal(day.date).getDay())).reduce((sum, day) => sum + day.hours, 0);
  const visibleDays = user.days.filter((day) => showWeekend || ![0, 6].includes(parseDateOnlyLocal(day.date).getDay()));
  const toggleAll = () => { setSelectedDay(null); onToggle(); };

  return (
    <article className={`team-week-person ${expanded ? 'team-week-person-open' : ''}`}>
      <div className="team-week-row">
        <button type="button" onClick={toggleAll} aria-expanded={expanded} aria-controls={`team-week-${user.userId}`} className="team-week-name" aria-label={`${expanded ? 'Dölj' : 'Visa'} vecka för ${user.userName}`}>
          <IdentityMark name={user.userName} identity={user.userId} person />
          <span className="min-w-0"><span className="block text-[13px] font-semibold text-graphite-950 [overflow-wrap:anywhere]">{user.userName}</span><span className="mt-1 block"><StatusBadge label={attention.label} tone={attention.tone} quiet={user.attentionStatus === 'OK' || user.attentionStatus === 'APPROVED'} /></span></span>
        </button>
        <div className="team-week-days">
          {visibleDays.map((day) => <DayCell key={day.date} day={day} userName={user.userName} selected={expanded && selectedDay === day.date} onSelect={() => { setSelectedDay(day.date); if (!expanded) onToggle(); }} />)}
        </div>
        <div className="team-week-total"><span className="text-sm font-semibold tabular-nums text-graphite-950">{formatHours(user.totalHours)}</span>{!showWeekend && weekendHours > 0 && <span className="mt-1 block text-[11px] text-graphite-500">varav {formatHours(weekendHours)} helg</span>}</div>
        <button type="button" onClick={toggleAll} aria-expanded={expanded} aria-controls={`team-week-${user.userId}`} className="team-week-expand icon-button border-0 bg-transparent" aria-label={`${expanded ? 'Dölj' : 'Visa'} detaljer för ${user.userName}`}><ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>

      {expanded && (
        <div id={`team-week-${user.userId}`} className="team-week-detail space-y-4 border-t border-primary-100 bg-primary-50/40 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-graphite-600"><p>{weekStatusLabel[user.status] || user.status} · {missingText}</p>{selectedDay && <button type="button" className="min-h-11 px-2 font-medium text-primary-800" onClick={() => setSelectedDay(null)}>Visa hela veckan</button>}</div>
          <ActionPanel user={user} weekStart={weekStart} />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="table-wrap overflow-x-auto" role="region" aria-label={`Projektfördelning för ${user.userName}`} tabIndex={0}>
              <p className="border-b border-graphite-200 px-3 py-3 text-xs font-semibold">Projektfördelning · hela veckan</p>
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

            <div className="table-wrap overflow-x-auto" role="region" aria-label={`Tidrader för ${user.userName}`} tabIndex={0}>
              <p className="border-b border-graphite-200 px-3 py-3 text-xs font-semibold">Tidrader · {selectedDay ? formatDate(selectedDay) : 'hela veckan'}</p>
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
                  {detailsLoading ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-graphite-500" role="status">Hämtar veckans tidrader...</td></tr>
                  ) : detailsFailed ? (
                    <tr><td colSpan={4} className="p-3"><QueryError title="Kunde inte hämta tidraderna" onRetry={() => refetchDetails()} /></td></tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-slate-500">{selectedDay ? 'Inga tidrader för dagen.' : 'Inga tidrader för veckan.'}</td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
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

function DayCell({ day, userName, selected, onSelect }: { day: TeamWeekSummaryDay; userName: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected}
      aria-label={`${userName}, ${day.dayName} ${day.date}, ${formatHours(day.hours)}${day.warnings.length ? `, ${day.warnings.join(', ')}` : ''}`}
      title={`${day.dayName} ${day.date}: ${formatHours(day.hours)}${day.warnings.length ? ` - ${day.warnings.join(', ')}` : ''}`}
      className={`team-week-day ${selected ? 'team-week-day-selected' : ''} ${dayClass[day.status] || dayClass.EMPTY}`}
    >
      <span className="team-week-day-label">{day.dayName}</span>
      <span className="text-[13px] font-medium tabular-nums">{day.hours > 0 ? formatHours(day.hours) : day.expected ? '0 h' : '–'}</span>
      {(day.status === 'MISSING' || day.status === 'DEVIATION') && <span className="text-[10px]">{day.status === 'MISSING' ? 'Saknas' : 'Avvikelse'}</span>}
    </button>
  );
}

function ActionPanel({ user, weekStart }: { user: TeamWeekSummaryUser; weekStart: string }) {
  if (user.attentionStatus === 'APPROVED') {
    return (
      <div className="flex items-center gap-2 border-y border-graphite-200 bg-white px-4 py-3 text-sm text-graphite-600">
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
    <div className="grid gap-3 border-y border-graphite-200 bg-white px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
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
