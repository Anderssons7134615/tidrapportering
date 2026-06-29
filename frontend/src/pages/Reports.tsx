import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, format } from 'date-fns';
import { CalendarDays, Download, FileSpreadsheet, Search, Umbrella, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi, usersApi } from '../services/api';
import { ReportsSkeleton } from '../components/ui/Skeleton';
import { AppShell, Button, EmptyState, StatusBadge } from '../components/ui/design';
import { formatDate, formatHours } from '../utils/format';

type TimeKind = 'regular' | 'overtime' | 'vacation' | 'absence';

type PayrollActivity = {
  key: string;
  name: string;
  code: string;
  category?: string;
  kind: TimeKind;
  hours: number;
  entries: PayrollEntry[];
};

type PayrollEntry = {
  id: string;
  userId: string;
  user?: { id: string; name: string; email?: string };
  project?: { id: string; name: string; code: string } | null;
  activity?: { id: string; name: string; code: string; category?: string };
  date: string;
  hours: number;
  note?: string | null;
};

type EmployeePayrollRow = {
  userId: string;
  userName: string;
  email?: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  vacationHours: number;
  absenceHours: number;
  activities: PayrollActivity[];
  absenceEntries: PayrollEntry[];
};

function toDateInput(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function latestClosedPayrollPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentCutoff = new Date(year, month, 20);
  const end = referenceDate > currentCutoff ? currentCutoff : new Date(year, month - 1, 20);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 21);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function currentPayrollPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentCutoff = new Date(year, month, 20);
  const start = referenceDate > currentCutoff ? new Date(year, month, 21) : new Date(year, month - 1, 21);
  const nextMonth = addMonths(start, 1);
  const end = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function previousPayrollPeriod(fromDate: string) {
  const currentStart = new Date(fromDate);
  const end = new Date(currentStart.getFullYear(), currentStart.getMonth(), 20);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 21);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function normalize(value?: string | null) {
  return (value || '').toLowerCase();
}

function classifyActivity(activity?: PayrollEntry['activity']): TimeKind {
  const text = `${normalize(activity?.name)} ${normalize(activity?.code)}`;
  if (activity?.category === 'ABSENCE' && text.includes('semester')) return 'vacation';
  if (text.includes('semester')) return 'vacation';
  if (activity?.category === 'ABSENCE') return 'absence';
  if (text.includes('sjuk') || text.includes('vab') || text.includes('frånvaro') || text.includes('franvaro')) return 'absence';
  if (text.includes('övertid') || text.includes('overtid') || text.includes('ö-tid') || text.includes('ot ')) return 'overtime';
  return 'regular';
}

function kindLabel(kind: TimeKind) {
  if (kind === 'vacation') return 'Semester';
  if (kind === 'absence') return 'Frånvaro';
  if (kind === 'overtime') return 'Övertid';
  return 'Ordinarie';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function Reports() {
  const defaultPayrollPeriod = latestClosedPayrollPeriod();
  const [fromDate, setFromDate] = useState(defaultPayrollPeriod.from);
  const [toDate, setToDate] = useState(defaultPayrollPeriod.to);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [search, setSearch] = useState('');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingAccountant, setIsExportingAccountant] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupFromDate, setBackupFromDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [backupToDate, setBackupToDate] = useState(format(new Date(new Date().getFullYear(), 11, 31), 'yyyy-MM-dd'));

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: reportData, isLoading } = useQuery<any>({
    queryKey: ['report', 'payroll', fromDate, toDate, selectedUserId],
    queryFn: () => reportsApi.salary(fromDate, toDate, selectedUserId || undefined),
  });

  const payrollData = useMemo(() => {
    const entries = ((reportData?.entries || []) as PayrollEntry[]).slice().sort((a, b) => {
      const userCompare = (a.user?.name || '').localeCompare(b.user?.name || '', 'sv');
      if (userCompare !== 0) return userCompare;
      return a.date.localeCompare(b.date);
    });

    const byEmployee = new Map<string, EmployeePayrollRow>();

    for (const entry of entries) {
      const userId = entry.user?.id || entry.userId;
      const userName = entry.user?.name || 'Okänd användare';
      const row = byEmployee.get(userId) || {
        userId,
        userName,
        email: entry.user?.email,
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        vacationHours: 0,
        absenceHours: 0,
        activities: [],
        absenceEntries: [],
      };

      const kind = classifyActivity(entry.activity);
      row.totalHours += entry.hours;
      if (kind === 'regular') row.regularHours += entry.hours;
      if (kind === 'overtime') row.overtimeHours += entry.hours;
      if (kind === 'vacation') row.vacationHours += entry.hours;
      if (kind === 'absence') row.absenceHours += entry.hours;
      if (kind === 'vacation' || kind === 'absence') row.absenceEntries.push(entry);

      const activityName = entry.activity?.name || 'Saknar arbetsmoment';
      const activityCode = entry.activity?.code || '';
      const activityKey = `${kind}-${entry.activity?.id || activityCode || activityName}`;
      let activity = row.activities.find((item) => item.key === activityKey);
      if (!activity) {
        activity = {
          key: activityKey,
          name: activityName,
          code: activityCode,
          category: entry.activity?.category,
          kind,
          hours: 0,
          entries: [],
        };
        row.activities.push(activity);
      }
      activity.hours += entry.hours;
      activity.entries.push(entry);

      byEmployee.set(userId, row);
    }

    const employees = Array.from(byEmployee.values())
      .map((row) => ({
        ...row,
        activities: row.activities.sort((a, b) => {
          const kindOrder: Record<TimeKind, number> = { regular: 0, overtime: 1, vacation: 2, absence: 3 };
          return kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name, 'sv');
        }),
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName, 'sv'));

    const totals = employees.reduce(
      (acc, row) => {
        acc.totalHours += row.totalHours;
        acc.regularHours += row.regularHours;
        acc.overtimeHours += row.overtimeHours;
        acc.vacationHours += row.vacationHours;
        acc.absenceHours += row.absenceHours;
        return acc;
      },
      { totalHours: 0, regularHours: 0, overtimeHours: 0, vacationHours: 0, absenceHours: 0 }
    );

    return {
      entries,
      employees,
      absenceEntries: employees.flatMap((row) => row.absenceEntries.map((entry) => ({ ...entry, userName: row.userName }))),
      totals,
    };
  }, [reportData]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return payrollData.employees;
    return payrollData.employees.filter((row) => {
      return [row.userName, row.email, ...row.activities.map((activity) => activity.name), ...row.activities.map((activity) => activity.code)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [payrollData.employees, search]);

  const missingUsers = useMemo(() => {
    if (selectedUserId) return [];
    const reportedUserIds = new Set(payrollData.employees.map((row) => row.userId));
    return (users || [])
      .filter((user) => user.active && user.role !== 'ACCOUNTANT' && !reportedUserIds.has(user.id));
  }, [payrollData.employees, selectedUserId, users]);

  const vacationRows = payrollData.absenceEntries.filter((entry) => classifyActivity(entry.activity) === 'vacation').length;
  const reviewHours = payrollData.totals.absenceHours + payrollData.totals.overtimeHours;
  const filteredUserName = selectedUserId ? users?.find((user) => user.id === selectedUserId)?.name : '';

  const setQuickPeriod = (period: 'closedPayroll' | 'currentPayroll' | 'previousPayroll') => {
    const range =
      period === 'closedPayroll'
        ? latestClosedPayrollPeriod()
        : period === 'currentPayroll'
          ? currentPayrollPeriod()
          : previousPayrollPeriod(fromDate);
    setFromDate(range.from);
    setToDate(range.to);
  };

  const handleSalaryExcelExport = async () => {
    setIsExportingExcel(true);
    try {
      const blob = await reportsApi.salaryExcel(fromDate, toDate, selectedUserId || undefined);
      downloadBlob(blob, `loneunderlag_${fromDate}_${toDate}.xlsx`);
      toast.success('Löneunderlag Excel klart');
    } catch (error: any) {
      toast.error(error.message || 'Excel-export misslyckades');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleSalaryCsvExport = async () => {
    setIsExportingCsv(true);
    try {
      const blob = await reportsApi.salaryCsv(fromDate, toDate, selectedUserId || undefined);
      downloadBlob(blob, `loneunderlag_${fromDate}_${toDate}.csv`);
      toast.success('Löneunderlag CSV klart');
    } catch (error: any) {
      toast.error(error.message || 'CSV-export misslyckades');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleAccountantExport = async () => {
    setIsExportingAccountant(true);
    try {
      const blob = await reportsApi.accountantExcel(fromDate, toDate, selectedUserId || undefined);
      downloadBlob(blob, `revisorsunderlag_${fromDate}_${toDate}.xlsx`);
      toast.success('Revisorsunderlag klart');
    } catch (error: any) {
      toast.error(error.message || 'Revisorsunderlag misslyckades');
    } finally {
      setIsExportingAccountant(false);
    }
  };

  const handleExcelBackupExport = async () => {
    setIsExportingBackup(true);
    try {
      const blob = await reportsApi.timeBackupExcel(backupFromDate, backupToDate);
      downloadBlob(blob, `tidbackup_${backupFromDate}_${backupToDate}.xlsx`);
      toast.success('Excel-backup klar');
    } catch (error: any) {
      toast.error(error.message || 'Excel-backup misslyckades');
    } finally {
      setIsExportingBackup(false);
    }
  };

  return (
    <AppShell>
      <header className="flex flex-col gap-3 border-b border-graphite-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Rapport</p>
          <h1 className="page-title mt-1">Rapport för timmar</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-graphite-600">
            Läsbart löne- och revisorsunderlag med period, summering per person och alla attesterade tidrader.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button type="button" onClick={handleSalaryExcelExport} isLoading={isExportingExcel}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button type="button" variant="secondary" onClick={handleSalaryCsvExport} isLoading={isExportingCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button type="button" variant="secondary" onClick={handleAccountantExport} isLoading={isExportingAccountant}>
            <Download className="h-4 w-4" />
            Revisor
          </Button>
        </div>
      </header>

      <section className="border-y border-graphite-200 bg-white/85 py-3">
        <div className="grid grid-cols-1 gap-3 px-3 lg:grid-cols-[minmax(260px,1fr)_170px_170px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-graphite-400" />
            <input className="input pl-9" placeholder="Sök person, arbetsmoment eller kod" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="input" aria-label="Från" />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="input" aria-label="Till" />
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input" aria-label="Anställd">
            <option value="">Alla anställda</option>
            {users?.filter((user) => user.role !== 'ACCOUNTANT').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-graphite-700">
            <CalendarDays className="h-4 w-4 text-primary-600" />
            Brytdag 20:e
          </span>
          <button type="button" onClick={() => setQuickPeriod('closedPayroll')} className="border-b border-transparent pb-1 font-semibold text-primary-800 hover:border-primary-500">
            Senaste löneperiod
          </button>
          <button type="button" onClick={() => setQuickPeriod('currentPayroll')} className="border-b border-transparent pb-1 font-semibold text-primary-800 hover:border-primary-500">
            Pågående löneperiod
          </button>
          <button type="button" onClick={() => setQuickPeriod('previousPayroll')} className="border-b border-transparent pb-1 font-semibold text-primary-800 hover:border-primary-500">
            Föregående
          </button>
        </div>
      </section>

      {isLoading ? (
        <ReportsSkeleton />
      ) : (
        <main className="space-y-7">
          <section className="space-y-3 text-sm leading-7 text-graphite-700">
            <h2 className="text-xl font-semibold text-graphite-950">Sammanfattning</h2>
            <p>
              Perioden <strong>{formatDate(fromDate)} till {formatDate(toDate)}</strong>
              {filteredUserName ? <> för <strong>{filteredUserName}</strong></> : null}
              {' '}innehåller <strong>{formatHours(payrollData.totals.totalHours)}</strong> attesterad tid för{' '}
              <strong>{payrollData.employees.length}</strong> personer. Ordinarie tid är{' '}
              <strong>{formatHours(payrollData.totals.regularHours)}</strong>, övertid är{' '}
              <strong>{formatHours(payrollData.totals.overtimeHours)}</strong>, semester är{' '}
              <strong>{formatHours(payrollData.totals.vacationHours)}</strong> och övrig frånvaro är{' '}
              <strong>{formatHours(payrollData.totals.absenceHours)}</strong>.
            </p>
            <p>
              Revisorsunderlaget hämtas med knappen <strong>Revisor</strong>. Excel och CSV är löneunderlag för samma period och samma filter.
              {reviewHours > 0
                ? <> Det finns <strong>{formatHours(reviewHours)}</strong> övertid eller frånvaro att granska innan export.</>
                : <> Det finns ingen övertid eller frånvaro i urvalet.</>}
            </p>
            {missingUsers.length > 0 ? (
              <p className="font-medium text-amber-900">
                Saknar attesterad tid: {missingUsers.map((user) => user.name).join(', ')}.
              </p>
            ) : (
              <p className="font-medium text-emerald-800">Alla aktiva användare i urvalet har attesterad tid, eller så är rapporten filtrerad på en person.</p>
            )}
          </section>

          <section className="border-y border-graphite-200 py-4">
            <div className="grid grid-cols-1 gap-2 text-sm leading-6 text-graphite-700 md:grid-cols-2 xl:grid-cols-4">
              <ReportLine label="Personer med tid" value={`${payrollData.employees.length} personer`} />
              <ReportLine label="Saknar tid" value={`${missingUsers.length} personer`} warning={missingUsers.length > 0} />
              <ReportLine label="Semester" value={`${formatHours(payrollData.totals.vacationHours)} på ${vacationRows} rader`} />
              <ReportLine label="Granska före lön" value={reviewHours ? formatHours(reviewHours) : 'Inget särskilt'} warning={reviewHours > 0} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-600" />
              <h2 className="text-xl font-semibold text-graphite-950">Timmar per anställd</h2>
              <StatusBadge label="Endast attesterat" tone="green" />
            </div>

            {!filteredEmployees.length ? (
              <EmptyState title="Inga attesterade tider" description="Det finns inga attesterade tidrader för vald period eller filtrering." />
            ) : (
              <div className="border-y border-graphite-200 bg-white/90">
                {filteredEmployees.map((row) => (
                  <EmployeeSection key={row.userId} row={row} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Umbrella className="h-5 w-5 text-sky-600" />
              <h2 className="text-xl font-semibold text-graphite-950">Semester och frånvaro</h2>
            </div>
            {!payrollData.absenceEntries.length ? (
              <p className="border-y border-graphite-200 bg-white/80 px-3 py-4 text-sm text-graphite-600">Ingen semester eller frånvaro finns i perioden.</p>
            ) : (
              <div className="border-y border-graphite-200 bg-white/90">
                {payrollData.absenceEntries.map((entry: PayrollEntry & { userName?: string }) => (
                  <div key={entry.id} className="grid grid-cols-1 gap-2 border-b border-graphite-100 px-3 py-3 text-sm last:border-b-0 md:grid-cols-[160px_1fr_120px]">
                    <p className="font-semibold text-graphite-950">{formatDate(entry.date)}</p>
                    <p className="text-graphite-700">
                      <strong>{entry.userName || entry.user?.name}</strong> · {entry.activity?.name || '-'}
                      {entry.note ? <span className="text-graphite-500"> · {entry.note}</span> : null}
                    </p>
                    <p className="font-semibold text-graphite-950 md:text-right">{formatHours(entry.hours)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="text-xl font-semibold text-graphite-950">Detaljrader till lön och revisor</h2>
            </div>
            {!payrollData.entries.length ? (
              <EmptyState title="Inga rader att visa" />
            ) : (
              <div className="overflow-x-auto border-y border-graphite-200 bg-white/90">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="border-b border-graphite-200 bg-graphite-50 text-left text-xs font-semibold uppercase tracking-wide text-graphite-500">
                    <tr>
                      <th className="px-3 py-3">Datum</th>
                      <th className="px-3 py-3">Anställd</th>
                      <th className="px-3 py-3">Typ</th>
                      <th className="px-3 py-3">Arbetsmoment</th>
                      <th className="px-3 py-3 text-right">Timmar</th>
                      <th className="px-3 py-3">Projekt</th>
                      <th className="px-3 py-3">Kommentar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-graphite-100">
                    {payrollData.entries.map((entry) => {
                      const kind = classifyActivity(entry.activity);
                      return (
                        <tr key={entry.id} className="align-top hover:bg-primary-50/60">
                          <td className="whitespace-nowrap px-3 py-2">{formatDate(entry.date)}</td>
                          <td className="px-3 py-2 font-semibold text-graphite-900">{entry.user?.name || '-'}</td>
                          <td className="px-3 py-2"><KindPill kind={kind} /></td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-graphite-900">{entry.activity?.name || '-'}</p>
                            {entry.activity?.code && <p className="text-xs text-graphite-500">{entry.activity.code}</p>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatHours(entry.hours)}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-graphite-900">{entry.project?.code || 'Intern'}</p>
                            {entry.project?.name && <p className="text-xs text-graphite-500">{entry.project.name}</p>}
                          </td>
                          <td className="px-3 py-2 text-graphite-600">{entry.note || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="border-t border-graphite-200 pt-4">
            <h2 className="text-xl font-semibold text-graphite-950">Excel-backup</h2>
            <p className="mt-1 text-sm leading-6 text-graphite-600">Backupen laddar ner alla tidrader inom vald backup-period.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[170px_170px_220px]">
              <input type="date" value={backupFromDate} onChange={(event) => setBackupFromDate(event.target.value)} className="input" aria-label="Backup från" />
              <input type="date" value={backupToDate} onChange={(event) => setBackupToDate(event.target.value)} className="input" aria-label="Backup till" />
              <Button type="button" variant="secondary" onClick={handleExcelBackupExport} isLoading={isExportingBackup}>
                <Download className="h-4 w-4" />
                Ladda ner backup
              </Button>
            </div>
          </section>
        </main>
      )}
    </AppShell>
  );
}

function ReportLine({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <p>
      <span className="font-semibold text-graphite-950">{label}:</span>{' '}
      <span className={warning ? 'font-semibold text-amber-900' : 'text-graphite-700'}>{value}</span>
    </p>
  );
}

function EmployeeSection({ row }: { row: EmployeePayrollRow }) {
  const hasReview = row.overtimeHours > 0 || row.vacationHours > 0 || row.absenceHours > 0;
  return (
    <section className="border-b border-graphite-200 px-3 py-4 last:border-b-0">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-graphite-950">{row.userName}</h3>
            <StatusBadge label={hasReview ? 'Granska' : 'Klar'} tone={hasReview ? 'yellow' : 'green'} />
          </div>
          {row.email && <p className="mt-1 text-sm text-graphite-500">{row.email}</p>}
        </div>
        <p className="max-w-3xl text-sm leading-6 text-graphite-700 lg:text-right">
          Totalt <strong>{formatHours(row.totalHours)}</strong>. Ordinarie {formatHours(row.regularHours)},
          övertid {formatHours(row.overtimeHours)}, semester {formatHours(row.vacationHours)},
          frånvaro {formatHours(row.absenceHours)}.
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="py-2 pr-3">Arbetsmoment</th>
              <th className="py-2 pr-3">Typ</th>
              <th className="py-2 pr-3">Kod</th>
              <th className="py-2 text-right">Timmar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-100">
            {row.activities.map((activity) => (
              <tr key={activity.key}>
                <td className="py-2 pr-3 font-medium text-graphite-900">{activity.name}</td>
                <td className="py-2 pr-3 text-graphite-700">{kindLabel(activity.kind)}</td>
                <td className="py-2 pr-3 text-graphite-500">{activity.code || '-'}</td>
                <td className="py-2 text-right font-semibold text-graphite-950">{formatHours(activity.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KindPill({ kind }: { kind: TimeKind }) {
  const className =
    kind === 'vacation'
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : kind === 'absence'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : kind === 'overtime'
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{kindLabel(kind)}</span>;
}
