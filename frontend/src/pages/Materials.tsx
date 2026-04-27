import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, Power, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import type { MaterialArticle, MaterialCategory } from '../types';
import { AppShell, Button, Card, DataTable, EmptyState, FormField, PageHeader, StatusBadge } from '../components/ui/design';
import { formatCurrency, parseSwedishNumber } from '../utils/format';

const categories: MaterialCategory[] = ['Rörskål', 'Lamellmatta', 'Plåt', 'Tejp', 'Brandtätning', 'Skruv/nit', 'Övrigt'];

type MaterialForm = {
  name: string;
  articleNumber: string;
  category: MaterialCategory;
  unit: string;
  purchasePrice: string;
  defaultUnitPrice: string;
  markupPercent: string;
};

const emptyForm: MaterialForm = {
  name: '',
  articleNumber: '',
  category: 'Övrigt',
  unit: 'st',
  purchasePrice: '',
  defaultUnitPrice: '',
  markupPercent: '',
};

export default function Materials() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: articles, isLoading } = useQuery({
    queryKey: ['material-articles', showInactive],
    queryFn: () => projectsApi.listMaterialArticles(showInactive ? undefined : true),
  });

  const toPayload = () => ({
    name: form.name.trim(),
    articleNumber: form.articleNumber.trim() || undefined,
    category: form.category,
    unit: form.unit.trim() || 'st',
    purchasePrice: form.purchasePrice ? parseSwedishNumber(form.purchasePrice) : undefined,
    defaultUnitPrice: form.defaultUnitPrice ? parseSwedishNumber(form.defaultUnitPrice) : undefined,
    markupPercent: form.markupPercent ? parseSwedishNumber(form.markupPercent) : undefined,
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const createMutation = useMutation({
    mutationFn: () => projectsApi.createMaterialArticle(toPayload()),
    onSuccess: () => {
      toast.success('Materialartikel skapad');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => projectsApi.updateMaterialArticle(editingId || '', toPayload()),
    onSuccess: () => {
      toast.success('Materialartikel uppdaterad');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.deleteMaterialArticle,
    onSuccess: () => {
      toast.success('Materialartikel inaktiverad');
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startEdit = (article: MaterialArticle) => {
    setEditingId(article.id);
    setForm({
      name: article.name,
      articleNumber: article.articleNumber || '',
      category: article.category || 'Övrigt',
      unit: article.unit || 'st',
      purchasePrice: article.purchasePrice != null ? String(article.purchasePrice).replace('.', ',') : '',
      defaultUnitPrice: article.defaultUnitPrice != null ? String(article.defaultUnitPrice).replace('.', ',') : '',
      markupPercent: article.markupPercent != null ? String(article.markupPercent).replace('.', ',') : '',
    });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <AppShell>
      <PageHeader
        title="Materialregister"
        description="Hantera artiklar, kategorier, inköpspris och försäljningspris som sedan används på projekten."
        action={
          <button className="btn-secondary" onClick={() => setShowInactive((value) => !value)}>
            {showInactive ? 'Visa aktiva' : 'Visa även inaktiva'}
          </button>
        }
      />

      <Card>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
          <div className="flex items-end gap-2">
            <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending} disabledReason={!form.name.trim() ? 'Ange artikel' : null}>
              {editingId ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? 'Spara' : 'Skapa'}
            </Button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary">
                <X className="h-4 w-4" />
              </button>
            )}
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
                <tr>
                  <th className="px-3 py-2">Artikel</th>
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Enhet</th>
                  <th className="px-3 py-2">Inköp</th>
                  <th className="px-3 py-2">Försäljning</th>
                  <th className="px-3 py-2">Påslag</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">{article.name}</div>
                      <div className="text-xs text-slate-500">{article.articleNumber || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{article.category}</td>
                    <td className="px-3 py-2">{article.unit}</td>
                    <td className="px-3 py-2">{formatCurrency(article.purchasePrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(article.defaultUnitPrice)}</td>
                    <td className="px-3 py-2">{article.markupPercent != null ? `${article.markupPercent.toLocaleString('sv-SE')} %` : '-'}</td>
                    <td className="px-3 py-2"><StatusBadge label={article.active ? 'Aktiv' : 'Inaktiv'} tone={article.active ? 'green' : 'gray'} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button type="button" onClick={() => startEdit(article)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Redigera">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {article.active && (
                          <button type="button" onClick={() => window.confirm('Inaktivera artikeln?') && deleteMutation.mutate(article.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Inaktivera">
                            <Power className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
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
