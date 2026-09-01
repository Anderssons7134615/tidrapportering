import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, FileText, ListChecks } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { StatusBadge } from '../components/ui/design';
import type { DashboardActionItem, ProjectListItem } from '../types';
import { formatHours, formatPercent, parseDateOnlyLocal, toDateInputValue } from '../utils/format';
import { buildDashboardActionRows, getDashboardPrimaryAction } from '../utils/dashboardPresentation';

export default function Dashboard() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [dashboardNow, setDashboardNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setDashboardNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) {
    return (
      <div className="app-workspace">
        <QueryError title="Kunde inte hämta översikten" onRetry={() => void refetch()} />
      </div>
    );
  }

  const pendingCount = data?.summary.pendingApprovalCount || 0;
  const riskCount = data?.summary.riskProjectCount || 0;
  const runningCount = data?.summary.projectsWithoutBudgetCount || 0;
  const primaryAction = getDashboardPrimaryAction({ isManager, pendingCount, riskCount, runningCount, now: dashboardNow });
  const approvalReminderCount = primaryAction.approvalReminderCount;
  const weekRows = buildWeekRows(data?.dailyHours, data?.period?.weekStart);
  const weekMaxHours = Math.max(8, ...weekRows.map((row) => row.hours));
  const missingWeekdays = getMissingReportedWeekdays(data?.dailyHours, data?.period?.weekStart);
  const firstName = user?.name?.split(' ')[0];
  const actionRows = buildDashboardActionRows({
    isManager,
    missingWeekdays,
    pendingWeeks: data?.myPendingWeeks || [],
    approvalReminderCount,
    riskCount,
    runningCount,
  });

  return (
    <div className="space-y-4 lg:space-y-5">
      <header className="flex flex-col gap-4 border-b border-graphite-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">{isManager ? 'Dagens läge' : `God arbetsdag${firstName ? `, ${firstName}` : ''}`}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-graphite-600">
            {headlineText({ isManager, approvalReminderCount, riskCount, runningCount, hasMissingWeekdays: missingWeekdays.length > 0 })}{' '}
            {formatPeriod(data?.period?.weekStart, data?.period?.weekEnd)}.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to={primaryAction.to} className="btn-primary justify-center">
            {primaryAction.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to={isManager ? '/reports' : '/week'} className="btn-secondary justify-center">
            {isManager ? <FileText className="h-4 w-4" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
            {isManager ? 'Rapporter' : 'Visa veckan'}
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <WeekOverview
          rows={weekRows}
          maxHours={weekMaxHours}
          weeklyHours={data?.summary.weeklyHours || 0}
          monthlyHours={data?.summary.monthlyHours || 0}
          isManager={isManager}
        />
        <PriorityList rows={actionRows} isManager={isManager} />
      </div>

      {isManager && (riskCount > 0 || runningCount > 0) && (
        <ProjectFocus riskProjects={data?.riskProjects || []} runningProjects={data?.projectsWithoutBudget || []} />
      )}
    </div>
  );
}

function WeekOverview({
  rows,
  maxHours,
  weeklyHours,
  monthlyHours,
  isManager,
}: {
  rows: Array<{ label: string; date: string; hours: number }>;
  maxHours: number;
  weeklyHours: number;
  monthlyHours: number;
  isManager: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-graphite-200 bg-white" aria-labelledby="dashboard-week-title">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-graphite-200 bg-graphite-50/75 px-4 py-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <div>
            <h2 id="dashboard-week-title" className="font-semibold text-graphite-950">Denna vecka</h2>
            <p className="text-xs text-graphite-600">{isManager ? 'Rapporterat av teamet' : 'Din rapporterade tid'}</p>
          </div>
        </div>
        <div className="flex items-baseline gap-4 text-sm">
          <p><strong className="tabular-nums text-graphite-950">{formatHours(weeklyHours)}</strong> vecka</p>
          <p className="hidden text-graphite-600 sm:block"><strong className="tabular-nums text-graphite-950">{formatHours(monthlyHours)}</strong> månad</p>
        </div>
      </div>

      {rows.length ? (
        <div className="grid grid-cols-5 divide-x divide-graphite-200">
          {rows.map((day) => {
            const width = Math.max(day.hours > 0 ? 8 : 0, Math.min(100, Math.round((day.hours / maxHours) * 100)));
            return (
              <div key={day.date} className="min-w-0 px-2 py-3 text-center sm:px-3">
                <p className="text-xs font-semibold text-graphite-600">{day.label}</p>
                <p className="mt-1 truncate text-xs text-graphite-500">{formatShortDate(day.date)}</p>
                <p className="mt-2 whitespace-nowrap text-sm font-semibold tabular-nums text-graphite-950">{formatHours(day.hours)}</p>
                <div className="mx-auto mt-2 h-1.5 w-full max-w-16 overflow-hidden rounded-full bg-graphite-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary-600" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CompactEmpty title="Ingen veckodata ännu" description="Timmarna visas här när de rapporteras." />
      )}

      <div className="flex justify-end border-t border-graphite-200 px-3">
        <Link
          to={isManager ? '/team-week' : '/time-entry'}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          {isManager ? 'Öppna teamveckan' : 'Rapportera tid'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function PriorityList({ rows, isManager }: { rows: DashboardActionItem[]; isManager: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-graphite-200 bg-white" aria-labelledby="dashboard-priority-title">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-graphite-200 bg-graphite-50/75 px-4 py-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <h2 id="dashboard-priority-title" className="font-semibold text-graphite-950">Att göra nu</h2>
        </div>
        <Link
          to={isManager ? '/team-week' : '/week'}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          {isManager ? 'Teamvecka' : 'Min vecka'}
        </Link>
      </div>

      <div className="divide-y divide-graphite-200">
        {rows.slice(0, 3).map((item) => (
          <Link
            key={item.id}
            to={item.to}
            className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-5 text-graphite-950">{item.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-graphite-600">{item.description}</span>
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge label={statusLabel(item.tone)} tone={item.tone} />
              <ArrowRight className="h-4 w-4 text-graphite-400" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProjectFocus({ riskProjects, runningProjects }: { riskProjects: ProjectListItem[]; runningProjects: ProjectListItem[] }) {
  const rows = buildProjectRows(riskProjects, runningProjects);

  return (
    <section className="overflow-hidden rounded-lg border border-graphite-200 bg-white" aria-labelledby="dashboard-project-title">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-graphite-200 bg-graphite-50/75 px-4 py-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <h2 id="dashboard-project-title" className="font-semibold text-graphite-950">Projekt som kräver kontroll</h2>
        </div>
        <Link
          to="/projects"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          Alla projekt
        </Link>
      </div>

      {rows.length ? (
        <div className="grid sm:grid-cols-2">
          {rows.map(({ project, reason, tone }, index) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className={`flex min-h-16 min-w-0 items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${
                index > 0 ? 'border-t border-graphite-200' : ''
              } ${index % 2 === 1 ? 'sm:border-l sm:border-t-0' : ''} ${index > 1 ? 'sm:border-t' : ''}`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5 text-graphite-950 [overflow-wrap:anywhere]">{project.code} · {project.name}</span>
                <span className="mt-0.5 block text-xs text-graphite-600 [overflow-wrap:anywhere]">
                  {project.customer?.name || 'Intern'} · {formatHours(project.metrics?.weekHours)} denna vecka
                </span>
              </span>
              <span className="shrink-0 text-right">
                <StatusBadge label={reason} tone={tone} />
                {project.metrics?.budgetUsagePercent != null && (
                  <span className="mt-1 block text-xs font-semibold tabular-nums text-graphite-600">{formatPercent(project.metrics.budgetUsagePercent)}</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <CompactEmpty title="Inga projekt kräver extra koll" description="Budget och aktiva projekt ser stabila ut." />
      )}
    </section>
  );
}

function CompactEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3 text-sm">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
      <div>
        <p className="font-semibold text-graphite-950">{title}</p>
        <p className="text-xs text-graphite-600">{description}</p>
      </div>
    </div>
  );
}

function buildProjectRows(riskProjects: ProjectListItem[], runningProjects: ProjectListItem[]) {
  const rows = new Map<string, { project: ProjectListItem; reason: string; tone: 'red' | 'yellow' }>();
  riskProjects.forEach((project) => rows.set(project.id, { project, reason: 'Budgetrisk', tone: 'red' }));
  runningProjects.forEach((project) => {
    if (!rows.has(project.id)) rows.set(project.id, { project, reason: 'Saknar budget', tone: 'yellow' });
  });
  return Array.from(rows.values()).slice(0, 4);
}

function buildWeekRows(dailyHours?: Record<string, number>, weekStart?: string) {
  if (!weekStart) return [];
  const labels = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
  return labels.map((label, index) => {
    const date = parseDateOnlyLocal(weekStart);
    date.setDate(date.getDate() + index);
    const key = toDateInputValue(date);
    return { label, date: key, hours: dailyHours?.[key] || 0 };
  });
}

function getMissingReportedWeekdays(dailyHours?: Record<string, number>, weekStart?: string): string[] {
  if (!dailyHours || !weekStart) return [];
  const labels = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
  const missing: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = 0; index < 5; index += 1) {
    const date = parseDateOnlyLocal(weekStart);
    date.setDate(date.getDate() + index);
    date.setHours(0, 0, 0, 0);
    if (date > today) continue;
    const key = toDateInputValue(date);
    if ((dailyHours[key] || 0) <= 0) missing.push(labels[index]);
  }
  return missing;
}

function headlineText({
  isManager,
  approvalReminderCount,
  riskCount,
  runningCount,
  hasMissingWeekdays,
}: {
  isManager: boolean;
  approvalReminderCount: number;
  riskCount: number;
  runningCount: number;
  hasMissingWeekdays: boolean;
}) {
  if (isManager) {
    if (approvalReminderCount) return 'Fredagens attestkontroll är redo.';
    if (riskCount) return `${riskCount} projekt behöver följas upp.`;
    if (runningCount) return `${runningCount} löpande projekt saknar budget.`;
    return 'Teamets tid och projekt ser stabila ut.';
  }
  return hasMissingWeekdays ? 'Veckan behöver kompletteras.' : 'Veckan är i fas.';
}

function statusLabel(tone: DashboardActionItem['tone']) {
  if (tone === 'red') return 'Risk';
  if (tone === 'yellow') return 'Åtgärd';
  if (tone === 'blue') return 'Info';
  if (tone === 'green') return 'Klart';
  return 'Status';
}

function formatPeriod(start?: string, end?: string) {
  if (!start || !end) return 'Aktuell vecka';
  return `${formatShortDate(start)}–${formatShortDate(end)}`;
}

function formatShortDate(value?: string) {
  if (!value) return '-';
  return parseDateOnlyLocal(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
