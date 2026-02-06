import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Clock,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  FolderKanban,
  Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardSkeleton } from '../components/ui/Skeleton';

export default function Dashboard() {
  const { user } = useAuthStore();
  useSync(); // Synka offline-data

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const isAdminOrSupervisor = ['ADMIN', 'SUPERVISOR'].includes(user?.role || '');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Hej, {user?.name?.split(' ')[0]}!</h1>
        <p className="text-gray-400 text-sm">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
        </p>
      </div>

      {/* Quick stats */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
      >
        {[
          { icon: Clock, bg: 'bg-blue-900/30', color: 'text-blue-400', value: data?.summary.weeklyHours.toFixed(1), label: 'Denna vecka' },
          { icon: TrendingUp, bg: 'bg-green-900/30', color: 'text-green-400', value: data?.summary.monthlyHours.toFixed(1), label: 'Denna månad' },
          { icon: CheckCircle, bg: 'bg-purple-900/30', color: 'text-purple-400', value: data?.summary.monthlyBillableHours.toFixed(1), label: 'Fakturerbart' },
          ...(isAdminOrSupervisor ? [{ icon: AlertCircle, bg: 'bg-yellow-900/30', color: 'text-yellow-400', value: data?.summary.pendingApprovalCount, label: 'Att attestera' }] : []),
        ].map((stat, i) => (
          <motion.div
            key={i}
            className="card"
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 ${stat.bg} rounded-lg`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-gray-400">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Veckoöversikt */}
      {data?.dailyHours && (
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            Veckoöversikt
          </h2>
          <div className="grid grid-cols-7 gap-2">
            {Object.entries(data.dailyHours).map(([date, hours]) => {
              const d = new Date(date);
              const isToday = format(new Date(), 'yyyy-MM-dd') === date;
              return (
                <div
                  key={date}
                  className={`text-center p-2 rounded-lg ${
                    isToday ? 'bg-primary-900/30 border-2 border-primary-700' : 'bg-gray-800'
                  }`}
                >
                  <p className="text-xs text-gray-400">
                    {format(d, 'EEE', { locale: sv })}
                  </p>
                  <p className="font-bold text-lg">{hours.toFixed(1)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mina ej inskickade veckor */}
      {user?.role === 'EMPLOYEE' && data?.myPendingWeeks && data.myPendingWeeks.length > 0 && (
        <div className="card border-yellow-800 bg-yellow-900/20">
          <h2 className="font-semibold mb-3 text-yellow-300">Veckor att skicka in</h2>
          <div className="space-y-2">
            {data.myPendingWeeks.map((weekStart) => (
              <Link
                key={weekStart}
                to={`/week?date=${weekStart}`}
                className="flex items-center justify-between p-2 bg-gray-800 rounded-lg hover:bg-gray-700"
              >
                <span>
                  Vecka {format(new Date(weekStart), 'w', { locale: sv })}
                </span>
                <span className="text-sm text-gray-400">
                  {format(new Date(weekStart), 'd MMM', { locale: sv })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projekt med budget */}
      {isAdminOrSupervisor && data?.projects && data.projects.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-gray-500" />
            Pågående projekt
          </h2>
          <div className="space-y-3">
            {data.projects.slice(0, 5).map((project) => (
              <div key={project.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium truncate">{project.name}</p>
                    <span className="text-sm text-gray-400">
                      {project.totalHours.toFixed(1)}h
                      {project.budgetHours && ` / ${project.budgetHours}h`}
                    </span>
                  </div>
                  {project.budgetHours && (
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          project.budgetUsedPercent! > 90
                            ? 'bg-red-500'
                            : project.budgetUsedPercent! > 75
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(project.budgetUsedPercent || 0, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Att attestera */}
      {isAdminOrSupervisor && data?.pendingApprovals && data.pendingApprovals.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Att attestera</h2>
            <Link to="/approval" className="text-primary-400 text-sm font-medium">
              Visa alla
            </Link>
          </div>
          <div className="space-y-2">
            {data.pendingApprovals.slice(0, 3).map((lock) => (
              <div
                key={lock.id}
                className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="font-medium">{lock.user?.name}</p>
                  <p className="text-sm text-gray-400">
                    Vecka {format(new Date(lock.weekStartDate), 'w', { locale: sv })}
                  </p>
                </div>
                <span className="badge-yellow">Väntar</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/time-entry"
          className="card hover:shadow-md transition-shadow flex items-center gap-3 text-left"
        >
          <div className="p-3 bg-primary-900/30 rounded-xl">
            <Clock className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <p className="font-semibold">Rapportera tid</p>
            <p className="text-sm text-gray-400">Ny tidrad</p>
          </div>
        </Link>

        <Link
          to="/week"
          className="card hover:shadow-md transition-shadow flex items-center gap-3 text-left"
        >
          <div className="p-3 bg-green-900/30 rounded-xl">
            <Calendar className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="font-semibold">Min vecka</p>
            <p className="text-sm text-gray-400">Översikt & attest</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
