import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, FileText, Receipt, TrendingUp } from 'lucide-react';
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Timmar denna vecka" value={formatHours(data?.summary.weeklyHours)} tone="blue" />
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
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 className="section-title">Behöver åtgärd</h2>
            </div>
            {!data?.actionItems?.length ? (
              <EmptyState title="Inget akut just nu" description="Budgetar, attest och riskprojekt ser lugna ut." />
            ) : (
              <div className="space-y-2">
                {data.actionItems.map((item) => (
                  <Link key={item.id} to={item.to} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-white hover:shadow-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-500">{item.description}</p>
                    </div>
                    <StatusBadge label={item.tone === 'red' ? 'Risk' : 'Varning'} tone={item.tone} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-rose-600" />
              <h2 className="section-title">Riskprojekt</h2>
            </div>
            {!data?.riskProjects?.length ? (
              <EmptyState title="Inga riskprojekt" description="Inga aktiva projekt ligger nära eller över budget." />
            ) : (
              <div className="space-y-2">
                {data.riskProjects.map((project) => (
                  <Link key={project.id} to={`/projects/${project.id}`} className="block rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3 hover:bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{project.name}</p>
                        <p className="text-sm text-slate-600">{project.code} · {project.customer?.name || 'Intern'}</p>
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
            <Link to={isManager ? '/team-week' : '/week'} className="text-sm font-semibold text-primary-700">Visa mer</Link>
          </div>
          {!data?.recentEntries?.length ? (
            <EmptyState title="Ingen tid rapporterad" description="När tid sparas visas de senaste raderna här." />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentEntries.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{entry.project?.name || 'Intern tid'}</p>
                    <p className="text-sm text-slate-500">{entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'} · {formatDate(entry.date)}</p>
                  </div>
                  <p className="font-semibold text-slate-900">{formatHours(entry.hours)}</p>
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
                  <Link key={lock.id} to="/approval" className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50">
                    <div>
                      <p className="font-semibold text-slate-900">{lock.user?.name}</p>
                      <p className="text-sm text-slate-500">Vecka {new Date(lock.weekStartDate).toLocaleDateString('sv-SE')}</p>
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
