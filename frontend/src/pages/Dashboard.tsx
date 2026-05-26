import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileText, Receipt, Sparkles, TrendingUp } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { AppShell, Card, EmptyState, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
import { formatCurrency, formatDate, formatHours } from '../utils/format';

export default function Dashboard() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) return <DashboardSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title={isManager ? 'Översikt för chef' : 'Min översikt'}
        description={
          isManager
            ? 'Följ timmar, attest, budgetrisk och fakturerbart värde på ett ställe.'
            : 'Rapportera tid snabbt och håll koll på veckan.'
        }
        action={
          <Link to="/time-entry" className="btn-primary">
            <Clock className="h-4 w-4" />
            Rapportera tid
          </Link>
        }
      />

      {isManager && (
        <div className="premium-panel overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-5 sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-300/25 bg-primary-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-100">
                <Sparkles className="h-3.5 w-3.5 text-primary-300" />
                Dagens koll
              </div>
              <h2 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight sm:text-4xl">
                {data?.summary.pendingApprovalCount
                  ? `${data.summary.pendingApprovalCount} veckor väntar på attest`
                  : data?.summary.projectsWithoutBudgetCount
                    ? `${data.summary.projectsWithoutBudgetCount} projekt saknar budget`
                    : data?.summary.riskProjectCount
                      ? `${data.summary.riskProjectCount} projekt behöver granskas`
                      : 'Allt ser lugnt ut just nu'}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-200">
                Här får du snabbaste vägen till det som påverkar lön, fakturering och projektkontroll mest.
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
              <DashboardPulse label="Utan budget" value={data?.summary.projectsWithoutBudgetCount || 0} tone="sky" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Timmar denna vecka" value={formatHours(data?.summary.weeklyHours)} tone="orange" />
        <KpiCard label="Fakturerbara timmar" value={formatHours(data?.summary.weeklyBillableHours)} tone="green" />
        <KpiCard label="Fakturerbart värde" value={formatCurrency(data?.summary.weeklyBillableValue)} tone="green" />
        <KpiCard label="Timmar denna månad" value={formatHours(data?.summary.monthlyHours)} tone="slate" />
        {isManager && (
          <>
            <KpiCard label="Väntar attest" value={data?.summary.pendingApprovalCount || 0} tone="yellow" />
            <KpiCard label="Projekt i risk" value={data?.summary.riskProjectCount || 0} tone="red" />
            <KpiCard label="Projekt utan budget" value={data?.summary.projectsWithoutBudgetCount || 0} tone="yellow" />
            <KpiCard label="Fakturerbart månaden" value={formatHours(data?.summary.monthlyBillableHours)} tone="green" />
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
            {!data?.actionItems?.length ? (
              <EmptyState title="Inget akut just nu" description="Budgetar, attest och riskprojekt ser lugna ut." />
            ) : (
              <div className="space-y-2">
                {data.actionItems.map((item) => (
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
                <div key={entry.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg px-2 py-3 transition hover:bg-primary-50/60">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-graphite-950">{entry.project?.name || 'Intern tid'}</p>
                    <p className="text-sm text-graphite-500">{entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'} · {formatDate(entry.date)}</p>
                  </div>
                  <p className="font-semibold text-graphite-950">{formatHours(entry.hours)}</p>
                </div>
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
              <Link to="/projects" className="btn-secondary"><Receipt className="h-4 w-4" /> Projekt</Link>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
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
    <div className="bg-graphite-950/70 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
    </div>
  );
}
