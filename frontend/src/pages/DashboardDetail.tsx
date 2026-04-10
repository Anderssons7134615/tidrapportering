import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ChevronRight, Clock, FolderKanban, Receipt, User2 } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { DashboardMetric } from '../types';

const validMetrics: DashboardMetric[] = ['weekly-hours', 'monthly-hours', 'billable-hours', 'pending-approval'];

export default function DashboardDetail() {
  const { metric } = useParams<{ metric: DashboardMetric }>();
  const { user } = useAuthStore();

  if (!metric || !validMetrics.includes(metric)) {
    return <Navigate to="/" replace />;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'drilldown', metric],
    queryFn: () => dashboardApi.getDrilldown(metric),
  });

  if (isLoading) {
    return <div className="card">Laddar detaljer...</div>;
  }

  if (error || !data) {
    return <div className="card text-rose-700">Kunde inte hämta detaljer för översikten.</div>;
  }

  const isManager = ['ADMIN', 'SUPERVISOR'].includes(user?.role || '');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="btn-secondary inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till översikt
        </Link>
      </div>

      <section className="hero-card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="page-title">{data.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{data.description}</p>
          </div>
          <div className="chip">
            {format(new Date(data.period.start), 'd MMM yyyy', { locale: sv })} - {format(new Date(data.period.end), 'd MMM yyyy', { locale: sv })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="surface-muted p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Totalt</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {data.kind === 'pending-approvals' ? data.totalCount : `${data.totalHours.toFixed(1)} h`}
            </p>
          </div>
          <div className="surface-muted p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Visning</p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {data.kind === 'pending-approvals'
                ? 'Väntande veckor'
                : isManager
                  ? 'Företagets rapporterade rader'
                  : 'Dina rapporterade rader'}
            </p>
          </div>
        </div>
      </section>

      {data.kind === 'weekly-user-summary' ? (
        <div className="card">
          {data.users.length === 0 ? (
            <p className="text-sm text-slate-500">Inga tider hittades för den valda veckan.</p>
          ) : (
            <div className="space-y-2">
              {data.users.map((summary) => (
                <div key={summary.userId} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 lg:w-44">
                      <p className="truncate font-semibold text-slate-900">{summary.userName}</p>
                      <p className="text-sm text-slate-500">{summary.totalHours.toFixed(1)} h totalt</p>
                    </div>
                    <div className="grid flex-1 grid-cols-7 gap-1">
                      {summary.days.map((day) => (
                        <div key={`${summary.userId}-${day.date}`} className="min-h-16 rounded-lg bg-slate-50 px-2 py-2 text-center">
                          <p className="text-[11px] font-semibold uppercase text-slate-500">
                            {format(new Date(day.date), 'EEE', { locale: sv })}
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{day.hours > 0 ? `${day.hours.toFixed(1)} h` : '-'}</p>
                          {day.projectCodes.length > 0 && (
                            <p className="mt-1 truncate text-[11px] text-slate-500" title={day.projectNames.join(', ')}>
                              {day.projectCodes.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <Link
                      to={`/week?date=${format(new Date(data.period.start), 'yyyy-MM-dd')}&userId=${summary.userId}`}
                      className="btn-secondary inline-flex shrink-0"
                    >
                      Öppna/rätta
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : data.kind === 'pending-approvals' ? (
        <div className="card space-y-3">
          {data.approvals.length === 0 ? (
            <p className="text-sm text-slate-500">Det finns inga veckor att attestera just nu.</p>
          ) : (
            data.approvals.map((approval) => (
              <Link
                key={approval.id}
                to="/approval"
                className="surface-muted flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-white"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{approval.user?.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Vecka {format(new Date(approval.weekStartDate), 'w', { locale: sv })} • {format(new Date(approval.weekStartDate), 'd MMM', { locale: sv })}
                  </p>
                </div>
                <div className="text-right text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">{approval.totalHours?.toFixed(1)} h</p>
                  <p>{approval.entryCount || 0} rader</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="card">
          {data.entries.length === 0 ? (
            <p className="text-sm text-slate-500">Inga tidsrader hittades för den valda perioden.</p>
          ) : (
            <div className="space-y-3">
              {data.entries.map((entry) => (
                <div key={entry.id} className="surface-muted px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {format(new Date(entry.date), 'EEEE d MMM', { locale: sv })}
                        </span>
                        <span className={entry.billable ? 'badge-green' : 'badge-gray'}>
                          {entry.billable ? 'Fakturerbar' : 'Ej fakturerbar'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                        {isManager && entry.user?.name && (
                          <span className="inline-flex items-center gap-1.5">
                            <User2 className="h-4 w-4" />
                            {entry.user.name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <FolderKanban className="h-4 w-4" />
                          {entry.project ? `${entry.project.code} - ${entry.project.name}` : 'Intern tid'}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Receipt className="h-4 w-4" />
                          {entry.activity?.name || 'Aktivitet saknas'}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {entry.hours.toFixed(1)} h
                        </span>
                      </div>
                      {entry.note && <p className="mt-3 text-sm text-slate-600">{entry.note}</p>}
                    </div>
                    <Link
                      to={`/week?date=${format(new Date(entry.date), 'yyyy-MM-dd')}`}
                      className="btn-secondary inline-flex shrink-0"
                    >
                      Öppna veckan
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
