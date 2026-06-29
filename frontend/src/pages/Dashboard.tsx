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

export default function Dashboard() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) return <DashboardSkeleton />;

  const visibleActionItems = (data?.actionItems || []).filter((item) => item.id !== 'projects-missing-budget');
  const missingWeekdays = getMissingReportedWeekdays(data?.dailyHours, data?.period?.weekStart);
  const hasMissingWeekdays = missingWeekdays.length > 0;
  const pendingCount = data?.summary.pendingApprovalCount || 0;
  const riskCount = data?.summary.riskProjectCount || 0;
  const runningCount = data?.summary.projectsWithoutBudgetCount || 0;
  const weekRows = buildWeekRows(data?.dailyHours, data?.period?.weekStart);
  const weekMaxHours = Math.max(8, ...weekRows.map((row) => row.hours));
  const firstName = user?.name?.split(' ')[0];
  const primaryTarget = pendingCount ? '/approval' : riskCount || runningCount ? '/projects' : isManager ? '/team-week' : '/time-entry';
  const primaryLabel = pendingCount ? 'Öppna attest' : riskCount || runningCount ? 'Granska projekt' : isManager ? 'Öppna teamvecka' : 'Rapportera tid';

  const actionRows = buildActionRows({
    isManager,
    visibleActionItems,
    hasMissingWeekdays,
    missingWeekdays,
    pendingCount,
    riskCount,
    runningCount,
  });

  return (
    <div className="space-y-6">
      <header className="border-b border-graphite-200 pb-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Översikt</p>
            <h1 className="mt-1 max-w-full text-2xl font-semibold leading-tight tracking-tight text-graphite-950 sm:text-4xl">
              God arbetsdag{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-3 max-w-4xl break-words text-sm leading-6 text-graphite-600">
              {headlineText({ isManager, pendingCount, riskCount, runningCount, hasMissingWeekdays })}{' '}
              Visar {formatPeriod(data?.period?.weekStart, data?.period?.weekEnd)} och månaden från{' '}
              {formatShortDate(data?.period?.monthStart)}.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Link to={primaryTarget} className="btn-primary w-full justify-center sm:w-auto">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/time-entry" className="btn-secondary w-full justify-center sm:w-auto">
              <Clock className="h-4 w-4" />
              Rapportera
            </Link>
            {isManager && (
              <Link to="/reports" className="btn-secondary w-full justify-center sm:w-auto">
                <FileText className="h-4 w-4" />
                Rapporter
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="border-y border-graphite-200 bg-white/85">
        <div className="grid divide-y divide-graphite-200 md:grid-cols-3 md:divide-x md:divide-y-0">
          <SummaryLine
            icon={<Clock className="h-4 w-4" />}
            label="Denna vecka"
            value={formatHours(data?.summary.weeklyHours)}
            detail={`${formatHours(data?.summary.weeklyBillableHours)} debiterbart`}
          />
          <SummaryLine
            icon={<CalendarDays className="h-4 w-4" />}
            label="Denna månad"
            value={formatHours(data?.summary.monthlyHours)}
            detail={`${formatHours(data?.summary.monthlyBillableHours)} debiterbart`}
          />
          <SummaryLine
            icon={isManager ? <Users className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            label={isManager ? 'Att bevaka' : 'Veckostatus'}
            value={isManager ? `${pendingCount + riskCount + runningCount} saker` : hasMissingWeekdays ? `${missingWeekdays.length} ${missingWeekdays.length === 1 ? 'dag' : 'dagar'} saknas` : 'I fas'}
            detail={isManager ? `${pendingCount} attest, ${riskCount} risk, ${runningCount} löpande` : hasMissingWeekdays ? missingWeekdays.join(', ') : 'Alla vardagar hittills har tid'}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="space-y-3">
          <SectionHeader
            icon={<ListChecks className="h-5 w-5" />}
            title="Nästa att göra"
            action={<DashboardTextLink to={primaryTarget}>Gå vidare</DashboardTextLink>}
          />
          <div className="divide-y divide-graphite-200 border-y border-graphite-200 bg-white/90">
            {actionRows.map((item) => (
              <ActionRow key={item.id} item={item} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={<TrendingUp className="h-5 w-5" />}
            title="Veckans timmar"
            action={<span className="text-sm font-medium text-graphite-500">{formatCurrency(data?.summary.weeklyBillableValue)} debiterbart</span>}
          />
          <div className="divide-y divide-graphite-100 border-y border-graphite-200 bg-white/90">
            {weekRows.length ? (
              weekRows.map((day) => (
                <div key={day.date} className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-3 px-3 py-3 text-sm sm:grid-cols-[6rem_1fr_5rem]">
                  <div>
                    <p className="font-semibold text-graphite-950">{day.label}</p>
                    <p className="text-xs text-graphite-500">{formatShortDate(day.date)}</p>
                  </div>
                  <div className="h-2 overflow-hidden bg-graphite-100">
                    <div
                      className={`h-full ${day.hours > 0 ? 'bg-primary-500' : 'bg-graphite-200'}`}
                      style={{ width: `${Math.max(day.hours > 0 ? 6 : 0, Math.min(100, Math.round((day.hours / weekMaxHours) * 100)))}%` }}
                    />
                  </div>
                  <p className="text-right font-semibold text-graphite-950">{formatHours(day.hours)}</p>
                </div>
              ))
            ) : (
              <PlainEmpty title="Ingen veckodata än" description="När tid rapporteras visas veckans fördelning här." />
            )}
          </div>
        </section>
      </div>

      {isManager ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <PendingApprovalsSection approvals={data?.pendingApprovals || []} />
          <ProjectWatchSection riskProjects={data?.riskProjects || []} runningProjects={data?.projectsWithoutBudget || []} />
        </div>
      ) : (
        <EmployeeWeekSection hasMissingWeekdays={hasMissingWeekdays} missingWeekdays={missingWeekdays} pendingWeeks={data?.myPendingWeeks || []} />
      )}

      <RecentEntriesSection entries={data?.recentEntries || []} isManager={isManager} />
    </div>
  );
}

function SummaryLine({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-4 sm:px-4">
      <span className="mt-0.5 text-primary-700">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-graphite-500">{label}</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-graphite-950">{value}</p>
        <p className="mt-1 text-sm text-graphite-600">{detail}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 text-graphite-950">
        <span className="text-primary-700">{icon}</span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function DashboardTextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="shrink-0 text-sm font-semibold text-primary-700 hover:text-primary-600">
      {children}
    </Link>
  );
}

function ActionRow({ item }: { item: DashboardActionItem }) {
  return (
    <Link
      to={item.to}
      className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-3 transition hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 sm:px-4"
    >
      <div className="min-w-0">
        <p className="font-semibold text-graphite-950">{item.title}</p>
        <p className="mt-1 text-sm leading-5 text-graphite-600">{item.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge label={statusLabel(item.tone)} tone={item.tone} />
        <ArrowRight className="hidden h-4 w-4 text-graphite-400 sm:block" />
      </div>
    </Link>
  );
}

function PendingApprovalsSection({ approvals }: { approvals: WeekLock[] }) {
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<CheckCircle2 className="h-5 w-5" />}
        title="Attestkö"
        action={<DashboardTextLink to="/approval">Visa attest</DashboardTextLink>}
      />
      <div className="divide-y divide-graphite-200 border-y border-graphite-200 bg-white/90">
        {approvals.length ? (
          approvals.slice(0, 6).map((lock) => (
            <Link
              key={lock.id}
              to="/approval"
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-3 transition hover:bg-primary-50/60 sm:px-4"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-graphite-950">{lock.user?.name || 'Anställd'}</p>
                <p className="mt-1 text-sm text-graphite-600">
                  Vecka från {formatDate(lock.weekStartDate)}
                  {lock.totalHours != null ? ` · ${formatHours(lock.totalHours)}` : ''}
                </p>
              </div>
              <StatusBadge label="Väntar" tone="yellow" />
            </Link>
          ))
        ) : (
          <PlainEmpty title="Ingen attestkö" description="Alla inskickade veckor är hanterade." />
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
  ].slice(0, 8);

  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Projekt att följa"
        action={<DashboardTextLink to="/projects">Alla projekt</DashboardTextLink>}
      />
      <div className="overflow-x-auto border-y border-graphite-200 bg-white/90">
        {rows.length ? (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-graphite-200 bg-graphite-50 text-xs font-semibold uppercase tracking-wide text-graphite-500">
              <tr>
                <th className="px-3 py-2">Projekt</th>
                <th className="px-3 py-2">Kund</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {rows.map(({ project, tone, reason }) => (
                <tr key={`${reason}-${project.id}`} className="hover:bg-primary-50/60">
                  <td className="px-3 py-3">
                    <Link to={`/projects/${project.id}`} className="font-semibold text-graphite-950 hover:text-primary-700">
                      {project.code} · {project.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-graphite-600">{project.customer?.name || 'Intern'}</td>
                  <td className="px-3 py-3 text-right font-semibold text-graphite-950">
                    {project.metrics?.budgetUsagePercent == null ? '-' : formatPercent(project.metrics.budgetUsagePercent)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge label={reason} tone={tone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <PlainEmpty title="Inga projekt kräver extra koll" description="Budgetrisker och löpande projekt ser lugna ut just nu." />
        )}
      </div>
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
    <section className="space-y-3">
      <SectionHeader
        icon={<CalendarDays className="h-5 w-5" />}
        title="Min vecka"
        action={<DashboardTextLink to="/week">Öppna veckan</DashboardTextLink>}
      />
      <div className="divide-y divide-graphite-200 border-y border-graphite-200 bg-white/90">
        <div className="grid gap-3 px-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-4">
          <div>
            <p className="font-semibold text-graphite-950">
              {hasMissingWeekdays ? 'Dagar behöver kompletteras' : 'Rapporteringen är i fas'}
            </p>
            <p className="mt-1 text-sm text-graphite-600">
              {hasMissingWeekdays ? `Saknas: ${missingWeekdays.join(', ')}` : 'Alla vardagar hittills har rapporterad tid.'}
            </p>
          </div>
          <Link to={hasMissingWeekdays ? '/time-entry' : '/week'} className="btn-secondary justify-center">
            {hasMissingWeekdays ? 'Rapportera nu' : 'Visa veckan'}
          </Link>
        </div>

        {pendingWeeks.length > 0 && (
          <div className="px-3 py-4 sm:px-4">
            <p className="font-semibold text-graphite-950">Väntar på attest</p>
            <p className="mt-1 text-sm text-graphite-600">
              {pendingWeeks.length} inskickad {pendingWeeks.length === 1 ? 'vecka' : 'veckor'} väntar på granskning.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function RecentEntriesSection({ entries, isManager }: { entries: TimeEntry[]; isManager: boolean }) {
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<FileText className="h-5 w-5" />}
        title="Senaste tidrader"
        action={<DashboardTextLink to={isManager ? '/team-week' : '/week'}>Visa mer</DashboardTextLink>}
      />
      <div className="overflow-x-auto border-y border-graphite-200 bg-white/90">
        {entries.length ? (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-graphite-200 bg-graphite-50 text-xs font-semibold uppercase tracking-wide text-graphite-500">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Projekt</th>
                <th className="px-3 py-2">Aktivitet</th>
                <th className="px-3 py-2 text-right">Tid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-primary-50/60">
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-graphite-950">{formatDate(entry.date)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-graphite-700">{entry.user?.name || '-'}</td>
                  <td className="min-w-[13rem] px-3 py-3">
                    <Link to={`/time-entry?id=${entry.id}&return=/`} className="font-semibold text-graphite-950 hover:text-primary-700">
                      {entry.project?.code || 'Intern'} · {entry.project?.name || 'Intern tid'}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-graphite-600">{entry.activity?.name || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-graphite-950">{formatHours(entry.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <PlainEmpty title="Ingen tid rapporterad" description="När tid sparas visas de senaste raderna här." />
        )}
      </div>
    </section>
  );
}

function PlainEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-3 py-6 text-sm sm:px-4">
      <p className="font-semibold text-graphite-950">{title}</p>
      {description && <p className="mt-1 text-graphite-600">{description}</p>}
    </div>
  );
}

function buildActionRows({
  isManager,
  visibleActionItems,
  hasMissingWeekdays,
  missingWeekdays,
  pendingCount,
  riskCount,
  runningCount,
}: {
  isManager: boolean;
  visibleActionItems: DashboardActionItem[];
  hasMissingWeekdays: boolean;
  missingWeekdays: string[];
  pendingCount: number;
  riskCount: number;
  runningCount: number;
}): DashboardActionItem[] {
  if (isManager && visibleActionItems.length) return visibleActionItems;

  if (isManager) {
    return [
      {
        id: 'manager-status-ok',
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
    if (riskCount) return `${riskCount} ${riskCount === 1 ? 'projekt behöver' : 'projekt behöver'} följas upp.`;
    if (runningCount) return `${runningCount} löpande ${runningCount === 1 ? 'projekt är' : 'projekt är'} aktiva.`;
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
