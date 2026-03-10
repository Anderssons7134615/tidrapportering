import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, TrendingUp, CheckCircle, AlertCircle, FolderKanban, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardSkeleton } from '../components/ui/Skeleton';

export default function Dashboard() {
  const { user } = useAuthStore();
  useSync();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(user?.role || '');

  const stats = [
    {
      icon: Clock,
      iconClass: 'text-sky-700',
      iconBg: 'bg-sky-100',
      value: data?.summary.weeklyHours.toFixed(1),
      label: 'Denna vecka',
    },
    {
      icon: TrendingUp,
      iconClass: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      value: data?.summary.monthlyHours.toFixed(1),
      label: 'Denna månad',
    },
    {
      icon: CheckCircle,
      iconClass: 'text-violet-700',
      iconBg: 'bg-violet-100',
      value: data?.summary.monthlyBillableHours.toFixed(1),
      label: 'Fakturerbart',
    },
    ...(isAdminOrSupervisor
      ? [
          {
            icon: AlertCircle,
            iconClass: 'text-amber-700',
            iconBg: 'bg-amber-100',
            value: data?.summary.pendingApprovalCount,
            label: 'Att attestera',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Hej, {user?.name?.split(' ')[0]}!</h1>
        <p className="text-sm text-slate-500">{format(new Date(), 'EEEE d MMMM yyyy', { locale: sv })}</p>
      </div>

      <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.05 } } }}>
        {stats.map((stat, i) => (
          <motion.div key={i} className="card" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2.5 ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.iconClass}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight text-slate-900">{stat.value}</p>
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {data?.dailyHours && (
        <div className="card space-y-4">
          <h2 className="section-title flex items-center gap-2">
            <Calendar className="h-4.5 w-4.5 text-slate-500" />
            Veckoöversikt
          </h2>
          <div className="grid grid-cols-7 gap-2">
            {Object.entries(data.dailyHours).map(([date, hours]) => {
              const day = new Date(date);
              const isToday = format(new Date(), 'yyyy-MM-dd') === date;
              return (
                <div key={date} className={`rounded-xl border p-2 text-center ${isToday ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{format(day, 'EEE', { locale: sv })}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{hours.toFixed(1)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data?.projects && data.projects.length > 0 && (
        <div className="card space-y-4">
          <h2 className="section-title flex items-center gap-2">
            <FolderKanban className="h-4.5 w-4.5 text-slate-500" />
            Projektläge
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.projects.map((project) => {
              const budgetUsed = project.budgetUsedPercent ?? 0;
              return (
                <Link key={project.id} to={`/projects/${project.id}`} className="surface-muted block p-4 transition hover:border-primary-300 hover:bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{project.name}</p>
                      <p className="truncate text-xs text-slate-500">{project.code}{project.customerName ? ` · ${project.customerName}` : ''}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-sm font-semibold text-slate-900">{project.totalHours.toFixed(1)} h</p>
                      <p className="text-slate-500">totalt</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600"><span>Denna månad</span><span className="font-semibold">{project.monthlyHours.toFixed(1)} h</span></div>
                    <div className="flex items-center justify-between text-slate-600"><span>Kvar timmar</span><span className="font-semibold">{project.remainingHours !== null && project.remainingHours !== undefined ? `${project.remainingHours.toFixed(1)} h` : 'Ingen budget'}</span></div>
                    <div className="flex items-center justify-between text-slate-600"><span>Ekonomi (använt/kvar)</span><span className="font-semibold">{project.economicUsed !== null && project.economicUsed !== undefined ? `${project.economicUsed.toFixed(0)} / ${(project.economicRemaining || 0).toFixed(0)} kr` : 'Sätt timpris'}</span></div>
                    {project.budgetHours && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${budgetUsed > 90 ? 'bg-rose-500' : budgetUsed > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(budgetUsed, 100)}%` }} />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {user?.role === 'EMPLOYEE' && data?.myPendingWeeks && data.myPendingWeeks.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/70">
          <h2 className="section-title mb-3 text-amber-900">Veckor att skicka in</h2>
          <div className="space-y-2">
            {data.myPendingWeeks.map((weekStart) => (
              <Link key={weekStart} to={`/week?date=${weekStart}`} className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-3 py-2.5 transition hover:bg-amber-50">
                <span className="font-medium text-slate-800">Vecka {format(new Date(weekStart), 'w', { locale: sv })}</span>
                <span className="text-sm text-slate-500">{format(new Date(weekStart), 'd MMM', { locale: sv })}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isAdminOrSupervisor && data?.pendingApprovals && data.pendingApprovals.length > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Att attestera</h2>
            <Link to="/approval" className="text-sm font-semibold text-primary-700 hover:text-primary-600">Visa alla</Link>
          </div>
          <div className="space-y-2">
            {data.pendingApprovals.slice(0, 3).map((lock) => (
              <div key={lock.id} className="surface-muted flex items-center justify-between px-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">{lock.user?.name}</p>
                  <p className="text-sm text-slate-500">Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })}</p>
                </div>
                <span className="badge-yellow">Väntar</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/time-entry" className="card flex items-center gap-3 transition hover:shadow-md">
          <div className="rounded-xl bg-primary-100 p-3"><Clock className="h-5 w-5 text-primary-700" /></div>
          <div><p className="font-semibold text-slate-900">Rapportera tid</p><p className="text-sm text-slate-500">Ny tidrad</p></div>
        </Link>

        <Link to="/week" className="card flex items-center gap-3 transition hover:shadow-md">
          <div className="rounded-xl bg-emerald-100 p-3"><Calendar className="h-5 w-5 text-emerald-700" /></div>
          <div><p className="font-semibold text-slate-900">Min vecka</p><p className="text-sm text-slate-500">Översikt & attest</p></div>
        </Link>
      </div>
    </div>
  );
}
