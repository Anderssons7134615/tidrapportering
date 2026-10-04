import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { supplierInvoicesApi, projectsApi } from '../services/api';
import { AppShell, Button, ConfirmDialog, Dialog, EmptyState, FormField, PageHeader, StatusBadge, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { formatDate } from '../utils/format';
import { refreshProjectQueries } from '../utils/projectQueries';
import { formToDraft, invoiceToForm, moneyInput, parseMoneyInput, type InvoiceForm } from '../utils/invoiceForm';
import type { InvoiceStatus, SupplierInvoice } from '../types/supplierInvoice';
import { InvoiceOriginal } from '../components/InvoiceOriginal';

const labels: Record<InvoiceStatus, string> = { DRAFT: 'Att kontrollera', CONFIRMED: 'Bekräftad', VOID: 'Makulerad' };
const money = (ore: number | null) => ore == null ? '—' : new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ore / 100);
function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  return <StatusBadge tone={status === 'CONFIRMED' ? 'green' : status === 'DRAFT' ? 'yellow' : 'gray'} label={labels[status]} />;
}

export default function Purchases() {
  return <AppShell><PageHeader title="Inköp" description="Leverantörsfakturor och krediter, fördelade på projekt." /><InvoiceList /></AppShell>;
}

export function InvoiceList({ projectId }: { projectId?: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [projectStatus, setProjectStatus] = useState<InvoiceStatus | ''>('');
  const urlStatus = searchParams.get('status');
  const status = projectId ? projectStatus : (urlStatus === 'DRAFT' || urlStatus === 'CONFIRMED' || urlStatus === 'VOID' ? urlStatus : '');
  const setStatus = (next: InvoiceStatus | '') => {
    if (projectId) setProjectStatus(next);
    else setSearchParams((current) => { const params = new URLSearchParams(current); if (next) params.set('status', next); else params.delete('status'); return params; });
    setPage(1);
  };
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [status]);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const query = useQuery({ queryKey: ['supplier-invoices', { projectId, status, page, search: debouncedSearch }], queryFn: () => supplierInvoicesApi.list({ projectId, status: status || undefined, page, search: debouncedSearch }) });
  const upload = useMutation({ mutationFn: supplierInvoicesApi.upload, onSuccess: async ({ invoice, duplicate }) => {
    await Promise.all([client.invalidateQueries({ queryKey: ['supplier-invoices'] }), refreshProjectQueries(client)]);
    toast.success(duplicate ? 'Originalet finns redan. Den befintliga fakturan öppnas.' : 'Originalet är sparat. Kontrollera uppgifterna.');
    navigate(`/purchases/${invoice.id}${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`);
  }, onError: (error: Error) => toast.error(error.message) });
  return <div className="space-y-4">
    <TaskSection>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="section-title">{projectId ? 'Projektets inköp' : 'Leverantörsfakturor'}</h2>
          {projectId && query.data && <p className="mt-1 text-lg font-semibold tabular-nums">{money(query.data.confirmedProjectNetOre)} <span className="text-sm font-normal">bekräftat, exkl. moms</span></p>}
          <p className="mt-1 text-sm text-graphite-600">{projectId ? 'Inköp visas separat från registrerad materialåtgång och ingår inte en gång till i projektresultatet.' : 'Ladda upp PDF, kontrollera uppgifterna och fördela nettobeloppet. Bekräftelse här bokför eller betalar inte fakturan.'}</p>
        </div>
        <Button type="button" onClick={() => fileInput.current?.click()} isLoading={upload.isPending}><Upload size={17} aria-hidden="true" />Ladda upp PDF</Button>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) { toast.error('Filen får vara högst 10 MB.'); return; }
          upload.mutate(file);
        }} />
      </div>
      {upload.isPending && <p className="mt-3 text-sm" role="status">Sparar original och läser text. Det kan ta några sekunder…</p>}
    </TaskSection>
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Sök leverantör eller fakturanummer" controlId="invoice-search"><input id="invoice-search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} /></FormField>
      <FormField label="Visa" controlId="invoice-status"><select id="invoice-status" className="input" value={status} onChange={(event) => { setStatus(event.target.value as InvoiceStatus | ''); setPage(1); }}><option value="">Alla</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
    </div>
    {query.isLoading ? <TaskSection><p role="status">Laddar fakturor…</p></TaskSection> : query.isError ? <QueryError title="Fakturorna kunde inte hämtas" onRetry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState title={search || status ? 'Inga fakturor matchar' : 'Inga fakturor ännu'} description={projectId ? 'Ladda upp ett original och välj projekt i fördelningen.' : 'Börja med en leverantörsfaktura i PDF-format.'} /> : <div className="data-list">
      {query.data.items.map((invoice) => <Link key={invoice.id} to={`/purchases/${invoice.id}${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`} className="flex min-h-20 flex-wrap items-center justify-between gap-3 p-4 hover:bg-graphite-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold break-words">{invoice.supplierName || 'Leverantör saknas'}</span><InvoiceBadge status={invoice.status} /></div>
          <p className="mt-1 break-words text-sm text-graphite-600">{invoice.documentType === 'CREDIT' ? 'Kredit ' : 'Faktura '}{invoice.invoiceNumber || 'utan nummer'} · {invoice.issueDate ? formatDate(invoice.issueDate) : 'Datum saknas'}</p>
          <p className="mt-1 text-sm">{invoice.unallocatedOre == null ? 'Nettobelopp saknas' : invoice.unallocatedOre !== 0 ? `${money(invoice.unallocatedOre)} kvar att fördela` : 'Helt fördelad'}</p>
        </div><span className="text-right font-semibold tabular-nums">{money(projectId ? invoice.allocations.find((row) => row.projectId === projectId)?.netOre ?? null : invoice.netOre)}<span className="block text-xs font-normal">exkl. moms</span></span>
      </Link>)}
    </div>}
    {query.data && query.data.total > 25 && <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Föregående</Button><span>Sida {page} av {Math.ceil(query.data.total / 25)}</span><Button variant="secondary" disabled={page * 25 >= query.data.total} onClick={() => setPage(page + 1)}>Nästa</Button></div>}
  </div>;
}

export function PurchaseDetail() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const query = useQuery({ queryKey: ['supplier-invoice', id], queryFn: () => supplierInvoicesApi.get(id), refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <AppShell><Link to={projectId ? `/projects/${encodeURIComponent(projectId)}?tab=purchases` : '/purchases'} className="text-link inline-flex min-h-11 items-center gap-2"><ArrowLeft size={16} aria-hidden="true" />{projectId ? 'Till projektets inköp' : 'Alla inköp'}</Link>
    {query.isLoading ? <TaskSection><p role="status">Laddar faktura…</p></TaskSection> : query.isError ? <QueryError title="Fakturan kunde inte hämtas" onRetry={() => void query.refetch()} /> : query.data && <InvoiceEditor key={`${query.data.id}:${query.data.revision}`} invoice={query.data} />}
  </AppShell>;
}

function InvoiceEditor({ invoice }: { invoice: SupplierInvoice }) {
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const errorRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<InvoiceForm>(() => invoiceToForm(invoice));
  const [reviewed, setReviewed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardAction, setDiscardAction] = useState<'reset' | 'refresh' | null>(null);
  const [action, setAction] = useState<'reopen' | 'void' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const editable = invoice.status === 'DRAFT';
  const dirty = JSON.stringify(form) !== JSON.stringify(invoiceToForm(invoice));
  const blocker = useBlocker(dirty);
  const projects = useQuery({ queryKey: ['projects', 'invoice-allocation'], queryFn: () => projectsApi.list({ active: true }), enabled: editable });
  useEffect(() => { if (error) { errorRef.current?.scrollIntoView({ block: 'nearest' }); errorRef.current?.focus(); } }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const update = <K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) => { setForm((current) => ({ ...current, [key]: value })); setReviewed(false); setError(''); };
  const finished = async (row: SupplierInvoice) => {
    client.setQueryData(['supplier-invoice', row.id], row);
    await Promise.all([client.invalidateQueries({ queryKey: ['supplier-invoices'] }), refreshProjectQueries(client)]);
    toast.success(row.status === 'CONFIRMED' ? 'Fakturan är bekräftad.' : row.status === 'VOID' ? 'Fakturan är makulerad.' : 'Utkastet är sparat.');
  };
  const mutation = useMutation({ mutationFn: async (task: 'save' | 'confirm' | 'reopen' | 'void') => {
    setError('');
    if (task === 'save') return supplierInvoicesApi.save(invoice.id, formToDraft(form, invoice.revision));
    if (task === 'confirm') return supplierInvoicesApi.confirm(invoice.id, invoice.revision);
    return supplierInvoicesApi.changeStatus(invoice.id, invoice.revision, task, reason);
  }, onSuccess: finished, onError: (failure: Error) => { setError(failure.message); setConfirmOpen(false); setAction(null); } });
  const download = async () => {
    setDownloading(true);
    try { const blob = await supplierInvoicesApi.document(invoice.id); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = invoice.document?.originalName || 'faktura.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Originalet kunde inte hämtas.'); }
    finally { setDownloading(false); }
  };
  let remainder: number | null = null;
  try { const net = parseMoneyInput(form.net); if (net != null) remainder = net - form.allocations.reduce((sum, row) => sum + (parseMoneyInput(row.amount) ?? 0), 0); } catch { /* The save action provides a field explanation. */ }
  const textField = (key: 'supplierName' | 'supplierOrgNumber' | 'invoiceNumber' | 'issueDate' | 'dueDate' | 'net' | 'vat' | 'rounding' | 'gross', label: string, type = 'text') => <FormField key={key} label={label} controlId={`invoice-${key}`}><input id={`invoice-${key}`} className="input" type={type} inputMode={['net', 'vat', 'rounding', 'gross'].includes(key) ? 'decimal' : undefined} value={form[key] || ''} onChange={(event) => update(key, event.target.value)} /></FormField>;
  return <>
    <PageHeader title={invoice.invoiceNumber ? `Faktura ${invoice.invoiceNumber}` : 'Kontrollera fakturan'} action={<Button variant="secondary" isLoading={downloading} onClick={() => void download()}><Download size={17} aria-hidden="true" />Hämta original</Button>} />
    <div className="flex flex-wrap items-center gap-3"><InvoiceBadge status={invoice.status} /><span className="text-sm break-all">{invoice.document?.originalName}</span></div>
    {invoice.statusReason && <p className="text-sm">Orsak: {invoice.statusReason}</p>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    <InvoiceOriginal invoiceId={invoice.id} />
    <div className="min-w-0 space-y-4">
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4"><p>{error}</p><button type="button" className="text-link mt-2 min-h-11" onClick={() => dirty ? setDiscardAction('refresh') : void client.invalidateQueries({ queryKey: ['supplier-invoice', invoice.id] })}>Hämta senaste sparade version</button></div>}
    {editable && <TaskSection title="Kontrollera mot originalet">
      <p className="text-sm text-graphite-600">Beloppen ska vara i SEK. Förslag från PDF:en behöver alltid kontrolleras. Bekräftelse här bokför eller betalar inte fakturan.</p>
      {!!invoice.parseWarnings?.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{invoice.parseWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {Object.values(invoice.suggestions || {}).some((value) => value != null) && <Button variant="secondary" className="mt-3" onClick={() => {
        const suggested = invoice.suggestions;
        setForm((current) => ({ ...current, supplierName: current.supplierName || suggested.supplierName || null, invoiceNumber: current.invoiceNumber || suggested.invoiceNumber || null,
          issueDate: current.issueDate || suggested.issueDate || null, dueDate: current.dueDate || suggested.dueDate || null,
          documentType: !current.net && !current.gross ? suggested.documentType || current.documentType : current.documentType,
          net: current.net || moneyInput(suggested.netOre), vat: current.vat || moneyInput(suggested.vatOre), gross: current.gross || moneyInput(suggested.grossOre),
          rounding: !current.net && !current.gross ? moneyInput(suggested.roundingOre ?? 0) : current.rounding }));
        setReviewed(false);
      }}>Fyll tomma fält med läsförslag</Button>}
    </TaskSection>}
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate('save'); }}>
      <fieldset disabled={!editable || mutation.isPending} className="min-w-0 space-y-4">
        <TaskSection title="Fakturauppgifter"><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
          {textField('supplierName', 'Leverantör')}{textField('supplierOrgNumber', 'Organisationsnummer / VAT-nummer')}{textField('invoiceNumber', 'Fakturanummer')}
          <FormField label="Typ" controlId="invoice-type"><select id="invoice-type" className="input" value={form.documentType} onChange={(event) => update('documentType', event.target.value as 'INVOICE' | 'CREDIT')}><option value="INVOICE">Faktura</option><option value="CREDIT">Kreditfaktura</option></select></FormField>
          {textField('issueDate', 'Fakturadatum', 'date')}{textField('dueDate', 'Förfallodatum', 'date')}
          {textField('net', 'Netto, exkl. moms (kr)')}{textField('vat', 'Moms (kr)')}{textField('rounding', 'Öresavrundning (kr)')}{textField('gross', 'Totalbelopp (kr)')}
        </div><p className="mt-3 text-sm text-graphite-600">Kreditbelopp anges med minus. Leverantörens organisationsnummer används för att upptäcka dubbletter.</p></TaskSection>
        <TaskSection title="Fördela på projekt">
          <p className="mb-4 text-sm text-graphite-600">Fördela nettobeloppet, exklusive moms. Samma faktura kan höra till flera projekt.</p>
          {projects.isError && <QueryError title="Projektlistan kunde inte hämtas" onRetry={() => void projects.refetch()} />}
          <div className="space-y-4">{form.allocations.map((row, index) => <div key={index} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-end gap-3 border-b border-graphite-200 pb-4">
            <FormField label="Projekt" controlId={`allocation-project-${index}`}><select id={`allocation-project-${index}`} className="input" value={row.projectId} onChange={(event) => update('allocations', form.allocations.map((item, i) => i === index ? { ...item, projectId: event.target.value } : item))}>
              <option value="">Välj projekt</option>
              {(projects.data || []).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
              {row.projectId && !(projects.data || []).some((project) => project.id === row.projectId) && <option value={row.projectId}>{invoice.allocations.find((allocation) => allocation.projectId === row.projectId)?.project.name || row.projectId}</option>}
            </select></FormField>
            <FormField label="Netto (kr)" controlId={`allocation-amount-${index}`}><input id={`allocation-amount-${index}`} className="input" inputMode="decimal" value={row.amount} onChange={(event) => update('allocations', form.allocations.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} /></FormField>
            <FormField label="Kommentar" controlId={`allocation-note-${index}`}><input id={`allocation-note-${index}`} className="input" maxLength={500} value={row.note} onChange={(event) => update('allocations', form.allocations.map((item, i) => i === index ? { ...item, note: event.target.value } : item))} /></FormField>
            {editable && <Button type="button" variant="secondary" onClick={() => update('allocations', form.allocations.filter((_, i) => i !== index))} aria-label={`Ta bort fördelningsrad ${index + 1}`}>Ta bort</Button>}
          </div>)}</div>
          {editable && <Button type="button" variant="secondary" className="mt-4" onClick={() => update('allocations', [...form.allocations, { projectId: projectId && projects.data?.some((project) => project.id === projectId) && !form.allocations.some((row) => row.projectId === projectId) ? projectId : '', amount: remainder ? moneyInput(remainder) : '', note: '' }])}><Plus size={17} aria-hidden="true" />Lägg till projekt</Button>}
          {!form.allocations.length && <p className="mt-3 text-sm">Inget projekt valt.</p>}
          <p className="mt-4 font-semibold tabular-nums">{remainder == null ? 'Ange nettobelopp för att se vad som återstår.' : `${money(remainder)} kvar att fördela`}</p>
        </TaskSection>
        <TaskSection><FormField label="Anteckning" controlId="invoice-note"><textarea id="invoice-note" className="input min-h-24" maxLength={2000} value={form.note || ''} onChange={(event) => update('note', event.target.value || null)} /></FormField></TaskSection>
      </fieldset>
      {editable && <TaskSection><div className="flex flex-wrap items-center gap-3"><Button type="submit" isLoading={mutation.isPending} disabled={!dirty}>Spara utkast</Button>{dirty && <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => setDiscardAction('reset')}>Ångra ändringar</Button>}<span className="text-sm" role="status">{dirty ? 'Osparade ändringar' : 'Alla ändringar är sparade'}</span></div>
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed} disabled={dirty || mutation.isPending} onChange={(event) => setReviewed(event.target.checked)} /><span>Jag har kontrollerat leverantör, fakturanummer, datum, belopp i SEK och projektfördelning mot originalet.</span></label>
        <Button type="button" className="mt-3" disabled={!reviewed || dirty || mutation.isPending} onClick={() => setConfirmOpen(true)}>Bekräfta faktura</Button>
      </TaskSection>}
    </form>
    {invoice.status !== 'VOID' && <div className="flex flex-wrap gap-3">{invoice.status === 'CONFIRMED' && <Button variant="secondary" disabled={mutation.isPending} onClick={() => { setReason(''); setAction('reopen'); }}>Öppna för rättelse</Button>}<Button variant="secondary" disabled={mutation.isPending} disabledReason={dirty ? 'Spara eller ångra ändringarna före makulering.' : null} onClick={() => { setReason(''); setAction('void'); }}>Makulera</Button></div>}
    </div></div>
    <ConfirmDialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} title="Lämna osparade ändringar?" confirmLabel="Lämna utan att spara" consequence="Dina osparade fakturauppgifter och projektfördelningar försvinner. Det sparade originalet och utkastet finns kvar." />
    <ConfirmDialog open={!!discardAction} onClose={() => setDiscardAction(null)} onConfirm={() => {
      setForm(invoiceToForm(invoice)); setReviewed(false); setError('');
      if (discardAction === 'refresh') void client.invalidateQueries({ queryKey: ['supplier-invoice', invoice.id] });
      setDiscardAction(null);
    }} title="Kasta osparade ändringar?" confirmLabel={discardAction === 'refresh' ? 'Hämta sparad version' : 'Ångra ändringar'} consequence="Formuläret ersätts med de sparade uppgifterna. Dina osparade belopp och projektfördelningar försvinner." />
    <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => mutation.mutate('confirm')} title="Bekräfta fakturan?" confirmLabel="Bekräfta faktura" confirmVariant="primary" isLoading={mutation.isPending} consequence={`Projektfördelningen räknas nu som inköp. ${remainder ? `${money(remainder)} är fortfarande ofördelat. ` : ''}Originalet sparas. Ingen bokföring eller betalning görs.`} />
    <Dialog open={!!action} onClose={() => setAction(null)} title={action === 'reopen' ? 'Öppna för rättelse' : 'Makulera fakturan'} description={action === 'reopen' ? 'Inköpet räknas inte i projekten förrän du bekräftar fakturan igen.' : 'Inköpet tas bort från projektsummorna. Original och historik finns kvar. Makuleringen kan inte ångras.'} footer={<Button disabled={reason.trim().length < 3} isLoading={mutation.isPending} onClick={() => action && mutation.mutate(action)}>{action === 'reopen' ? 'Öppna för rättelse' : 'Makulera faktura'}</Button>}>
      <FormField label="Orsak" controlId="invoice-reason"><textarea id="invoice-reason" className="input min-h-24" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
    </Dialog>
  </>;
}
