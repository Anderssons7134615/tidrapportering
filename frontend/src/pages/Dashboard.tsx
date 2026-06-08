import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, FileText, Sparkles, TrendingUp } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { Card, EmptyState, StatusBadge } from '../components/ui/design';
import { formatDate, formatHours } from '../utils/format';

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
  const primaryTarget = pendingCount ? '/approval' : runningCount || riskCount ? '/projects' : isManager ? '/team-week' : '/time-entry';
  const primaryLabel = pendingCount ? 'Öppna attest' : runningCount || riskCount ? 'Granska projekt' : isManager ? 'Öppna teamvecka' : 'Rapportera tid';

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="dashboard-command">
        <div className="grid gap-0 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="p-5 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex rounded-xl bg-white px-4 py-3 shadow-lg shadow-black/20 ring-1 ring-primary-300/20">
                <img src="/anderssons-logo.svg" alt="Anderssons Isolering" className="h-10 w-64 max-w-full object-contain" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-100">
                  <Sparkles className="h-3.5 w-3.5 text-primary-200" />
                  Driftläge
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                  {isManager ? 'Chefsvy' : 'Min vy'}
                </span>
              </div>
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              {isManager
                ? pendingCount
                  ? `${pendingCount} ${pendingCount === 1 ? 'vecka väntar' : 'veckor väntar'} på attest`
                  : riskCount
                    ? `${riskCount} projekt behöver granskas`
                    : runningCount
                      ? `${runningCount} löpande projekt är aktiva`
                      : 'Allt ser stabilt ut'
                : hasMissingWeekdays
                  ? 'Veckan behöver kompletteras'
                  : 'Veckan är under kontroll'}
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-200">
              {isManager
                ? 'Fokusera på attest, timmar och projektläge. Det som kräver åtgärd ligger först.'
                : 'Rapportera snabbare, kontrollera veckan och gå vidare utan extra steg.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link to={primaryTarget} className="dashboard-primary-action">
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/time-entry" className="dashboard-secondary-action">
                <Clock className="h-4 w-4" />
                Rapportera tid
              </Link>
              {isManager && (
                <Link to="/team-week" className="dashboard-secondary-action">
                  <CalendarDays className="h-4 w-4" />
                  Teamvecka
                </Link>
              )}
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Vecka" value={formatHours(data?.summary.weeklyHours)} tone="blue" />
              <HeroMetric label="Månad" value={formatHours(data?.summary.monthlyHours)} tone="green" />
              <HeroMetric label={isManager ? 'Löpande' : 'Saknas'} value={isManager ? runningCount : missingWeekdays.length} tone={isManager ? 'sky' : hasMissingWeekdays ? 'amber' : 'green'} />
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.055] p-5 sm:p-6 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-graphite-300">Nästa åtgärd</p>
                <p className="mt-1 text-lg font-semibold text-white">{primaryLabel}</p>
              </div>
              <StatusBadge label={pendingCount || riskCount ? 'Aktivt' : 'OK'} tone={pendingCount || riskCount ? 'yellow' : 'green'} />
            </div>

            <div className="mt-5 grid gap-3">
              <CommandCard
                to={isManager ? '/approval' : '/week'}
                icon={isManager ? <CheckCircle2 className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                label={isManager ? 'Attest' : 'Vecka'}
                value={isManager ? `${pendingCount} väntar` : hasMissingWeekdays ? `${missingWeekdays.length} dagar saknas` : 'Komplett'}
                tone={pendingCount || hasMissingWeekdays ? 'amber' : 'green'}
              />
              <CommandCard
                to={isManager ? '/projects' : '/time-entry'}
                icon={<TrendingUp className="h-4 w-4" />}
                label={isManager ? 'Projektläge' : 'Rapportering'}
                value={isManager ? `${riskCount} risk / ${runningCount} löpande` : formatHours(data?.summary.weeklyHours)}
                tone={riskCount ? 'rose' : 'sky'}
              />
              <CommandCard
                to="/reports"
                icon={<FileText className="h-4 w-4" />}
                label="Rapporter"
                value="Löne- och kontrollunderlag"
                tone="slate"
              />
            </div>
          </div>
        </div>
      </section>

      {!isManager && (
        <Card className="accent-line">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Veckokoll</h2>
            <Link to="/week" className="text-sm font-semibold text-primary-700 hover:text-primary-600">Öppna min vecka</Link>
          </div>
          {hasMissingWeekdays ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="font-semibold text-amber-900">Du har dagar utan rapporterad tid</p>
              <p className="mt-1 text-sm text-amber-800">Saknas: {missingWeekdays.join(', ')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/time-entry" className="btn-primary">Rapportera nu</Link>
                <Link to="/week" className="btn-secondary">Visa veckan</Link>
              </div>
            </div>
          ) : (
            <EmptyState title="Veckan ser komplett ut" description="Alla vardagar hittills har rapporterad tid." />
          )}
        </Card>
      )}

      {isManager && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
          <Card className="accent-line">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary-600" />
              <h2 className="section-title">Behöver åtgärd</h2>
            </div>
            {!visibleActionItems.length ? (
              <EmptyState title="Inget akut just nu" description="Attest och riskprojekt ser lugna ut." />
            ) : (
              <div className="space-y-2">
                {visibleActionItems.map((item) => (
                  <Link key={item.id} to={item.to} className="group flex items-center justify-between rounded-lg border border-graphite-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md">
                    <div>
                      <p className="font-semibold text-graphite-950">{item.title}</p>
                      <p className="text-sm text-graphite-500">{item.description}</p>
                    </div>
                    <StatusBadge label={item.tone === 'red' ? 'Risk' : 'Varning'} tone={item.tone} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="accent-line">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-rose-600" />
              <h2 className="section-title">Riskprojekt</h2>
            </div>
            {!data?.riskProjects?.length ? (
              <EmptyState title="Inga riskprojekt" description="Inga aktiva projekt ligger nära eller över budget." />
            ) : (
              <div className="space-y-2">
                {data.riskProjects.map((project) => (
                  <Link key={project.id} to={`/projects/${project.id}`} className="block rounded-lg border border-rose-100 bg-rose-50/70 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-graphite-950">{project.name}</p>
                        <p className="text-sm text-graphite-600">{project.code} · {project.customer?.name || 'Intern'}</p>
                      </div>
                      <p className="font-semibold text-rose-700">{Math.round(project.metrics?.budgetUsagePercent || 0)} %</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Senaste rapporterade tidrader</h2>
            <Link to={isManager ? '/team-week' : '/week'} className="text-sm font-semibold text-primary-700 hover:text-primary-600">Visa mer</Link>
          </div>
          {!data?.recentEntries?.length ? (
            <EmptyState title="Ingen tid rapporterad" description="När tid sparas visas de senaste raderna här." />
          ) : (
            <div className="divide-y divide-graphite-100">
              {data.recentEntries.map((entry) => (
                <Link
                  key={entry.id}
                  to={`/time-entry?id=${entry.id}&return=/`}
                  className="grid grid-cols-[1fr_auto] gap-3 rounded-lg px-2 py-3 transition hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                  title="Öppna tidraden"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-graphite-950">{entry.project?.name || 'Intern tid'}</p>
                    <p className="text-sm text-graphite-500">{entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'} · {formatDate(entry.date)}</p>
                  </div>
                  <p className="font-semibold text-graphite-950">{formatHours(entry.hours)}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            {isManager ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <FileText className="h-5 w-5 text-sky-600" />}
            <h2 className="section-title">{isManager ? 'Att attestera' : 'Snabbvägar'}</h2>
          </div>
          {isManager ? (
            !data?.pendingApprovals?.length ? (
              <EmptyState title="Ingen attestkö" description="Alla inskickade veckor är hanterade." />
            ) : (
              <div className="space-y-2">
                {data.pendingApprovals.slice(0, 6).map((lock) => (
                  <Link key={lock.id} to="/approval" className="flex items-center justify-between rounded-lg border border-graphite-200 px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50/70">
                    <div>
                      <p className="font-semibold text-graphite-950">{lock.user?.name}</p>
                      <p className="text-sm text-graphite-500">Vecka {new Date(lock.weekStartDate).toLocaleDateString('sv-SE')}</p>
                    </div>
                    <StatusBadge label="Väntar" tone="yellow" />
                  </Link>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <Link to="/time-entry" className="btn-primary"><Clock className="h-4 w-4" /> Rapportera tid</Link>
              <Link to="/week" className="btn-secondary"><FileText className="h-4 w-4" /> Min vecka</Link>
              <Link to="/week" className="btn-secondary"><CalendarDays className="h-4 w-4" /> Veckostatus</Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, tone }: { label: string; value: ReactNode; tone: 'blue' | 'green' | 'sky' | 'amber' }) {
  const toneClass =
    tone === 'blue'
      ? 'text-sky-200'
      : tone === 'green'
        ? 'text-emerald-200'
        : tone === 'amber'
          ? 'text-amber-200'
          : 'text-cyan-200';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.075] p-4 shadow-sm ring-1 ring-white/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite-300">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
    </div>
  );
}

function CommandCard({
  to,
  icon,
  label,
  value,
  tone,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone: 'amber' | 'green' | 'rose' | 'sky' | 'slate';
}) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-300 text-amber-950'
      : tone === 'green'
        ? 'bg-emerald-300 text-emerald-950'
        : tone === 'rose'
          ? 'bg-rose-300 text-rose-950'
          : tone === 'sky'
            ? 'bg-sky-300 text-sky-950'
            : 'bg-white text-graphite-950';

  return (
    <Link to={to} className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.075] p-3 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-white/[0.11]">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-graphite-300">{label}</span>
        <span className="block truncate text-sm font-semibold text-white">{value}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-graphite-300 transition group-hover:translate-x-0.5 group-hover:text-white" />
    </Link>
  );
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
