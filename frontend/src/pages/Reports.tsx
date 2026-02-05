import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, customersApi, projectsApi, usersApi } from '../services/api';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { FileBarChart, Download, Loader2 } from 'lucide-react';
import { ReportsSkeleton } from '../components/ui/Skeleton';
import toast from 'react-hot-toast';

export default function Reports() {
  const [reportType, setReportType] = useState<'salary' | 'invoice'>('salary');
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list(),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report', reportType, fromDate, toDate, selectedUserId, selectedCustomerId, selectedProjectId],
    queryFn: () => {
      if (reportType === 'salary') {
        return reportsApi.salary(fromDate, toDate, selectedUserId || undefined);
      } else {
        return reportsApi.invoice(
          fromDate,
          toDate,
          selectedCustomerId || undefined,
          selectedProjectId || undefined
        );
      }
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let csv: string;
      if (reportType === 'salary') {
        csv = await reportsApi.salary(fromDate, toDate, selectedUserId || undefined, 'csv');
      } else {
        csv = await reportsApi.invoice(
          fromDate,
          toDate,
          selectedCustomerId || undefined,
          selectedProjectId || undefined,
          'csv'
        );
      }

      // Skapa och ladda ner fil
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType === 'salary' ? 'loneunderlag' : 'fakturaunderlag'}_${fromDate}_${toDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Export klar!');
    } catch (error: any) {
      toast.error(error.message || 'Export misslyckades');
    } finally {
      setIsExporting(false);
    }
  };

  // Snabbval för period
  const setQuickPeriod = (period: 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const now = new Date();
    switch (period) {
      case 'thisMonth':
        setFromDate(format(startOfMonth(now), 'yyyy-MM-dd'));
        setToDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        setFromDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setToDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      case 'thisYear':
        setFromDate(format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'));
        setToDate(format(new Date(now.getFullYear(), 11, 31), 'yyyy-MM-dd'));
        break;
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Rapporter</h1>

      {/* Rapporttyp */}
      <div className="flex gap-2">
        <button
          onClick={() => setReportType('salary')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            reportType === 'salary'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Löneunderlag
        </button>
        <button
          onClick={() => setReportType('invoice')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            reportType === 'invoice'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Fakturaunderlag
        </button>
      </div>

      {/* Filter */}
      <div className="card space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setQuickPeriod('thisMonth')}
            className="btn-secondary text-sm"
          >
            Denna månad
          </button>
          <button
            onClick={() => setQuickPeriod('lastMonth')}
            className="btn-secondary text-sm"
          >
            Förra månaden
          </button>
          <button
            onClick={() => setQuickPeriod('thisYear')}
            className="btn-secondary text-sm"
          >
            Detta år
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Från</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Till</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {reportType === 'salary' && (
          <div>
            <label className="label">Användare</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="input"
            >
              <option value="">Alla användare</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'invoice' && (
          <>
            <div>
              <label className="label">Kund</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedProjectId('');
                }}
                className="input"
              >
                <option value="">Alla kunder</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Projekt</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="input"
              >
                <option value="">Alla projekt</option>
                {projects
                  ?.filter((p) => !selectedCustomerId || p.customerId === selectedCustomerId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </>
        )}

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="btn-primary w-full"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Exportera CSV
            </>
          )}
        </button>
      </div>

      {/* Resultat */}
      {isLoading ? (
        <ReportsSkeleton />
      ) : reportData ? (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FileBarChart className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold">Sammanfattning</h2>
          </div>

          {reportType === 'salary' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold">{reportData.totals?.totalHours.toFixed(1)}h</p>
                  <p className="text-sm text-gray-500">Totalt</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold">{reportData.totals?.uniqueUsers}</p>
                  <p className="text-sm text-gray-500">Användare</p>
                </div>
              </div>

              {reportData.summary && Object.keys(reportData.summary).length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Per person och kod</h3>
                  <div className="space-y-2">
                    {Object.entries(reportData.summary).map(([userName, codes]: [string, any]) => (
                      <div key={userName} className="p-3 bg-gray-50 rounded-lg">
                        <p className="font-medium mb-2">{userName}</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          {Object.entries(codes).map(([code, data]: [string, any]) => (
                            <div key={code} className="flex justify-between">
                              <span className="text-gray-600">{code}</span>
                              <span className="font-medium">{data.hours.toFixed(1)}h</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold">{reportData.totals?.totalHours.toFixed(1)}h</p>
                  <p className="text-sm text-gray-500">Fakturerbara timmar</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">
                    {reportData.totals?.totalAmount.toLocaleString('sv-SE')} kr
                  </p>
                  <p className="text-sm text-gray-500">Totalt belopp</p>
                </div>
              </div>

              {reportData.byProject && Object.keys(reportData.byProject).length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Per projekt</h3>
                  <div className="space-y-2">
                    {Object.entries(reportData.byProject).map(([projectId, data]: [string, any]) => (
                      <div key={projectId} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">
                            {data.project?.name || 'Okänt projekt'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {data.project?.customer?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{data.totalHours.toFixed(1)}h</p>
                          <p className="text-sm text-green-600">
                            {data.totalAmount.toLocaleString('sv-SE')} kr
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
