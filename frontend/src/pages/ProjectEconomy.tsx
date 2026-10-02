import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { projectPortfolioApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { AppShell, EmptyState, PageHeader } from '../components/ui/design';
import { ListSkeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { formatCurrency, formatHours } from '../utils/format';

export default function ProjectEconomy() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['project-portfolio'], queryFn: projectPortfolioApi.get });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('sv');
    return (data || []).filter((item) => (!status || item.project.status === status)
      && (!onlyIncomplete || item.warnings.length > 0 || item.unapprovedHours > 0)
      && (!term || [item.project.code, item.project.name, item.project.customer?.name].filter(Boolean).some((value) => value!.toLocaleLowerCase('sv').includes(term))));
  }, [data, search, status, onlyIncomplete]);
  const totals = useMemo(() => {
    const sum = rows.reduce((result, item) => ({ reported: result.reported + item.reportedHours, approved: result.approved + item.approvedHours, unapproved: result.unapproved + item.unapprovedHours, calculatedResult: result.calculatedResult + (item.result ?? 0) }), { reported: 0, approved: 0, unapproved: 0, calculatedResult: 0 });
    return { ...sum, result: !rows.length || rows.some((item) => item.result == null) ? null : sum.calculatedResult };
  }, [rows]);

  if (isLoading) return <ListSkeleton />;
  return (
    <AppShell>
      <PageHeader title="Projektekonomi" description="Beräknade belopp från attesterad tid och registrerad materialåtgång." action={user?.role !== 'ACCOUNTANT' ? <Link to="/projects" className="btn-secondary">Till projekten</Link> : undefined} />
      {isError ? <QueryError title="Projektekonomin kunde inte hämtas" description="Kontrollera anslutningen och försök igen." onRetry={() => void refetch()} /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-graphite-200 py-3 text-sm text-graphite-600">
            <span><strong className="text-graphite-950">{formatHours(totals.reported)}</strong> rapporterat</span>
            <span><strong className="text-graphite-950">{formatHours(totals.approved)}</strong> attesterat</span>
            <span><strong className={totals.unapproved ? 'text-amber-800' : 'text-graphite-950'}>{formatHours(totals.unapproved)}</strong> ej attesterat</span>
            <span><strong className={totals.result != null && totals.result < 0 ? 'text-rose-700' : 'text-graphite-950'}>{formatCurrency(totals.result)}</strong> beräknat resultat{rows.length > 0 && totals.result == null ? ' · Underlag saknas' : ''}</span>
            <span>{rows.length} projekt i urvalet</span>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative block min-w-0 flex-1 basis-56">
            <span className="sr-only">Sök projekt</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-400" aria-hidden="true" />
            <input className="input pl-9" type="search" placeholder="Sök projekt eller kund" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="input w-auto" aria-label="Projektstatus" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Alla aktiva projekt</option><option value="ONGOING">Pågående</option><option value="PLANNED">Planerade</option><option value="COMPLETED">Avslutade</option>
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyIncomplete} onChange={(event) => setOnlyIncomplete(event.target.checked)} />Underlag att följa upp</label>
          </div>
          <p className="mb-4 max-w-3xl text-sm text-graphite-600">Beloppen är exklusive moms. Fastpris visar avtalat pris minus hittills registrerade kostnader. Återstående arbete ingår inte. Fakturerat och betalt belopp saknas ännu.</p>
          {!rows.length ? <EmptyState title="Inga projekt matchar sökningen" /> : (
            <div className="divide-y divide-graphite-200 border-y border-graphite-200 bg-white">
              {rows.map((item) => <article key={item.project.id} className="px-3 py-4" aria-label={`${item.project.code} · ${item.project.name}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {user?.role === 'ACCOUNTANT' ? <h2 className="font-semibold text-graphite-950">{item.project.code} · {item.project.name}</h2> : <Link className="inline-flex min-h-11 items-center font-semibold text-graphite-950 hover:text-primary-700 [overflow-wrap:anywhere]" to={`/projects/${item.project.id}`}>{item.project.code} · {item.project.name}</Link>}
                    <p className="text-xs text-graphite-600">{item.project.customer?.name || 'Intern'} · {item.billingModel === 'FIXED' ? 'Fastpris' : 'Löpande'}</p>
                  </div>
                  <p className="text-sm text-graphite-600">{formatHours(item.reportedHours)} rapporterat{item.budgetHours != null ? ` / ${formatHours(item.budgetHours)} budget` : ''}<br /><span>{formatHours(item.approvedHours)} attesterat</span>{item.unapprovedHours > 0 && <span className="text-amber-800"> · {formatHours(item.unapprovedHours)} kvar</span>}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-4">
                  <div><dt className="text-graphite-600">Arbetskostnad</dt><dd className="mt-1 tabular-nums">{money(item.laborCost)}</dd></div>
                  <div><dt className="text-graphite-600">Material enligt åtgång</dt><dd className="mt-1 tabular-nums">{money(item.materialCost)}</dd></div>
                  <div><dt className="text-graphite-600">Beräknad intäkt</dt><dd className="mt-1 tabular-nums">{money(item.revenue)}</dd></div>
                  <div><dt className="text-graphite-600">Beräknat resultat</dt><dd className={`mt-1 font-semibold tabular-nums ${item.result != null && item.result < 0 ? 'text-rose-700' : ''}`}>{money(item.result)}</dd></div>
                </dl>
                {item.warnings.length > 0 && <p className="mt-3 text-sm text-amber-800">{item.warnings.join(' · ')}</p>}
              </article>)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function money(value: number | null) {
  return value == null ? 'Underlag saknas' : formatCurrency(value);
}
