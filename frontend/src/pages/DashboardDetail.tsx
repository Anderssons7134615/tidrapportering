import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ChevronRight, Clock, FolderKanban, Receipt, User2 } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '../components/ui/design';
import type { DashboardMetric } from '../types';

const validMetrics: DashboardMetric[] = ['weekly-hours', 'monthly-hours', 'pending-approval'];

function formatDecimalHours(value: unknown) {
  const hours = Number(value);
  return Number.isFinite(hours) ? `${hours.toFixed(1).replace('.', ',')} h` : '0,0 h';
}

export default function DashboardDetail() {
  const { metric } = useParams<{ metric: DashboardMetric }>();
  const { user } = useAuthStore();

  if (!metric || !validMetrics.includes(metric)) {
    return <Navigate to="/" replace />;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'drilldown', metric],
    queryFn: () => dashboardApi.getDrilldown(metric),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="work-panel p-4 text-sm text-graphite-600">Laddar detaljer...</div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="work-panel border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Kunde inte hämta detaljer för översikten.
        </div>
      </AppShell>
    );
  }

  const isManager = ['ADMIN', 'SUPERVISOR'].includes(user?.role || '');
  const periodStart = data.period?.start ? new Date(data.period.start) : new Date();
  const periodEnd = data.period?.end ? new Date(data.period.end) : periodStart;
  const fallbackTitle =
    metric === 'weekly-hours' ? 'Veckans timmar' :
      metric === 'monthly-hours' ? 'Månadens timmar' :
        'Attest att följa upp';
  const totalLabel = data.kind === 'pending-approvals'
    ? `${data.totalCount ?? data.approvals?.length ?? 0} väntar`
    : formatDecimalHours(data.totalHours);
  const scopeLabel = data.kind === 'pending-approvals'
    ? 'Väntande veckor'
    : isManager
      ? 'Företagets rapporterade rader'
      : 'Dina rapporterade rader';

  return (
    <AppShell>
      <Link to="/" className="btn-secondary inline-flex w-fit">
        <ArrowLeft className="h-4 w-4" />
        Tillbaka till översikt
      </Link>

      <PageHeader
        title={data.title || fallbackTitle}
        description={data.description || 'Detaljer från översikten.'}
        action={
          <StatusBadge
            label={`${format(periodStart, 'd MMM yyyy', { locale: sv })} - ${format(periodEnd, 'd MMM yyyy', { locale: sv })}`}
            tone="slate"
          />
        }
      />

      <section className="border-y border-graphite-200 bg-white/85 py-3">
        <div className="grid grid-cols-1 gap-3 px-3 text-sm leading-6 text-graphite-700 md:grid-cols-2">
          <p><span className="font-semibold text-graphite-950">Totalt:</span> {totalLabel}</p>
          <p><span className="font-semibold text-graphite-950">Visning:</span> {scopeLabel}</p>
        </div>
      </section>

      {data.kind === 'weekly-user-summary' ? (
        <WeeklyUserSummary data={data} periodStart={periodStart} />
      ) : data.kind === 'pending-approvals' ? (
        <PendingApprovals data={data} />
      ) : (
        <EntryList data={data} isManager={isManager} />
      )}
    </AppShell>
  );
}

function WeeklyUserSummary({ data, periodStart }: { data: any; periodStart: Date }) {
  const users = Array.isArray(data.users) ? data.users : [];

  if (users.length === 0) {
    return <EmptyState title="Inga tider hittades" description="Det finns inga rapporterade tider för den valda veckan." />;
  }

  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <h2 className="section-title">Veckorader per person</h2>
      </div>
      <div className="divide-y divide-graphite-100">
        {users.map((summary: any) => (
          <div key={summary.userId} className="px-3 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 lg:w-48">
                <p className="truncate font-semibold text-graphite-950">{summary.userName}</p>
                <p className="text-sm text-graphite-500">{formatDecimalHours(summary.totalHours)} totalt</p>
              </div>
              <div className="grid flex-1 grid-cols-7 gap-1">
                {(Array.isArray(summary.days) ? summary.days : []).map((day: any) => (
                  <div key={`${summary.userId}-${day.date}`} className="min-h-16 border-l border-graphite-200 bg-graphite-50 px-2 py-2 text-center">
                    <p className="text-[11px] font-semibold uppercase text-graphite-500">
                      {format(new Date(day.date), 'EEE', { locale: sv })}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-graphite-950">{Number(day.hours) > 0 ? formatDecimalHours(day.hours) : '-'}</p>
                    {(Array.isArray(day.projectCodes) ? day.projectCodes : []).length > 0 && (
                      <p className="mt-1 truncate text-[11px] text-graphite-500" title={(Array.isArray(day.projectNames) ? day.projectNames : []).join(', ')}>
                        {(Array.isArray(day.projectCodes) ? day.projectCodes : []).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <Link
                to={`/week?date=${format(periodStart, 'yyyy-MM-dd')}&userId=${summary.userId}`}
                className="btn-secondary inline-flex shrink-0"
              >
                Öppna/rätta
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PendingApprovals({ data }: { data: any }) {
  const approvals = Array.isArray(data.approvals) ? data.approvals : [];

  if (approvals.length === 0) {
    return <EmptyState title="Inga veckor att attestera" description="Attestkön är tom just nu." />;
  }

  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <h2 className="section-title">Attestkö</h2>
      </div>
      <div className="divide-y divide-graphite-100">
        {approvals.map((approval: any) => (
          <Link
            key={approval.id}
            to="/approval"
            className="grid grid-cols-1 gap-2 px-3 py-4 text-sm transition hover:bg-primary-50/60 sm:grid-cols-[1fr_auto_24px] sm:items-center"
          >
            <div className="min-w-0">
              <p className="font-semibold text-graphite-950">{approval.user?.name}</p>
              <p className="mt-1 text-graphite-500">
                Vecka {format(new Date(approval.weekStartDate), 'w', { locale: sv })} · {format(new Date(approval.weekStartDate), 'd MMM', { locale: sv })}
              </p>
            </div>
            <p className="text-graphite-700 sm:text-right">
              <strong className="text-graphite-950">{formatDecimalHours(approval.totalHours)}</strong>
              <span className="block">{approval.entryCount || 0} rader</span>
            </p>
            <ChevronRight className="hidden h-4 w-4 text-graphite-400 sm:block" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function EntryList({ data, isManager }: { data: any; isManager: boolean }) {
  const entries = Array.isArray(data.entries) ? data.entries : [];

  if (entries.length === 0) {
    return <EmptyState title="Inga tidsrader hittades" description="Det finns inga rader i den valda perioden." />;
  }

  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <h2 className="section-title">Tidsrader</h2>
      </div>
      <div className="divide-y divide-graphite-100">
        {entries.map((entry: any) => (
          <div key={entry.id} className="px-3 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-950">
                  <CalendarClock className="h-4 w-4 text-primary-700" />
                  {format(new Date(entry.date), 'EEEE d MMM', { locale: sv })}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-graphite-600">
                  {isManager && entry.user?.name && (
                    <span className="inline-flex items-center gap-1.5">
                      <User2 className="h-4 w-4" />
                      {entry.user.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <FolderKanban className="h-4 w-4" />
                    {entry.project ? `${entry.project.code} - ${entry.project.name}` : 'Intern tid'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Receipt className="h-4 w-4" />
                    {entry.activity?.name || 'Aktivitet saknas'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {formatDecimalHours(entry.hours)}
                  </span>
                </div>
                {entry.note && <p className="mt-3 text-sm text-graphite-600">{entry.note}</p>}
              </div>
              <Link
                to={`/week?date=${format(new Date(entry.date), 'yyyy-MM-dd')}`}
                className="btn-secondary inline-flex shrink-0"
              >
                Öppna veckan
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
