import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  TrendingUp,
  Users,
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/design';
import type { DashboardActionItem, ProjectListItem, TimeEntry, WeekLock } from '../types';
import { formatCurrency, formatDate, formatHours, formatPercent } from '../utils/format';

type StatusTone = 'blue' | 'green' | 'yellow' | 'red' | 'gray' | 'slate' | 'orange' | 'dark';

export default function Dashboard() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) return <DashboardSkeleton />;

  const pendingCount = data?.summary.pendingApprovalCount || 0;
  const riskCount = data?.summary.riskProjectCount || 0;
  const runningCount = data?.summary.projectsWithoutBudgetCount || 0;
  const weekRows = buildWeekRows(data?.dailyHours, data?.period?.weekStart);
  const weekMaxHours = Math.max(8, ...weekRows.map((row) => row.hours));
  const missingWeekdays = getMissingReportedWeekdays(data?.dailyHours, data?.period?.weekStart);
  const hasMissingWeekdays = missingWeekdays.length > 0;
  const firstName = user?.name?.split(' ')[0];
  const primaryTarget = pendingCount ? '/approval' : riskCount || runningCount ? '/projects' : isManager ? '/team-week' : '/time-entry';
  const primaryLabel = pendingCount ? 'Öppna attest' : riskCount || runningCount ? 'Granska projekt' : isManager ? 'Öppna teamvecka' : 'Rapportera tid';
  const actionRows = buildActionRows({
    isManager,
    actionItems: data?.actionItems || [],
    hasMissingWeekdays,
    missingWeekdays,
    pendingCount,
    riskCount,
    runningCount,
  });

  return (
    <div className="app-workspace">
      <header className="app-header">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="app-eyebrow">Arbetsläge</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-graphite-950 sm:text-4xl">
              {isManager ? 'Dagens kontroll' : `God arbetsdag${firstName ? `, ${firstName}` : ''}`}
            </h1>
            <p className="app-description">
              {headlineText({ isManager, pendingCount, riskCount, runningCount, hasMissingWeekdays })}{' '}
              Period: {formatPeriod(data?.period?.weekStart, data?.period?.weekEnd)}.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link to={primaryTarget} className="btn-primary justify-center">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/time-entry" className="btn-secondary justify-center">
              <Clock className="h-4 w-4" />
              Rapportera
            </Link>
            {isManager && (
              <Link to="/reports" className="btn-secondary justify-center">
                <FileText className="h-4 w-4" />
                Rapporter
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="overflow-hidden border-y border-graphite-900 bg-graphite-950 text-white">
        <div className="grid grid-cols-2 divide-x divide-y divide-white/10 md:grid-cols-4 md:divide-y-0">
          <StatusMetric label="Attest väntar" value={pendingCount} detail="veckor" tone={pendingCount ? 'yellow' : 'green'} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatusMetric label="Budgetrisk" value={riskCount} detail="projekt" tone={riskCount ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatusMetric label={isManager ? 'Löpande utan budget' : 'Saknade dagar'} value={isManager ? runningCount : missingWeekdays.length} detail={isManager ? 'projekt' : 'denna vecka'} tone={(isManager ? runningCount : missingWeekdays.length) ? 'yellow' : 'green'} icon={<ListChecks className="h-4 w-4" />} />
          <StatusMetric label="Debiterbart vecka" value={formatCurrency(data?.summary.weeklyBillableValue)} detail={`${formatHours(data?.summary.weeklyBillableHours)} tid`} tone="blue" icon={<TrendingUp className="h-4 w-4" />} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <WorkQueue actionRows={actionRows} pendingApprovals={data?.pendingApprovals || []} isManager={isManager} />
        <WeekPulse rows={weekRows} maxHours={weekMaxHours} weeklyHours={data?.summary.weeklyHours || 0} monthlyHours={data?.summary.monthlyHours || 0} />
      </div>

      {isManager ? (
        <ProjectWatchSection riskProjects={data?.riskProjects || []} runningProjects={data?.projectsWithoutBudget || []} />
      ) : (
        <EmployeeWeekSection hasMissingWeekdays={hasMissingWeekdays} missingWeekdays={missingWeekdays} pendingWeeks={data?.myPendingWeeks || []} />
      )}

      <RecentEntriesSection entries={data?.recentEntries || []} isManager={isManager} />
    </div>
  );
}

function StatusMetric({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  tone: StatusTone;
  icon: ReactNode;
}) {
  const color = tone === 'red' ? 'text-rose-300' : tone === 'yellow' ? 'text-amber-200' : tone === 'green' ? 'text-emerald-200' : 'text-primary-200';

  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className={`mt-1 ${color}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-normal text-white/50">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-normal text-white tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-white/60">{detail}</p>
      </div>
    </div>
  );
}

function WorkQueue({
  actionRows,
  pendingApprovals,
  isManager,
}: {
  actionRows: DashboardActionItem[];
  pendingApprovals: WeekLock[];
  isManager: boolean;
}) {
  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary-700" />
          <h2 className="text-lg font-semibold text-graphite-950">Prioriterat nu</h2>
        </div>
        <Link to={isManager ? '/approval' : '/week'} className="text-link">
          {isManager ? 'Visa attest' : 'Min vecka'}
        </Link>
      </div>

      <div className="divide-y divide-graphite-200">
        {actionRows.map((item, index) => (
          <Link
            key={item.id}
            to={item.to}
            className="grid gap-3 px-4 py-4 transition hover:bg-primary-50/60 sm:grid-cols-[1.75rem_1fr_auto] sm:items-start"
          >
            <span className="hidden pt-0.5 text-sm font-semibold text-graphite-400 sm:block">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-graphite-950">{item.title}</span>
              <span className="mt-1 block text-sm leading-5 text-graphite-600">{item.description}</span>
            </span>
            <span className="flex items-center gap-2 sm:justify-end">
              <StatusBadge label={statusLabel(item.tone)} tone={item.tone} />
              <ArrowRight className="h-4 w-4 text-graphite-400" />
            </span>
          </Link>
        ))}

        {isManager && pendingApprovals.slice(0, 3).map((lock) => (
          <Link key={lock.id} to="/approval" className="grid gap-3 px-4 py-4 transition hover:bg-primary-50/60 sm:grid-cols-[1.75rem_1fr_auto] sm:items-start">
            <span className="hidden pt-0.5 text-amber-700 sm:block">
              <Users className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-semibold text-graphite-950">{lock.user?.name || 'Anställd'}</span>
              <span className="mt-1 block text-sm text-graphite-600">
                Vecka från {formatDate(lock.weekStartDate)}
                {lock.totalHours != null ? ` · ${formatHours(lock.totalHours)}` : ''}
              </span>
            </span>
            <StatusBadge label="Väntar" tone="yellow" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function WeekPulse({
  rows,
  maxHours,
  weeklyHours,
  monthlyHours,
}: {
  rows: Array<{ label: string; date: string; hours: number }>;
  maxHours: number;
  weeklyHours: number;
  monthlyHours: number;
}) {
  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-700" />
          <h2 className="text-lg font-semibold text-graphite-950">Veckans tid</h2>
        </div>
        <p className="text-sm font-semibold text-graphite-700">{formatHours(weeklyHours)}</p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-graphite-200 border-b border-graphite-200">
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-graphite-500">Vecka</p>
          <p className="mt-1 text-2xl font-semibold text-graphite-950">{formatHours(weeklyHours)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-graphite-500">Månad</p>
          <p className="mt-1 text-2xl font-semibold text-graphite-950">{formatHours(monthlyHours)}</p>
        </div>
      </div>

      <div className="divide-y divide-graphite-100">
        {rows.length ? rows.map((day) => (
          <div key={day.date} className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-graphite-950">{day.label}</p>
              <p className="text-xs text-graphite-500">{formatShortDate(day.date)}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-graphite-100">
              <div
                className={day.hours > 0 ? 'h-full rounded-full bg-primary-600' : 'h-full rounded-full bg-graphite-200'}
                style={{ width: `${Math.max(day.hours > 0 ? 6 : 0, Math.min(100, Math.round((day.hours / maxHours) * 100)))}%` }}
              />
            </div>
            <p className="text-right font-semibold text-graphite-950">{formatHours(day.hours)}</p>
          </div>
        )) : (
          <PlainEmpty title="Ingen veckodata än" description="När tid rapporteras visas veckans fördelning här." />
        )}
      </div>
    </section>
  );
}

function ProjectWatchSection({
  riskProjects,
  runningProjects,
}: {
  riskProjects: ProjectListItem[];
  runningProjects: ProjectListItem[];
}) {
  const rows = [
    ...riskProjects.map((project) => ({ project, tone: 'red' as const, reason: 'Budgetrisk' })),
    ...runningProjects.map((project) => ({ project, tone: 'yellow' as const, reason: 'Löpande utan budget' })),
  ].slice(0, 10);

  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary-700" />
          <h2 className="text-lg font-semibold text-graphite-950">Projekt att följa</h2>
        </div>
        <Link to="/projects" className="text-link">Alla projekt</Link>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[780px] w-full text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kund</th>
                <th className="px-4 py-3 text-right">Vecka</th>
                <th className="px-4 py-3 text-right">Budget</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {rows.map(({ project, tone, reason }) => (
                <tr key={`${reason}-${project.id}`} className="hover:bg-primary-50/60">
                  <td className="px-4 py-3">
                    <Link to={`/projects/${project.id}`} className="font-semibold text-graphite-950 hover:text-primary-700">
                      {project.code} · {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-graphite-600">{project.customer?.name || 'Intern'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-graphite-950">{formatHours(project.metrics?.weekHours)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-graphite-950">
                    {project.metrics?.budgetUsagePercent == null ? '-' : formatPercent(project.metrics.budgetUsagePercent)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={reason} tone={tone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PlainEmpty title="Inga projekt kräver extra koll" description="Budgetrisker och löpande projekt ser lugna ut just nu." />
      )}
    </section>
  );
}

function EmployeeWeekSection({
  hasMissingWeekdays,
  missingWeekdays,
  pendingWeeks,
}: {
  hasMissingWeekdays: boolean;
  missingWeekdays: string[];
  pendingWeeks: string[];
}) {
  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-700" />
          <h2 className="text-lg font-semibold text-graphite-950">Min vecka</h2>
        </div>
        <Link to="/week" className="text-link">Öppna veckan</Link>
      </div>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-semibold text-graphite-950">
            {hasMissingWeekdays ? 'Dagar behöver kompletteras' : 'Rapporteringen är i fas'}
          </p>
          <p className="mt-1 text-sm text-graphite-600">
            {hasMissingWeekdays ? `Saknas: ${missingWeekdays.join(', ')}` : 'Alla vardagar hittills har rapporterad tid.'}
            {pendingWeeks.length > 0 ? ` ${pendingWeeks.length} vecka väntar på attest.` : ''}
          </p>
        </div>
        <Link to={hasMissingWeekdays ? '/time-entry' : '/week'} className="btn-secondary justify-center">
          {hasMissingWeekdays ? 'Rapportera nu' : 'Visa veckan'}
        </Link>
      </div>
    </section>
  );
}

function RecentEntriesSection({ entries, isManager }: { entries: TimeEntry[]; isManager: boolean }) {
  return (
    <section className="work-panel overflow-hidden">
      <div className="work-panel-header">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-700" />
          <h2 className="text-lg font-semibold text-graphite-950">Senaste tidrader</h2>
        </div>
        <Link to={isManager ? '/team-week' : '/week'} className="text-link">Visa mer</Link>
      </div>

      {entries.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Aktivitet</th>
                <th className="px-4 py-3 text-right">Tid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-primary-50/60">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-graphite-950">{formatDate(entry.date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-graphite-700">{entry.user?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <Link to={`/time-entry?id=${entry.id}&return=/`} className="font-semibold text-graphite-950 hover:text-primary-700">
                      {entry.project?.code || 'Intern'} · {entry.project?.name || 'Intern tid'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-graphite-600">{entry.activity?.name || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-graphite-950">{formatHours(entry.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PlainEmpty title="Ingen tid rapporterad" description="När tid sparas visas de senaste raderna här." />
      )}
    </section>
  );
}

function PlainEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-4 py-8 text-sm">
      <p className="font-semibold text-graphite-950">{title}</p>
      {description && <p className="mt-1 text-graphite-600">{description}</p>}
    </div>
  );
}

function buildActionRows({
  isManager,
  actionItems,
  hasMissingWeekdays,
  missingWeekdays,
  pendingCount,
  riskCount,
  runningCount,
}: {
  isManager: boolean;
  actionItems: DashboardActionItem[];
  hasMissingWeekdays: boolean;
  missingWeekdays: string[];
  pendingCount: number;
  riskCount: number;
  runningCount: number;
}): DashboardActionItem[] {
  if (isManager) {
    const preferred = actionItems.filter((item) => ['pending-approvals', 'risk-projects', 'projects-missing-budget'].includes(item.id));
    if (preferred.length) return preferred;

    return [
      {
        id: 'manager-status',
        title: pendingCount || riskCount || runningCount ? 'Följ upp öppna punkter' : 'Inget akut just nu',
        description: pendingCount || riskCount || runningCount
          ? `${pendingCount} attest, ${riskCount} riskprojekt och ${runningCount} löpande projekt.`
          : 'Attest, riskprojekt och löpande projekt ser stabila ut.',
        tone: pendingCount || riskCount ? 'yellow' : 'green',
        to: pendingCount ? '/approval' : riskCount || runningCount ? '/projects' : '/team-week',
      },
    ];
  }

  return [
    {
      id: hasMissingWeekdays ? 'employee-missing-time' : 'employee-week-ok',
      title: hasMissingWeekdays ? 'Komplettera veckan' : 'Veckan är under kontroll',
      description: hasMissingWeekdays
        ? `Saknas: ${missingWeekdays.join(', ')}. Lägg in tiden innan veckan skickas in.`
        : 'Alla vardagar hittills har rapporterad tid.',
      tone: hasMissingWeekdays ? 'yellow' : 'green',
      to: hasMissingWeekdays ? '/time-entry' : '/week',
    },
  ];
}

function buildWeekRows(dailyHours?: Record<string, number>, weekStart?: string) {
  if (!weekStart) return [];

  const labels = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
  return labels.map((label, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);

    return {
      label,
      date: key,
      hours: dailyHours?.[key] || 0,
    };
  });
}

function getMissingReportedWeekdays(
  dailyHours?: Record<string, number>,
  weekStart?: string
): string[] {
  if (!dailyHours || !weekStart) return [];

  const labels = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
  const missing: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 5; i += 1) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);

    if (date > today) continue;

    const key = date.toISOString().slice(0, 10);
    const hours = dailyHours[key] || 0;
    if (hours <= 0) missing.push(labels[i]);
  }

  return missing;
}

function headlineText({
  isManager,
  pendingCount,
  riskCount,
  runningCount,
  hasMissingWeekdays,
}: {
  isManager: boolean;
  pendingCount: number;
  riskCount: number;
  runningCount: number;
  hasMissingWeekdays: boolean;
}) {
  if (isManager) {
    if (pendingCount) return `${pendingCount} ${pendingCount === 1 ? 'vecka väntar' : 'veckor väntar'} på attest.`;
    if (riskCount) return `${riskCount} projekt behöver följas upp.`;
    if (runningCount) return `${runningCount} löpande projekt är aktiva utan budget.`;
    return 'Attest, timmar och projekt ser stabila ut.';
  }

  return hasMissingWeekdays ? 'Veckan behöver kompletteras.' : 'Veckan är i fas.';
}

function statusLabel(tone: DashboardActionItem['tone']) {
  if (tone === 'red') return 'Risk';
  if (tone === 'yellow') return 'Åtgärd';
  if (tone === 'blue') return 'Info';
  if (tone === 'green') return 'OK';
  return 'Status';
}

function formatPeriod(start?: string, end?: string) {
  if (!start || !end) return 'aktuell vecka';
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatShortDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
