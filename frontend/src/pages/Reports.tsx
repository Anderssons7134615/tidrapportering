import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Download, FileSpreadsheet, ReceiptText, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi, projectsApi, reportsApi, usersApi } from '../services/api';
import { ReportsSkeleton } from '../components/ui/Skeleton';
import { AppShell, Button, Card, DataTable, EmptyState, FilterBar, KpiCard, PageHeader, Tabs } from '../components/ui/design';
import { formatCurrency, formatHours } from '../utils/format';

type ReportType = 'salary' | 'invoice';

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('salary');
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupFromDate, setBackupFromDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [backupToDate, setBackupToDate] = useState(format(new Date(new Date().getFullYear(), 11, 31), 'yyyy-MM-dd'));

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const { data: reportData, isLoading } = useQuery<any>({
    queryKey: ['report', reportType, fromDate, toDate, selectedUserId, selectedCustomerId, selectedProjectId],
    queryFn: () =>
      reportType === 'salary'
        ? reportsApi.salary(fromDate, toDate, selectedUserId || undefined)
        : reportsApi.invoice(fromDate, toDate, selectedCustomerId || undefined, selectedProjectId || undefined),
  });

  const visibleProjects = useMemo(
    () => projects?.filter((project) => !selectedCustomerId || project.customerId === selectedCustomerId) || [],
    [projects, selectedCustomerId]
  );

  const setQuickPeriod = (period: 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const now = new Date();
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
        reportType === 'salary'
          ? await reportsApi.salaryExcel(fromDate, toDate, selectedUserId || undefined)
          : await reportsApi.invoiceExcel(fromDate, toDate, selectedCustomerId || undefined, selectedProjectId || undefined);
      downloadBlob(blob, `${reportType === 'salary' ? 'loneunderlag' : 'fakturaunderlag'}_${fromDate}_${toDate}.xlsx`);
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

  const projectRows = reportData?.byProject ? Object.values(reportData.byProject) as any[] : [];
  const salaryRows = reportData?.summary ? Object.entries(reportData.summary) as Array<[string, any]> : [];

  return (
    <AppShell>
      <PageHeader
        title="Rapporter"
        description="Ta fram löneunderlag, fakturaunderlag och Excel-backup utan att leta."
        action={
          <Button type="button" onClick={handleExport} isLoading={isExporting}>
            <Download className="h-4 w-4" />
            Exportera Excel
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: 'salary', label: 'Löneunderlag' },
          { id: 'invoice', label: 'Fakturering' },
        ]}
        active={reportType}
        onChange={(id) => setReportType(id as ReportType)}
      />

      <FilterBar>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[auto_0.7fr_0.7fr_1fr_1fr]">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setQuickPeriod('thisMonth')} className="btn-secondary">Denna månad</button>
            <button onClick={() => setQuickPeriod('lastMonth')} className="btn-secondary">Förra månaden</button>
            <button onClick={() => setQuickPeriod('thisYear')} className="btn-secondary">Detta år</button>
          </div>
          <label>
            <span className="label">Från</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="input" />
          </label>
          <label>
            <span className="label">Till</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="input" />
          </label>
          {reportType === 'salary' ? (
            <label className="xl:col-span-2">
              <span className="label">Anställd</span>
              <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input">
                <option value="">Alla anställda</option>
                {users?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          ) : (
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
          )}
        </div>
      </FilterBar>

      {isLoading ? (
        <ReportsSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.8fr]">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard label={reportType === 'salary' ? 'Timmar totalt' : 'Fakturerbara timmar'} value={formatHours(reportData?.totals?.totalHours)} tone="blue" />
              <KpiCard label={reportType === 'salary' ? 'Anställda' : 'Belopp'} value={reportType === 'salary' ? (reportData?.totals?.uniqueUsers || 0) : formatCurrency(reportData?.totals?.totalAmount)} tone={reportType === 'salary' ? 'slate' : 'green'} />
              <KpiCard label="Period" value={`${fromDate} - ${toDate}`} />
            </div>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                {reportType === 'salary' ? <Users className="h-5 w-5 text-slate-500" /> : <ReceiptText className="h-5 w-5 text-slate-500" />}
                <h2 className="section-title">{reportType === 'salary' ? 'Per person och kod' : 'Per projekt'}</h2>
              </div>

              {reportType === 'salary' ? (
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
              ) : (
                !projectRows.length ? (
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
                )
              )}
            </Card>
          </div>

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
        </div>
      )}
    </AppShell>
  );
}
