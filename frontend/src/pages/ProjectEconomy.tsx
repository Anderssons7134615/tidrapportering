import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { projectPortfolioApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { AppShell, EmptyState, PageHeader } from '../components/ui/design';
import { ListSkeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { formatCurrency, formatHours, formatPercent } from '../utils/format';

export default function ProjectEconomy() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['project-portfolio'], queryFn: projectPortfolioApi.get });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('sv');
    return (data || []).filter((item) => !term || [item.project.code, item.project.name, item.project.customer?.name].filter(Boolean).some((value) => value!.toLocaleLowerCase('sv').includes(term)));
  }, [data, search]);
  const totals = useMemo(() => {
    const sum = rows.reduce((result, item) => ({ reported: result.reported + item.reportedHours, approved: result.approved + item.approvedHours, unapproved: result.unapproved + item.unapprovedHours, calculatedResult: result.calculatedResult + (item.result ?? 0) }), { reported: 0, approved: 0, unapproved: 0, calculatedResult: 0 });
    return { ...sum, result: rows.some((item) => item.result == null) ? null : sum.calculatedResult };
  }, [rows]);

  if (isLoading) return <ListSkeleton />;
  return (
    <AppShell>
      <PageHeader title="Projektekonomi" description="Rapporterad och attesterad tid visas separat. Ekonomiska värden bygger på attesterad tid." />
      {isError ? <QueryError title="Projektekonomin kunde inte hämtas" description="Kontrollera anslutningen och försök igen." onRetry={() => void refetch()} /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-graphite-200 py-3 text-sm text-graphite-600">
            <span><strong className="text-graphite-950">{formatHours(totals.reported)}</strong> rapporterat</span>
            <span><strong className="text-graphite-950">{formatHours(totals.approved)}</strong> attesterat</span>
            <span><strong className={totals.unapproved ? 'text-amber-800' : 'text-graphite-950'}>{formatHours(totals.unapproved)}</strong> ej attesterat</span>
            <span><strong className={totals.result != null && totals.result < 0 ? 'text-rose-700' : 'text-graphite-950'}>{formatCurrency(totals.result)}</strong> resultat{totals.result == null ? ' (ofullständigt underlag)' : ''}</span>
          </div>
          <label className="relative mb-4 block max-w-xl">
            <span className="sr-only">Sök projekt</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-400" aria-hidden="true" />
            <input className="input pl-9" type="search" placeholder="Sök projekt eller kund" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {!rows.length ? <EmptyState title="Inga projekt matchar sökningen" /> : (
            <div className="overflow-x-auto border-y border-graphite-200 bg-white" tabIndex={0} aria-label="Projektekonomi, tabellen kan rullas i sidled på liten skärm">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="border-b border-graphite-200 bg-graphite-50 text-left text-xs font-semibold text-graphite-500"><tr><th className="px-3 py-3">Projekt</th><th className="px-3 py-3 text-right">Rapporterat</th><th className="px-3 py-3 text-right">Attesterat</th><th className="px-3 py-3 text-right">Ej attesterat</th><th className="px-3 py-3 text-right">Budget</th><th className="px-3 py-3 text-right">Intäkt</th><th className="px-3 py-3 text-right">Kostnad</th><th className="px-3 py-3 text-right">Resultat</th></tr></thead>
                <tbody className="divide-y divide-graphite-200">{rows.map((item) => <tr key={item.project.id} className="hover:bg-primary-50/50"><td className="px-3 py-3">{user?.role === 'ACCOUNTANT' ? <span className="font-semibold text-graphite-950">{item.project.code} · {item.project.name}</span> : <Link className="font-semibold text-graphite-950 hover:text-primary-700" to={`/projects/${item.project.id}`}>{item.project.code} · {item.project.name}</Link>}<p className="mt-1 text-xs text-graphite-500">{item.project.customer?.name || 'Intern'}{item.warnings[0] ? ` · ${item.warnings[0]}` : ''}</p></td><td className="px-3 py-3 text-right tabular-nums">{formatHours(item.reportedHours)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{formatHours(item.approvedHours)}</td><td className={`px-3 py-3 text-right tabular-nums ${item.unapprovedHours ? 'font-semibold text-amber-800' : ''}`}>{formatHours(item.unapprovedHours)}</td><td className="px-3 py-3 text-right tabular-nums">{item.budgetHours ? `${formatHours(item.budgetHours)} (${formatPercent(item.approvedHours / item.budgetHours * 100)})` : '—'}</td><td className="px-3 py-3 text-right tabular-nums">{item.revenue == null ? '—' : formatCurrency(item.revenue)}</td><td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.laborCost + item.materialCost)}</td><td className={`px-3 py-3 text-right font-semibold tabular-nums ${item.result != null && item.result < 0 ? 'text-rose-700' : ''}`}>{item.result == null ? '—' : formatCurrency(item.result)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
