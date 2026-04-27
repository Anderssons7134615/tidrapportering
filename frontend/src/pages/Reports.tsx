import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Download, FileSpreadsheet, ReceiptText, Sparkles, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi, projectsApi, reportsApi, usersApi } from '../services/api';
import { ReportsSkeleton } from '../components/ui/Skeleton';
import { AppShell, Button, Card, DataTable, EmptyState, FilterBar, KpiCard, PageHeader, Tabs } from '../components/ui/design';
import { formatCurrency, formatHours } from '../utils/format';
import { useAuthStore } from '../stores/authStore';

type ReportType = 'accountant' | 'salary' | 'invoice';

function toDateInput(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function latestClosedPayrollPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentCutoff = new Date(year, month, 20);
  const end = referenceDate > currentCutoff ? currentCutoff : new Date(year, month - 1, 20);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 20);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function currentPayrollPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentCutoff = new Date(year, month, 20);
  const start = referenceDate >= currentCutoff ? currentCutoff : new Date(year, month - 1, 20);
  const end = addMonths(start, 1);
  return { from: toDateInput(start), to: toDateInput(end) };
}

export default function Reports() {
  const { user } = useAuthStore();
  const isAccountant = user?.role === 'ACCOUNTANT';
  const defaultPayrollPeriod = latestClosedPayrollPeriod();
  const [reportType, setReportType] = useState<ReportType>(isAccountant ? 'accountant' : 'salary');
  const [fromDate, setFromDate] = useState(defaultPayrollPeriod.from);
  const [toDate, setToDate] = useState(defaultPayrollPeriod.to);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupFromDate, setBackupFromDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [backupToDate, setBackupToDate] = useState(format(new Date(new Date().getFullYear(), 11, 31), 'yyyy-MM-dd'));

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list(), enabled: !isAccountant });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list(), enabled: !isAccountant });
  const { data: reportData, isLoading } = useQuery<any>({
    queryKey: ['report', reportType, fromDate, toDate, selectedUserId, selectedCustomerId, selectedProjectId],
    queryFn: () => {
      if (reportType === 'accountant') return reportsApi.accountant(fromDate, toDate, selectedUserId || undefined);
      if (reportType === 'salary') return reportsApi.salary(fromDate, toDate, selectedUserId || undefined);
      return reportsApi.invoice(fromDate, toDate, selectedCustomerId || undefined, selectedProjectId || undefined);
    },
  });

  const visibleProjects = useMemo(
    () => projects?.filter((project) => !selectedCustomerId || project.customerId === selectedCustomerId) || [],
    [projects, selectedCustomerId]
  );

  const setQuickPeriod = (period: 'closedPayroll' | 'currentPayroll' | 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const now = new Date();
    if (period === 'closedPayroll') {
      const range = latestClosedPayrollPeriod(now);
      setFromDate(range.from);
      setToDate(range.to);
    }
    if (period === 'currentPayroll') {
      const range = currentPayrollPeriod(now);
      setFromDate(range.from);
      setToDate(range.to);
    }
    if (period === 'thisMonth') {
      setFromDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setToDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    }
    if (period === 'lastMonth') {
      const lastMonth = subMonths(now, 1);
      setFromDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setToDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
    }
    if (period === 'thisYear') {
      setFromDate(format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'));
      setToDate(format(new Date(now.getFullYear(), 11, 31), 'yyyy-MM-dd'));
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob =
        reportType === 'accountant'
          ? await reportsApi.accountantExcel(fromDate, toDate, selectedUserId || undefined)
          : reportType === 'salary'
            ? await reportsApi.salaryExcel(fromDate, toDate, selectedUserId || undefined)
            : await reportsApi.invoiceExcel(fromDate, toDate, selectedCustomerId || undefined, selectedProjectId || undefined);
      const prefix = reportType === 'accountant' ? 'revisorsunderlag' : reportType === 'salary' ? 'loneunderlag' : 'fakturaunderlag';
      downloadBlob(blob, `${prefix}_${fromDate}_${toDate}.xlsx`);
      toast.success('Excel-export klar');
    } catch (error: any) {
      toast.error(error.message || 'Export misslyckades');
    } finally {
      setIsExporting(false);
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

  const tabs = [
    { id: 'accountant', label: 'Revisorsunderlag' },
    ...(!isAccountant ? [{ id: 'salary', label: 'Löneunderlag' }, { id: 'invoice', label: 'Fakturering' }] : []),
  ];
  const projectRows = reportData?.byProject ? Object.values(reportData.byProject) as any[] : [];
  const salaryRows = reportData?.summary ? Object.entries(reportData.summary) as Array<[string, any]> : [];
  const accountantRows = reportData?.byUser || [];
  const activityRows = reportData?.byActivity || [];

  return (
    <AppShell>
      <PageHeader
        title="Rapporter"
        description={reportType === 'accountant' ? 'Exportera ett rent löne- och revisionsunderlag med brytdatum den 20:e.' : 'Ta fram löneunderlag, fakturaunderlag och Excel-backup utan att leta.'}
        action={
          <Button type="button" onClick={handleExport} isLoading={isExporting}>
            <Download className="h-4 w-4" />
            Exportera Excel
          </Button>
        }
      />

      <Card className="relative overflow-hidden border-primary-100 bg-gradient-to-br from-white via-primary-50 to-emerald-50">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-3 py-1 text-xs font-semibold text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Brytdatum 20:e
            </div>
            <h2 className="text-xl font-semibold text-slate-950">Period {fromDate} till {toDate}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Revisorsunderlaget använder endast attesterade tidrader och summerar per anställd och lönekod.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="Timmar" value={formatHours(reportData?.totals?.totalHours)} tone="blue" />
            <KpiCard label="Personer" value={reportData?.totals?.uniqueUsers || 0} tone="green" />
            <KpiCard label="Lönekoder" value={reportData?.totals?.activityCount || (reportType === 'salary' ? salaryRows.length : 0)} tone="yellow" />
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} active={reportType} onChange={(id) => setReportType(id as ReportType)} />

      <FilterBar>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[auto_0.7fr_0.7fr_1fr_1fr]">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setQuickPeriod('closedPayroll')} className="btn-secondary">Senaste 20:e-period</button>
            <button onClick={() => setQuickPeriod('currentPayroll')} className="btn-secondary">Pågående 20:e-period</button>
            {!isAccountant && <button onClick={() => setQuickPeriod('thisMonth')} className="btn-secondary">Denna månad</button>}
            {!isAccountant && <button onClick={() => setQuickPeriod('lastMonth')} className="btn-secondary">Förra månaden</button>}
          </div>
          <label>
            <span className="label">Från</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="input" />
          </label>
          <label>
            <span className="label">Till</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="input" />
          </label>
          {reportType === 'invoice' ? (
            <>
              <label>
                <span className="label">Kund</span>
                <select value={selectedCustomerId} onChange={(event) => { setSelectedCustomerId(event.target.value); setSelectedProjectId(''); }} className="input">
                  <option value="">Alla kunder</option>
                  {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Projekt</span>
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="input">
                  <option value="">Alla projekt</option>
                  {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.code} - {project.name}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label className="xl:col-span-2">
              <span className="label">Anställd</span>
              <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input">
                <option value="">Alla anställda</option>
                {users?.filter((user) => user.role !== 'ACCOUNTANT').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </FilterBar>

      {isLoading ? (
        <ReportsSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.75fr]">
          <div className="space-y-5">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                {reportType === 'invoice' ? <ReceiptText className="h-5 w-5 text-slate-500" /> : <Users className="h-5 w-5 text-slate-500" />}
                <h2 className="section-title">{reportType === 'invoice' ? 'Per projekt' : reportType === 'accountant' ? 'Summering per anställd' : 'Per person och kod'}</h2>
              </div>

              {reportType === 'accountant' ? (
                !accountantRows.length ? (
                  <EmptyState title="Inga attesterade tider" description="Det finns inga attesterade tidrader för perioden." />
                ) : (
                  <DataTable>
                    <table className="min-w-full text-sm">
                      <thead className="table-head">
                        <tr><th className="px-3 py-2">Anställd</th><th className="px-3 py-2">E-post</th><th className="px-3 py-2">Timmar</th><th className="px-3 py-2">Dagar</th></tr>
                      </thead>
                      <tbody>
                        {accountantRows.map((row: any) => (
                          <tr key={row.email} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.userName}</td>
                            <td className="px-3 py-2">{row.email}</td>
                            <td className="px-3 py-2">{formatHours(row.hours)}</td>
                            <td className="px-3 py-2">{row.days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTable>
                )
              ) : reportType === 'salary' ? (
                !salaryRows.length ? (
                  <EmptyState title="Ingen rapportdata" description="Det finns inga attesterade tidrader för perioden." />
                ) : (
                  <div className="space-y-3">
                    {salaryRows.map(([userName, codes]) => (
                      <div key={userName} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="font-semibold text-slate-900">{userName}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                          {Object.entries(codes).map(([code, data]: [string, any]) => (
                            <div key={code} className="rounded-lg bg-white px-3 py-2">
                              <p className="text-xs text-slate-500">{code}</p>
                              <p className="font-semibold text-slate-900">{formatHours(data.hours)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : !projectRows.length ? (
                <EmptyState title="Inget fakturaunderlag" description="Det finns inga attesterade fakturerbara timmar i urvalet." />
              ) : (
                <DataTable>
                  <table className="min-w-full text-sm">
                    <thead className="table-head">
                      <tr><th className="px-3 py-2">Projekt</th><th className="px-3 py-2">Kund</th><th className="px-3 py-2">Timmar</th><th className="px-3 py-2">Belopp</th></tr>
                    </thead>
                    <tbody>
                      {projectRows.map((row) => (
                        <tr key={row.project?.id || row.project?.code || row.project?.name} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.project?.name || 'Okänt projekt'}</td>
                          <td className="px-3 py-2">{row.project?.customer?.name || '-'}</td>
                          <td className="px-3 py-2">{formatHours(row.totalHours)}</td>
                          <td className="px-3 py-2 font-semibold text-emerald-700">{formatCurrency(row.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            {reportType === 'accountant' && (
              <Card>
                <div className="mb-4 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <h2 className="section-title">Lönekoder</h2>
                </div>
                {!activityRows.length ? (
                  <EmptyState title="Inga lönekoder" description="När tid finns i perioden summeras lönekoderna här." />
                ) : (
                  <div className="space-y-2">
                    {activityRows.map((row: any) => (
                      <div key={row.code} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div>
                          <p className="font-semibold text-slate-900">{row.code}</p>
                          <p className="text-xs text-slate-500">{row.activity}</p>
                        </div>
                        <p className="font-semibold text-slate-900">{formatHours(row.hours)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {!isAccountant && (
              <Card>
                <div className="mb-4 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <h2 className="section-title">Excel-backup</h2>
                </div>
                <p className="mb-4 text-sm text-slate-500">Ladda ner attesterade tider med en flik per vecka. Bra som arkiv och kontrollunderlag.</p>
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
                    Ladda ner Excel
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
