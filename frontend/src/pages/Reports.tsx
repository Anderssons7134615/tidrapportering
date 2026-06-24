import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, format } from 'date-fns';
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Search, Umbrella, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi, usersApi } from '../services/api';
import { ReportsSkeleton } from '../components/ui/Skeleton';
import { AppShell, Button, Card, DataTable, EmptyState, KpiCard, PageHeader, StatusBadge } from '../components/ui/design';
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
      <PageHeader
        title="Löneunderlag"
        description="Kontrollera perioden 21:a till 20:e, se timmar per person och fånga semester, sjukfrånvaro och övertid innan export."
        action={
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" onClick={handleSalaryExcelExport} isLoading={isExportingExcel}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button type="button" variant="secondary" onClick={handleSalaryCsvExport} isLoading={isExportingCsv}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      <section className="overflow-hidden rounded-xl border border-graphite-800 bg-graphite-950 text-white shadow-premium">
        <div className="grid gap-0 xl:grid-cols-[1fr_1.2fr]">
          <div className="p-5 sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/75">
              <CalendarDays className="h-3.5 w-3.5" />
              Brytdag 20:e
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {formatDate(fromDate)} - {formatDate(toDate)}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Exporten använder endast attesterade tidrader. Perioden börjar den 21:a och slutar den 20:e, så underlaget matchar lönekörningen direkt.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setQuickPeriod('closedPayroll')} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
                Senaste löneperiod
              </button>
              <button type="button" onClick={() => setQuickPeriod('currentPayroll')} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
                Pågående löneperiod
              </button>
              <button type="button" onClick={() => setQuickPeriod('previousPayroll')} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
                Föregående
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-white/[0.04] p-5 sm:grid-cols-3 sm:p-6 xl:border-l xl:border-t-0">
            <HeroMetric label="Attesterade timmar" value={formatHours(payrollData.totals.totalHours)} />
            <HeroMetric label="Personer" value={payrollData.employees.length} />
            <HeroMetric label="Ordinarie" value={formatHours(payrollData.totals.regularHours)} />
            <HeroMetric label="Övertid" value={formatHours(payrollData.totals.overtimeHours)} tone={payrollData.totals.overtimeHours ? 'warning' : 'neutral'} />
            <HeroMetric label="Semester" value={formatHours(payrollData.totals.vacationHours)} tone={payrollData.totals.vacationHours ? 'blue' : 'neutral'} />
            <HeroMetric label="Övrig frånvaro" value={formatHours(payrollData.totals.absenceHours)} tone={payrollData.totals.absenceHours ? 'warning' : 'neutral'} />
          </div>
        </div>
      </section>

      <Card className="p-0">
        <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1fr_0.75fr_0.75fr_1fr]">
          <label className="relative block">
            <span className="label">Sök</span>
            <Search className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-graphite-400" />
            <input className="input pl-9" placeholder="Person, arbetsmoment eller kod" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label>
            <span className="label">Från</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="input" />
          </label>
          <label>
            <span className="label">Till</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="input" />
          </label>
          <label>
            <span className="label">Anställd</span>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input">
              <option value="">Alla anställda</option>
              {users?.filter((user) => user.role !== 'ACCOUNTANT').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {isLoading ? (
        <ReportsSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
          <main className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Personer med tid" value={payrollData.employees.length} hint="Attesterade rader" tone="green" />
              <KpiCard label="Saknar tid" value={missingUsers.length} hint="Aktiva användare utan rader" tone={missingUsers.length ? 'yellow' : 'green'} />
              <KpiCard label="Semester" value={formatHours(payrollData.totals.vacationHours)} hint={`${payrollData.absenceEntries.filter((entry) => classifyActivity(entry.activity) === 'vacation').length} rader`} tone="blue" />
              <KpiCard label="Frånvaro + övertid" value={formatHours(payrollData.totals.absenceHours + payrollData.totals.overtimeHours)} hint="Kontroll före lön" tone={payrollData.totals.absenceHours + payrollData.totals.overtimeHours ? 'yellow' : 'slate'} />
            </div>

            <Card>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary-600" />
                  <h2 className="section-title">Timmar per anställd</h2>
                </div>
                <StatusBadge label="Endast attesterat" tone="green" />
              </div>

              {!filteredEmployees.length ? (
                <EmptyState title="Inga attesterade tider" description="Det finns inga attesterade tidrader för vald period eller filtrering." />
              ) : (
                <div className="space-y-3">
                  {filteredEmployees.map((row) => (
                    <EmployeeCard key={row.userId} row={row} />
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <h2 className="section-title">Detaljrader till lön</h2>
              </div>
              {!payrollData.entries.length ? (
                <EmptyState title="Inga rader att visa" />
              ) : (
                <DataTable>
                  <table className="min-w-full text-sm">
                    <thead className="table-head">
                      <tr>
                        <th className="px-3 py-2">Datum</th>
                        <th className="px-3 py-2">Anställd</th>
                        <th className="px-3 py-2">Typ</th>
                        <th className="px-3 py-2">Arbetsmoment</th>
                        <th className="px-3 py-2">Timmar</th>
                        <th className="px-3 py-2">Projekt</th>
                        <th className="px-3 py-2">Kommentar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollData.entries.map((entry) => {
                        const kind = classifyActivity(entry.activity);
                        return (
                          <tr key={entry.id} className="border-b border-graphite-100 align-top">
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(entry.date)}</td>
                            <td className="px-3 py-2 font-semibold text-graphite-900">{entry.user?.name || '-'}</td>
                            <td className="px-3 py-2"><KindPill kind={kind} /></td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-graphite-900">{entry.activity?.name || '-'}</p>
                              {entry.activity?.code && <p className="text-xs text-graphite-500">{entry.activity.code}</p>}
                            </td>
                            <td className="px-3 py-2 font-semibold">{formatHours(entry.hours)}</td>
                            <td className="px-3 py-2">{entry.project?.code || 'Intern'}</td>
                            <td className="px-3 py-2 text-graphite-600">{entry.note || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </DataTable>
              )}
            </Card>
          </main>

          <aside className="space-y-5">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h2 className="section-title">Lönekontroll</h2>
              </div>
              <div className="space-y-2">
                <CheckItem ok label="Endast attesterade tidrader ingår" />
                <CheckItem ok={payrollData.entries.length > 0} label="Det finns rader i perioden" />
                <CheckItem ok={missingUsers.length === 0} label="Alla aktiva användare har tid eller är filtrerade" />
                <CheckItem
                  ok={payrollData.totals.overtimeHours === 0}
                  label={payrollData.totals.overtimeHours === 0 ? 'Ingen övertid att granska' : 'Övertid behöver granskas'}
                />
              </div>
              {missingUsers.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">Saknar attesterad tid</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missingUsers.slice(0, 12).map((user) => (
                      <span key={user.id} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-sm">{user.name}</span>
                    ))}
                    {missingUsers.length > 12 && <span className="text-xs font-semibold text-amber-900">+{missingUsers.length - 12}</span>}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Umbrella className="h-5 w-5 text-sky-600" />
                <h2 className="section-title">Semester och frånvaro</h2>
              </div>
              {!payrollData.absenceEntries.length ? (
                <EmptyState title="Ingen semester eller frånvaro" description="Inga attesterade frånvarorader finns i perioden." />
              ) : (
                <div className="space-y-2">
                  {payrollData.absenceEntries.slice(0, 18).map((entry: PayrollEntry & { userName?: string }) => (
                    <div key={entry.id} className="rounded-lg border border-graphite-200 bg-white px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-graphite-950">{entry.userName || entry.user?.name}</p>
                          <p className="text-xs text-graphite-500">{formatDate(entry.date)} · {entry.activity?.name}</p>
                        </div>
                        <p className="shrink-0 font-semibold text-graphite-950">{formatHours(entry.hours)}</p>
                      </div>
                      {entry.note && <p className="mt-1 text-xs text-graphite-500">{entry.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Download className="h-5 w-5 text-graphite-500" />
                <h2 className="section-title">Fler exporter</h2>
              </div>
              <div className="space-y-3">
                <Button type="button" variant="secondary" onClick={handleAccountantExport} isLoading={isExportingAccountant}>
                  <Download className="h-4 w-4" />
                  Revisors-Excel
                </Button>
                <div className="rounded-lg border border-graphite-200 bg-graphite-50 p-3">
                  <p className="mb-3 text-sm font-semibold text-graphite-900">Excel-backup</p>
                  <div className="space-y-3">
                    <label>
                      <span className="label">Från</span>
                      <input type="date" value={backupFromDate} onChange={(event) => setBackupFromDate(event.target.value)} className="input" />
                    </label>
                    <label>
                      <span className="label">Till</span>
                      <input type="date" value={backupToDate} onChange={(event) => setBackupToDate(event.target.value)} className="input" />
                    </label>
                    <Button type="button" variant="secondary" onClick={handleExcelBackupExport} isLoading={isExportingBackup}>
                      <Download className="h-4 w-4" />
                      Ladda ner backup
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function EmployeeCard({ row }: { row: EmployeePayrollRow }) {
  const hasReview = row.overtimeHours > 0 || row.vacationHours > 0 || row.absenceHours > 0;
  return (
    <div className="rounded-xl border border-graphite-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-graphite-950">{row.userName}</h3>
            <StatusBadge label={hasReview ? 'Granska' : 'Klar'} tone={hasReview ? 'yellow' : 'green'} />
          </div>
          {row.email && <p className="mt-1 text-sm text-graphite-500">{row.email}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:w-[560px]">
          <MiniMetric label="Totalt" value={formatHours(row.totalHours)} strong />
          <MiniMetric label="Ordinarie" value={formatHours(row.regularHours)} />
          <MiniMetric label="Övertid" value={formatHours(row.overtimeHours)} tone={row.overtimeHours ? 'warning' : 'neutral'} />
          <MiniMetric label="Semester" value={formatHours(row.vacationHours)} tone={row.vacationHours ? 'blue' : 'neutral'} />
          <MiniMetric label="Frånvaro" value={formatHours(row.absenceHours)} tone={row.absenceHours ? 'warning' : 'neutral'} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {row.activities.map((activity) => (
          <div key={activity.key} className="rounded-lg border border-graphite-200 bg-graphite-50 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-graphite-950">{activity.name}</p>
                <p className="text-xs text-graphite-500">{kindLabel(activity.kind)}{activity.code ? ` · ${activity.code}` : ''}</p>
              </div>
              <p className="shrink-0 font-semibold text-graphite-950">{formatHours(activity.hours)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroMetric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'warning' | 'blue' }) {
  const toneClass = tone === 'warning' ? 'text-amber-100' : tone === 'blue' ? 'text-sky-100' : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/55">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = 'neutral',
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning' | 'blue';
  strong?: boolean;
}) {
  const toneClass = tone === 'warning' ? 'bg-amber-50 text-amber-900 border-amber-200' : tone === 'blue' ? 'bg-sky-50 text-sky-900 border-sky-200' : 'bg-graphite-50 text-graphite-800 border-graphite-200';
  return (
    <div className={`min-h-[68px] rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className={`mt-1 ${strong ? 'text-lg' : 'text-base'} font-semibold`}>{value}</p>
    </div>
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

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  const good = ok;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${good ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      {good ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="font-medium">{label}</span>
    </div>
  );
}
