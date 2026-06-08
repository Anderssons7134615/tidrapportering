import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, FileText, Sparkles, TrendingUp } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { AppShell, Card, EmptyState, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
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

  return (
    <AppShell>
      <PageHeader
        title={isManager ? 'Översikt för chef' : 'Min översikt'}
        description={
          isManager
            ? 'Följ timmar, attestläge och projektstatus på ett ställe.'
            : 'Rapportera tid snabbt och håll koll på veckan.'
        }
        action={
          <Link to="/time-entry" className="btn-primary">
            <Clock className="h-4 w-4" />
            Rapportera tid
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <NextStepCard
          to="/time-entry"
          icon={<Clock className="h-5 w-5" />}
          eyebrow="Snabbast nu"
          title="Rapportera dagens tid"
          description="Stor knapp, färre klick och snabbval för timmar/projekt."
          primary
        />
        <NextStepCard
          to={isManager ? '/approval' : '/week'}
          icon={isManager ? <CheckCircle2 className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
          eyebrow={isManager ? 'Attest' : 'Vecka'}
          title={isManager ? `${data?.summary.pendingApprovalCount || 0} veckor att hantera` : 'Öppna min vecka'}
          description={isManager ? 'Granska och attestera veckor innan rapporterna tas ut.' : 'Se om veckan är komplett innan du skickar in.'}
        />
        <NextStepCard
          to={isManager ? '/reports' : '/week'}
          icon={isManager ? <FileText className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
          eyebrow={isManager ? 'Rapporter' : 'Uppföljning'}
          title={isManager ? 'Ta fram rapport' : 'Kolla veckoläge'}
          description={isManager ? 'Ta fram löne- och kontrollunderlag för timmar.' : 'Se direkt vilka dagar som saknar rapporterad tid.'}
        />
      </div>

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
            <EmptyState title="Veckan ser komplett ut" description="Bra jobbat — alla vardagar hittills har rapporterad tid." />
          )}
        </Card>
      )}

      {isManager && (
        <div className="premium-panel overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-5 sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-300/25 bg-primary-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-100">
                <Sparkles className="h-3.5 w-3.5 text-primary-300" />
                Dagens koll
              </div>
              <h2 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight sm:text-4xl">
                {data?.summary.pendingApprovalCount
                  ? `${data.summary.pendingApprovalCount} veckor väntar på attest`
                  : data?.summary.projectsWithoutBudgetCount
                    ? `${data.summary.projectsWithoutBudgetCount} löpande projekt`
                    : data?.summary.riskProjectCount
                      ? `${data.summary.riskProjectCount} projekt behöver granskas`
                      : 'Allt ser lugnt ut just nu'}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-200">
                Här får du snabbaste vägen till det som påverkar lön, tidrapportering och projektkontroll mest.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={
                    data?.summary.pendingApprovalCount
                      ? '/approval'
                      : data?.summary.projectsWithoutBudgetCount || data?.summary.riskProjectCount
                        ? '/projects'
                        : '/team-week'
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-950/25 transition hover:-translate-y-0.5 hover:bg-primary-400"
                >
                  Öppna åtgärder
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/team-week"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15"
                >
                  Teamvecka
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px bg-white/10 lg:grid-cols-1">
              <DashboardPulse label="Ej attesterade" value={data?.summary.pendingApprovalCount || 0} tone="amber" />
              <DashboardPulse label="Projekt i risk" value={data?.summary.riskProjectCount || 0} tone="rose" />
              <DashboardPulse label="Löpande jobb" value={data?.summary.projectsWithoutBudgetCount || 0} tone="sky" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Timmar denna vecka" value={formatHours(data?.summary.weeklyHours)} tone="orange" />
        <KpiCard label="Timmar denna månad" value={formatHours(data?.summary.monthlyHours)} tone="slate" />
        {isManager && (
          <>
            <KpiCard label="Väntar attest" value={data?.summary.pendingApprovalCount || 0} tone="yellow" />
            <KpiCard label="Projekt i risk" value={data?.summary.riskProjectCount || 0} tone="red" />
            <KpiCard label="Löpande projekt" value={data?.summary.projectsWithoutBudgetCount || 0} tone="green" />
          </>
        )}
      </div>

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
                  <Link key={item.id} to={item.to} className="flex items-center justify-between rounded-lg border border-graphite-200 bg-graphite-50 px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary-200 hover:bg-white hover:shadow-md">
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
    </AppShell>
  );
}

function NextStepCard({
  to,
  icon,
  eyebrow,
  title,
  description,
  primary = false,
}: {
  to: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-xl border p-4 shadow-soft ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
        primary
          ? 'border-graphite-900 bg-graphite-950 text-white shadow-primary-950/20 ring-primary-300/20'
          : 'border-white/70 bg-white/90 text-graphite-950 ring-graphite-200/45 hover:border-primary-200'
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-px ${primary ? 'bg-primary-300/70' : 'bg-gradient-to-r from-primary-400/0 via-primary-400/50 to-emerald-400/0'}`} />
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg shadow-sm ${primary ? 'bg-white text-graphite-950 ring-1 ring-white/20' : 'bg-graphite-950 text-white'}`}>
        {icon}
      </div>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${primary ? 'text-primary-100' : 'text-primary-700'}`}>{eyebrow}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        <ArrowRight className={`mt-1 h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 ${primary ? 'text-primary-100' : 'text-primary-600'}`} />
      </div>
      <p className={`mt-2 text-sm leading-6 ${primary ? 'text-primary-50' : 'text-graphite-600'}`}>{description}</p>
    </Link>
  );
}

function DashboardPulse({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'rose' | 'sky';
}) {
  const toneClass = tone === 'amber' ? 'text-amber-300' : tone === 'rose' ? 'text-rose-300' : 'text-sky-300';

  return (
    <div className="bg-white/[0.055] p-4 ring-1 ring-white/5 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
    </div>
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
