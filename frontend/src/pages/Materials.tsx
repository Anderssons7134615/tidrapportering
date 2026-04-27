import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import type { MaterialCategory } from '../types';
import { AppShell, Button, Card, DataTable, EmptyState, FormField, PageHeader, StatusBadge } from '../components/ui/design';
import { formatCurrency, parseSwedishNumber } from '../utils/format';

const categories: MaterialCategory[] = ['Rörskål', 'Lamellmatta', 'Plåt', 'Tejp', 'Brandtätning', 'Skruv/nit', 'Övrigt'];

export default function Materials() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    articleNumber: '',
    category: 'Övrigt' as MaterialCategory,
    unit: 'st',
    purchasePrice: '',
    defaultUnitPrice: '',
    markupPercent: '',
  });

  const { data: articles, isLoading } = useQuery({
    queryKey: ['material-articles'],
    queryFn: () => projectsApi.listMaterialArticles(),
  });

  const createMutation = useMutation({
    mutationFn: () => projectsApi.createMaterialArticle({
      name: form.name.trim(),
      articleNumber: form.articleNumber.trim() || undefined,
      category: form.category,
      unit: form.unit.trim() || 'st',
      purchasePrice: form.purchasePrice ? parseSwedishNumber(form.purchasePrice) : undefined,
      defaultUnitPrice: form.defaultUnitPrice ? parseSwedishNumber(form.defaultUnitPrice) : undefined,
      markupPercent: form.markupPercent ? parseSwedishNumber(form.markupPercent) : undefined,
    }),
    onSuccess: () => {
      toast.success('Materialartikel skapad');
      setForm((current) => ({ ...current, name: '', articleNumber: '', purchasePrice: '', defaultUnitPrice: '', markupPercent: '' }));
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader title="Materialregister" description="Hantera artiklar som kan registreras på projekt." />

      <Card>
        <form onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <FormField label="Artikel">
            <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </FormField>
          <FormField label="Artikelnummer">
            <input className="input" value={form.articleNumber} onChange={(event) => setForm((current) => ({ ...current, articleNumber: event.target.value }))} />
          </FormField>
          <FormField label="Kategori">
            <select className="input" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as MaterialCategory }))}>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </FormField>
          <FormField label="Enhet">
            <input className="input" value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} required />
          </FormField>
          <FormField label="Inköpspris">
            <input className="input" inputMode="decimal" value={form.purchasePrice} onChange={(event) => setForm((current) => ({ ...current, purchasePrice: event.target.value }))} />
          </FormField>
          <FormField label="Försäljningspris">
            <input className="input" inputMode="decimal" value={form.defaultUnitPrice} onChange={(event) => setForm((current) => ({ ...current, defaultUnitPrice: event.target.value }))} />
          </FormField>
          <FormField label="Påslag %">
            <input className="input" inputMode="decimal" value={form.markupPercent} onChange={(event) => setForm((current) => ({ ...current, markupPercent: event.target.value }))} />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" isLoading={createMutation.isPending} disabledReason={!form.name.trim() ? 'Ange artikel' : null}><Plus className="h-4 w-4" /> Skapa</Button>
          </div>
        </form>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-500">Laddar material...</p>
        ) : !articles?.length ? (
          <EmptyState title="Inga materialartiklar" description="Skapa första artikeln för att kunna registrera material på projekt." />
        ) : (
          <DataTable>
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2">Artikel</th><th className="px-3 py-2">Kategori</th><th className="px-3 py-2">Enhet</th><th className="px-3 py-2">Inköp</th><th className="px-3 py-2">Försäljning</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-b border-slate-100">
                    <td className="px-3 py-2"><div className="font-semibold text-slate-900">{article.name}</div><div className="text-xs text-slate-500">{article.articleNumber || '-'}</div></td>
                    <td className="px-3 py-2">{article.category}</td>
                    <td className="px-3 py-2">{article.unit}</td>
                    <td className="px-3 py-2">{formatCurrency(article.purchasePrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(article.defaultUnitPrice)}</td>
                    <td className="px-3 py-2"><StatusBadge label={article.active ? 'Aktiv' : 'Inaktiv'} tone={article.active ? 'green' : 'gray'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </Card>
    </AppShell>
  );
}
