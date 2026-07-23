import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit2, FileSpreadsheet, Plus, Power, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import type { MaterialArticle, MaterialCategory, MaterialImportPreview } from '../types';
import { AppShell, Button, ConfirmDialog, DataTable, Dialog, EmptyState, FormField, PageHeader, StatusBadge, TaskSection } from '../components/ui/design';
import { formatCurrency, parseSwedishNumber } from '../utils/format';

const categories: MaterialCategory[] = ['Rörskål', 'Armaflex', 'Lamellmatta', 'Plåt', 'Tejp', 'Brandtätning', 'Skruv/nit', 'Övrigt'];

type MaterialForm = {
  name: string;
  articleNumber: string;
  category: MaterialCategory;
  unit: string;
  supplier: string;
  manufacturer: string;
  listPrice: string;
  discountPercent: string;
  purchasePrice: string;
  defaultUnitPrice: string;
  markupPercent: string;
  employeeVisible: boolean;
};

const emptyForm: MaterialForm = {
  name: '',
  articleNumber: '',
  category: 'Övrigt',
  unit: 'st',
  supplier: '',
  manufacturer: '',
  listPrice: '',
  discountPercent: '',
  purchasePrice: '',
  defaultUnitPrice: '',
  markupPercent: '',
  employeeVisible: true,
};

export default function Materials() {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<MaterialImportPreview | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<MaterialArticle | null>(null);

  const { data: articles, isLoading } = useQuery({
    queryKey: ['material-articles', showInactive],
    queryFn: () => projectsApi.listMaterialArticles(showInactive ? undefined : true),
  });

  const toPayload = () => ({
    name: form.name.trim(),
    articleNumber: form.articleNumber.trim() || undefined,
    category: form.category,
    unit: form.unit.trim() || 'st',
    supplier: form.supplier.trim() || undefined,
    manufacturer: form.manufacturer.trim() || undefined,
    listPrice: form.listPrice ? parseSwedishNumber(form.listPrice) : undefined,
    discountPercent: form.discountPercent ? parseSwedishNumber(form.discountPercent) : undefined,
    purchasePrice: form.purchasePrice ? parseSwedishNumber(form.purchasePrice) : undefined,
    defaultUnitPrice: form.defaultUnitPrice ? parseSwedishNumber(form.defaultUnitPrice) : undefined,
    markupPercent: form.markupPercent ? parseSwedishNumber(form.markupPercent) : undefined,
    employeeVisible: form.employeeVisible,
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
      setDeletingArticle(null);
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => projectsApi.importMaterialArticlesExcel(file),
    onSuccess: (result) => {
      setImportErrors([]);
      setPendingImportFile(null);
      setImportPreview(null);
      toast.success(`Importerade ${result.imported} artiklar (${result.created} nya, ${result.updated} uppdaterade)`);
      queryClient.invalidateQueries({ queryKey: ['material-articles'] });
      if (importInputRef.current) importInputRef.current.value = '';
    },
    onError: (error: Error & { errors?: Array<{ row: number; message: string }> }) => {
      setImportErrors(error.errors || []);
      toast.error(error.message || 'Import misslyckades');
      if (importInputRef.current) importInputRef.current.value = '';
    },
  });

  const previewImportMutation = useMutation({
    mutationFn: (file: File) => projectsApi.previewMaterialArticlesImport(file),
    onSuccess: (result) => {
      setImportErrors([]);
      setImportPreview(result);
    },
    onError: (error: Error & { errors?: Array<{ row: number; message: string }> }) => {
      setPendingImportFile(null);
      setImportPreview(null);
      setImportErrors(error.errors || []);
      toast.error(error.message || 'Kunde inte förhandsgranska importen');
      if (importInputRef.current) importInputRef.current.value = '';
    },
  });

  const startEdit = (article: MaterialArticle) => {
    setEditingId(article.id);
    setForm({
      name: article.name,
      articleNumber: article.articleNumber || '',
      category: article.category || 'Övrigt',
      unit: article.unit || 'st',
      supplier: article.supplier || '',
      manufacturer: article.manufacturer || '',
      listPrice: article.listPrice != null ? String(article.listPrice).replace('.', ',') : '',
      discountPercent: article.discountPercent != null ? String(article.discountPercent).replace('.', ',') : '',
      purchasePrice: article.purchasePrice != null ? String(article.purchasePrice).replace('.', ',') : '',
      defaultUnitPrice: article.defaultUnitPrice != null ? String(article.defaultUnitPrice).replace('.', ',') : '',
      markupPercent: article.markupPercent != null ? String(article.markupPercent).replace('.', ',') : '',
      employeeVisible: article.employeeVisible,
    });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) updateMutation.mutate();
    else createMutation.mutate();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const exportMaterials = async () => {
    setIsExporting(true);
    try {
      const blob = await projectsApi.exportMaterialArticlesExcel();
      downloadBlob(blob, 'materialregister.xlsx');
      toast.success('Materialregister exporterat');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte exportera material');
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const blob = await projectsApi.downloadMaterialTemplate();
      downloadBlob(blob, 'materialmall.xlsx');
      toast.success('Excel-mall nedladdad');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ladda ner mall');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Materialregister"
        description="Hantera artiklar, kategorier och enheter som sedan används på projekten."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={downloadTemplate} disabled={isDownloadingTemplate}>
              <FileSpreadsheet className="h-4 w-4" />
              {isDownloadingTemplate ? 'Hämtar mall...' : 'Ladda ner mall'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setPendingImportFile(file);
                  previewImportMutation.mutate(file);
                }
              }}
            />
            <button className="btn-secondary" onClick={() => importInputRef.current?.click()} disabled={previewImportMutation.isPending || importMutation.isPending}>
              <FileSpreadsheet className="h-4 w-4" />
              {previewImportMutation.isPending ? 'Läser fil...' : importMutation.isPending ? 'Importerar...' : 'Importera prisfil'}
            </button>
            <button className="btn-secondary" onClick={exportMaterials} disabled={isExporting}>
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporterar...' : 'Exportera Excel'}
            </button>
            <button className="btn-secondary" onClick={() => setShowInactive((value) => !value)}>
              {showInactive ? 'Visa aktiva' : 'Visa även inaktiva'}
            </button>
          </div>
        }
      />

      {importErrors.length > 0 && (
        <TaskSection className="border-rose-200 bg-rose-50">
          <h2 className="section-title text-rose-900">Importen innehåller fel</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">
            {importErrors.map((error) => <li key={`${error.row}-${error.message}`}>Rad {error.row}: {error.message}</li>)}
          </ul>
        </TaskSection>
      )}

      <TaskSection title={editingId ? 'Redigera materialartikel' : 'Ny materialartikel'}>
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
          <FormField label="Leverantör">
            <input className="input" value={form.supplier} onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Bevego" />
          </FormField>
          <FormField label="Fabrikat">
            <input className="input" value={form.manufacturer} onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Armacell" />
          </FormField>
          <FormField label="Bevego listpris">
            <input className="input" inputMode="decimal" value={form.listPrice} onChange={(event) => setForm((current) => ({ ...current, listPrice: event.target.value }))} />
          </FormField>
          <FormField label="Rabatt %">
            <input className="input" inputMode="decimal" value={form.discountPercent} onChange={(event) => setForm((current) => ({ ...current, discountPercent: event.target.value }))} />
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
          <label className="flex min-h-11 items-center gap-3 border-y border-graphite-200 px-1 text-sm text-graphite-800">
            <input type="checkbox" checked={form.employeeVisible} onChange={(event) => setForm((current) => ({ ...current, employeeVisible: event.target.checked }))} />
            Synlig för anställda
          </label>
          <div className="flex items-end gap-2 md:col-span-4">
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
      </TaskSection>

      <TaskSection title="Materialartiklar">
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
                  <th className="px-3 py-2">Typ och leverantör</th>
                  <th className="px-3 py-2">Enhet</th>
                  <th className="px-3 py-2">Bevego lista</th>
                  <th className="px-3 py-2">Inköp</th>
                  <th className="px-3 py-2">Försäljning</th>
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
                      {article.originalDescription && <div className="mt-1 max-w-[360px] truncate text-xs text-slate-500">{article.originalDescription}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div>{article.category}</div>
                      <div className="text-xs text-slate-500">{[article.supplier, article.manufacturer].filter(Boolean).join(' · ') || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{article.unit}</td>
                    <td className="px-3 py-2">{formatCurrency(article.listPrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(article.purchasePrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(article.defaultUnitPrice)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge label={article.active ? 'Aktiv' : 'Inaktiv'} tone={article.active ? 'green' : 'gray'} />
                        {!article.employeeVisible && <span className="text-xs text-slate-500">Dold för anställda</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button type="button" onClick={() => startEdit(article)} className="icon-button border-0 text-graphite-500 hover:bg-primary-50 hover:text-primary-700" title="Redigera" aria-label="Redigera materialartikel">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {article.active && (
                          <button type="button" onClick={() => setDeletingArticle(article)} className="icon-button border-0 text-rose-600 hover:bg-rose-50" title="Inaktivera" aria-label="Inaktivera materialartikel">
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
      </TaskSection>
      <ConfirmDialog open={Boolean(deletingArticle)} onClose={() => setDeletingArticle(null)} onConfirm={() => deletingArticle && deleteMutation.mutate(deletingArticle.id)} title="Inaktivera materialartikel" description={deletingArticle ? `${deletingArticle.name} kan inte väljas på nya materialrader.` : undefined} confirmLabel="Inaktivera" isLoading={deleteMutation.isPending} />
      <Dialog
        open={Boolean(importPreview && pendingImportFile)}
        onClose={() => {
          setImportPreview(null);
          setPendingImportFile(null);
          if (importInputRef.current) importInputRef.current.value = '';
        }}
        title="Kontrollera materialimport"
        description={importPreview ? `${importPreview.filename} · ${importPreview.totalRows.toLocaleString('sv-SE')} artiklar` : undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setImportPreview(null);
                setPendingImportFile(null);
                if (importInputRef.current) importInputRef.current.value = '';
              }}
            >
              Avbryt
            </button>
            <Button
              type="button"
              isLoading={importMutation.isPending}
              onClick={() => pendingImportFile && importMutation.mutate(pendingImportFile)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Bekräfta import
            </Button>
          </div>
        }
      >
        {importPreview && (
          <div className="space-y-4">
            <p className="border-y border-graphite-200 py-3 text-sm leading-6 text-graphite-700">
              <strong>{importPreview.created.toLocaleString('sv-SE')}</strong> nya artiklar skapas och{' '}
              <strong>{importPreview.updated.toLocaleString('sv-SE')}</strong> befintliga uppdateras.
              {importPreview.hiddenFromEmployees > 0 && (
                <> <strong>{importPreview.hiddenFromEmployees.toLocaleString('sv-SE')}</strong> okategoriserade artiklar blir dolda för anställda.</>
              )}
            </p>
            <div className="max-h-[420px] overflow-y-auto border-y border-graphite-200">
              <div className="sticky top-0 hidden grid-cols-[minmax(0,1fr)_90px_72px_72px] gap-2 bg-graphite-50 px-3 py-2 text-xs font-semibold uppercase text-graphite-500 sm:grid">
                <span>Montörsnamn</span>
                <span>Artikelnr</span>
                <span className="text-right">Lista</span>
                <span className="text-right">Inköp</span>
              </div>
              <div className="divide-y divide-graphite-100">
                {importPreview.previewRows.map((row) => (
                  <div key={`${row.sourceRow}-${row.articleNumber || row.name}`} className="px-3 py-3 text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_90px_72px_72px] sm:items-center sm:gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-graphite-950">{row.name}</div>
                      <div className="truncate text-xs text-graphite-500">{row.originalDescription || '-'}</div>
                    </div>
                    <div className="mt-2 text-xs tabular-nums text-graphite-700 sm:mt-0">{row.articleNumber || '-'}</div>
                    <div className="mt-1 flex justify-between text-xs tabular-nums sm:mt-0 sm:block sm:text-right">
                      <span className="text-graphite-500 sm:hidden">Listpris</span>
                      <span>{formatCurrency(row.listPrice)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs tabular-nums sm:mt-0 sm:block sm:text-right">
                      <span className="text-graphite-500 sm:hidden">Inköpspris</span>
                      <span>{formatCurrency(row.purchasePrice)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {importPreview.previewLimited && (
              <p className="text-xs text-graphite-500">Förhandsvisningen visar de första 60 artiklarna. Sammanräkningen ovan gäller hela filen.</p>
            )}
          </div>
        )}
      </Dialog>
    </AppShell>
  );
}
