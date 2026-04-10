import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import type { DashboardMetric } from '../types';

type StatCard = {
  icon: typeof Clock;
  value: string;
  label: string;
  tone: string;
  metric: DashboardMetric;
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { pendingEntries, isOnline } = useOfflineStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(user?.role || '');
  const firstName = user?.name?.split(' ')[0] || 'Hej';
  const currentDate = format(new Date(), 'EEEE d MMMM yyyy', { locale: sv });
  const maxDailyHours = Math.max(...Object.values(data?.dailyHours || { mon: 0 }), 1);

  const stats: StatCard[] = [
    {
      icon: Clock,
      value: `${data?.summary.weeklyHours.toFixed(1)} h`,
      label: 'Denna vecka',
      tone: 'bg-sky-100 text-sky-700',
      metric: 'weekly-hours',
    },
    {
      icon: TrendingUp,
      value: `${data?.summary.monthlyHours.toFixed(1)} h`,
      label: 'Denna månad',
      tone: 'bg-emerald-100 text-emerald-700',
      metric: 'monthly-hours',
    },
    {
      icon: CheckCircle,
      value: `${data?.summary.monthlyBillableHours.toFixed(1)} h`,
      label: 'Fakturerbart',
      tone: 'bg-violet-100 text-violet-700',
      metric: 'billable-hours',
    },
    ...(isAdminOrSupervisor
      ? [
          {
            icon: AlertCircle,
            value: `${data?.summary.pendingApprovalCount || 0}`,
            label: 'Att attestera',
            tone: 'bg-amber-100 text-amber-700',
            metric: 'pending-approval' as DashboardMetric,
          },
        ]
      : []),
  ];

  const quickLinks = [
    {
      to: '/time-entry',
      title: 'Rapportera tid',
      description: 'Lägg till ny tidrad direkt',
      tone: 'bg-slate-900 text-white',
    },
    {
      to: '/week',
      title: 'Min vecka',
      description: 'Se och justera det du registrerat',
      tone: 'bg-white text-slate-900 border border-slate-200',
    },
    ...(isAdminOrSupervisor
      ? [
          {
            to: '/approval',
            title: 'Attestera',
            description: 'Hantera veckor som väntar',
            tone: 'bg-amber-50 text-amber-900 border border-amber-200',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <section className="hero-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{currentDate}</span>
              {!isOnline && (
                <span className="chip border-amber-200 bg-amber-50 text-amber-700">
                  <WifiOff className="h-3.5 w-3.5" />
                  Offline {pendingEntries.length > 0 ? `(${pendingEntries.length} i kö)` : ''}
                </span>
              )}
            </div>
            <div>
              <h1 className="page-title">God arbetsdag, {firstName}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Allt viktigt för dagen på ett ställe. Hoppa vidare till rapportering, veckovy eller attest utan att leta.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[24rem]">
            {quickLinks.map((link) => (
              <Link key={link.to} to={link.to} className={`rounded-2xl px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${link.tone}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{link.title}</p>
                    <p className="mt-1 text-xs opacity-80">{link.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
          >
            <Link to={`/overview/details/${stat.metric}`} className="stat-card block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-2xl p-3 ${stat.tone}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight text-slate-900">{stat.value}</p>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title flex items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-slate-500" />
              Veckoöversikt
            </h2>
            <Link to="/week" className="text-sm font-semibold text-primary-700 hover:text-primary-600">
              Öppna veckan
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Object.entries(data?.dailyHours || {}).map(([date, hours]) => {
              const day = new Date(date);
              const isToday = format(new Date(), 'yyyy-MM-dd') === date;
              const height = Math.max((hours / maxDailyHours) * 100, hours > 0 ? 16 : 6);
              return (
                <div
                  key={date}
                  className={`rounded-2xl border p-2 text-center ${isToday ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-slate-50'}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {format(day, 'EEE', { locale: sv })}
                  </p>
                  <div className="mx-auto mt-3 flex h-24 w-7 items-end justify-center rounded-full bg-white/80 p-1">
                    <div
                      className={`w-full rounded-full ${isToday ? 'bg-primary-600' : 'bg-slate-300'}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{hours.toFixed(1)} h</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {user?.role === 'EMPLOYEE' && data?.myPendingWeeks && data.myPendingWeeks.length > 0 && (
            <div className="card border-amber-200 bg-amber-50/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="section-title text-amber-900">Veckor att skicka in</h2>
                <span className="badge-yellow">{data.myPendingWeeks.length} öppna</span>
              </div>
              <div className="space-y-2">
                {data.myPendingWeeks.map((weekStart) => (
                  <Link
                    key={weekStart}
                    to={`/week?date=${weekStart}`}
                    className="flex items-center justify-between rounded-2xl border border-amber-200 bg-white px-4 py-3 transition hover:bg-amber-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">Vecka {format(new Date(weekStart), 'w', { locale: sv })}</p>
                      <p className="text-sm text-slate-500">{format(new Date(weekStart), 'd MMM', { locale: sv })}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-amber-700" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {isAdminOrSupervisor && data?.pendingApprovals && data.pendingApprovals.length > 0 && (
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">Att attestera</h2>
                <Link to="/overview/details/pending-approval" className="text-sm font-semibold text-primary-700 hover:text-primary-600">
                  Visa alla
                </Link>
              </div>
              <div className="space-y-3">
                {data.pendingApprovals.slice(0, 4).map((lock) => (
                  <Link
                    key={lock.id}
                    to="/approval"
                    className="surface-muted flex items-center justify-between px-4 py-3 transition hover:bg-white"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{lock.user?.name}</p>
                      <p className="text-sm text-slate-500">Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })}</p>
                    </div>
                    <span className="badge-yellow">Väntar</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {isAdminOrSupervisor && data?.recentEntries && data.recentEntries.length > 0 && (
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">Senast rapporterat</h2>
                <Link to="/team-week" className="text-sm font-semibold text-primary-700 hover:text-primary-600">
                  Teamvecka
                </Link>
              </div>
              <div className="space-y-3">
                {data.recentEntries.map((entry) => (
                  <div key={entry.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {entry.user?.name || 'Okänd'} - {entry.project?.name || 'Intern'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {format(new Date(entry.date), 'EEE d MMM', { locale: sv })} - {entry.activity?.name || 'Tid'}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-slate-900">{entry.hours.toFixed(1)} h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isOnline && pendingEntries.length > 0 && (
            <div className="card border-sky-200 bg-sky-50/80">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                  <WifiOff className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Offlinekö aktiv</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {pendingEntries.length} rad(er) ligger sparade lokalt och skickas upp automatiskt när du är online igen.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
