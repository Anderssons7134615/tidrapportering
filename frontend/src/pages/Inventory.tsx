import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { inventoryApi, projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { AppShell, Button, Dialog, EmptyState, FormField, PageHeader, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { ProjectPicker } from '../components/ProjectPicker';
import { refreshProjectQueries } from '../utils/projectQueries';
import { parseSwedishNumber } from '../utils/format';
import type { InventoryItem, InventoryKind, InventoryMovement, PendingInventoryMovement } from '../types/inventory';

const labels: Record<InventoryKind, string> = { RECEIPT: 'Inleverans', ISSUE: 'Uttag', RETURN: 'Retur', COUNT: 'Inventering' };
const quantityText = (quantity: number) => quantity.toLocaleString('sv-SE', { maximumFractionDigits: 3 });
const movementTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' });

export default function Inventory() {
  const user = useAuthStore((state) => state.user);
  const online = useOfflineStore((state) => state.isOnline);
  const canManageInventory = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'].includes(user?.role || '');
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [add, setAdd] = useState(false);
  const [shelf, setShelf] = useState<InventoryItem | null>(null);
  const [movement, setMovement] = useState<{ item: InventoryItem; kind: InventoryKind; source?: InventoryMovement; resume?: PendingInventoryMovement } | null>(null);
  const pendingKey = `tidapp-inventory-pending:${user?.id}`;
  const [pending, setPending] = useState<PendingInventoryMovement | null>(() => {
    try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; }
  });
  const persist = (value: PendingInventoryMovement | null) => {
    // Do not submit if the retry key cannot be kept across a reload.
    if (value) localStorage.setItem(pendingKey, JSON.stringify(value)); else localStorage.removeItem(pendingKey);
    setPending(value);
  };
  const items = useQuery({ queryKey: ['inventory', user?.id], queryFn: inventoryApi.list });
  const selected = items.data?.find((item) => item.id === params.get('item'));
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['inventory'] }), client.invalidateQueries({ queryKey: ['inventory-history'] }), refreshProjectQueries(client)]);
  };
  const terms = search.toLocaleLowerCase('sv').trim().split(/\s+/).filter(Boolean);
  const filtered = (items.data || []).filter((item) => terms.every((term) => [item.article.name, item.article.articleNumber, item.shelf, item.article.pipeDimensionMm, item.article.insulationThicknessMm].join(' ').toLocaleLowerCase('sv').includes(term)));
  const blocked = !online || Boolean(pending);
  return <AppShell>
    <PageHeader title="Lager" description="Material i lokalen. Registrera uttag när material lämnar lagret." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!online || items.isFetching} onClick={() => void refresh()}>Uppdatera lager</Button>{canManageInventory && <Button onClick={() => setAdd(true)} disabled={blocked}>Lägg till lagerartikel</Button>}</div>} />
    {!online && <p role="status" className="text-amber-800">Du är offline. Visat saldo kan vara gammalt. Anslut för att registrera lagerrörelser.</p>}
    {pending && <TaskSection><p role="status">En registrering väntar på bekräftelse. Återuppta den innan du registrerar något mer.</p><Button variant="secondary" disabled={!online} onClick={() => {
      const item = items.data?.find((row) => row.id === pending.itemId) || pending.item;
      if (item) setMovement({ item, kind: pending.input.kind, resume: pending });
    }}>Återuppta registrering</Button></TaskSection>}
    {items.isLoading ? <p role="status">Hämtar lagret…</p> : items.isError ? <QueryError title="Lagret kunde inte hämtas" onRetry={() => void items.refetch()} /> : selected ? <>
      <button type="button" className="btn-secondary w-fit" onClick={() => setParams({})}>Till lagerlistan</button>
      <TaskSection>
        <h2 className="text-lg font-semibold break-words">{selected.article.name}</h2>
        <p className="mt-1 text-sm text-graphite-600">{selected.article.articleNumber || 'Utan artikelnummer'} · Hyllplats: {selected.shelf || 'Ej angiven'}</p>
        <p className="mt-4 text-lg font-semibold">Saldo: {quantityText(selected.balance)} {selected.unit}</p>
        {!selected.article.active && <p className="mt-2 text-amber-800">Artikeln är inaktiv. Inleveranser och nya uttag är spärrade.</p>}
        {selected.unit !== selected.article.unit && <p className="mt-2 text-amber-800">Enheten i materialregistret har ändrats. Lagret använder {selected.unit}. Kontakta arbetsledaren.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={blocked || selected.balance <= 0 || !selected.article.active || selected.unit !== selected.article.unit} onClick={() => setMovement({ item: selected, kind: 'ISSUE' })}>Ta ut till projekt</Button>
          {canManageInventory && <>
            <Button variant="secondary" disabled={blocked || !selected.article.active || selected.unit !== selected.article.unit} onClick={() => setMovement({ item: selected, kind: 'RECEIPT' })}>Inleverans</Button>
            <Button variant="secondary" disabled={blocked} onClick={() => setMovement({ item: selected, kind: 'COUNT' })}>Inventera</Button>
            <Button variant="secondary" disabled={blocked} onClick={() => setShelf(selected)}>Ändra hyllplats</Button>
          </>}
        </div>
      </TaskSection>
      <History key={selected.id} item={selected} blocked={blocked} onReturn={(source) => setMovement({ item: selected, kind: 'RETURN', source })} />
    </> : items.data?.length === 0 ? <EmptyState title="Lagret är tomt" description="Lägg till en lagerartikel från materialregistret. Registrera sedan en inleverans eller inventering för att ange saldot." /> : <>
      {params.get('item') && <p role="status">Lagerartikeln finns inte i ditt urval. Välj en artikel i listan.</p>}
      <FormField label="Sök i lagret" controlId="inventory-search"><input id="inventory-search" type="search" className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Material, dimension, artikelnummer eller hyllplats" /></FormField>
      <p className="text-sm text-graphite-600" role="status">{filtered.length} lagerartiklar</p>
      {!filtered.length ? <EmptyState title="Inga träffar" description="Prova ett annat namn, artikelnummer eller en annan dimension." /> : <div className="divide-y divide-graphite-200 rounded-xl border border-graphite-200 bg-white">
        {filtered.map((item) => <button key={item.id} type="button" onClick={() => setParams({ item: item.id })} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-graphite-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600">
          <span className="min-w-0 flex-1"><span className="block break-words font-semibold">{item.article.name}</span><span className="mt-1 block text-sm text-graphite-600">{item.article.articleNumber || 'Utan artikelnummer'} · {item.shelf || 'Hyllplats ej angiven'}{!item.article.active ? ' · Inaktiv' : ''}</span></span>
          <span className="font-semibold tabular-nums">{quantityText(item.balance)} {item.unit}</span>
        </button>)}
      </div>}
    </>}
    {add && <AddItem onClose={() => setAdd(false)} onSaved={async (id) => { await refresh(); setAdd(false); setParams({ item: id }); }} />}
    {shelf && <ShelfDialog item={shelf} onClose={() => setShelf(null)} onSaved={async () => { await refresh(); setShelf(null); }} />}
    {movement && <MovementDialog {...movement} online={online} persist={persist} onRejected={refresh} onClose={() => setMovement(null)} onSaved={async () => { await refresh(); setMovement(null); }} />}
  </AppShell>;
}

function History({ item, blocked, onReturn }: { item: InventoryItem; blocked: boolean; onReturn: (source: InventoryMovement) => void }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['inventory-history', item.id, page], queryFn: () => inventoryApi.history(item.id, page) });
  return <TaskSection><h2 className="text-lg font-semibold">Historik och returer</h2><p className="mt-1 text-sm text-graphite-600">Välj ett tidigare uttag för att lämna tillbaka material. Montörer kan returnera sina egna uttag.</p>
    {query.isLoading ? <p role="status">Hämtar historik…</p> : query.isError ? <QueryError title="Historiken kunde inte hämtas" onRetry={() => void query.refetch()} /> : <>
      {!query.data?.items.length && <p className="py-4">Inga lagerrörelser ännu.</p>}
      <ol className="mt-4 divide-y divide-graphite-200">{query.data?.items.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-3 py-4">
        <div className="min-w-0 flex-1"><p className="font-semibold">{labels[row.kind]} · {row.quantityDelta > 0 ? '+' : ''}{quantityText(row.quantityDelta)} {row.unit}</p>
          <p className="mt-1 text-sm text-graphite-600">{movementTime.format(new Date(row.createdAt))} · {row.createdByUser.name} · Saldo efter: {quantityText(row.balanceAfter)} {row.unit}</p>
          {row.project && <Link className="text-link inline-flex min-h-11 items-center break-words" to={`/projects/${row.project.id}`}>{row.project.code} · {row.project.name}</Link>}
          {row.note && <p className="break-words text-sm">{row.note}</p>}
        </div>
        {row.returnableQuantity > 0 && <Button variant="secondary" disabled={blocked} onClick={() => onReturn(row)}>Returnera · högst {quantityText(row.returnableQuantity)} {row.unit}</Button>}
      </li>)}</ol>
      {query.data && query.data.total > 30 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Föregående</Button><span>Sida {page} av {Math.ceil(query.data.total / 30)}</span><Button variant="secondary" disabled={page * 30 >= query.data.total} onClick={() => setPage(page + 1)}>Nästa</Button></div>}
    </>}
  </TaskSection>;
}

function MovementDialog({ item, kind, source, resume, online, persist, onClose, onSaved, onRejected }: {
  item: InventoryItem; kind: InventoryKind; source?: InventoryMovement; resume?: PendingInventoryMovement; online: boolean;
  persist: (value: PendingInventoryMovement | null) => void; onClose: () => void; onSaved: () => Promise<void>; onRejected: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(resume ? String(resume.input.quantity).replace('.', ',') : '');
  const [note, setNote] = useState(resume?.input.note || '');
  const [projectId, setProjectId] = useState(resume?.input.projectId || '');
  const [frozen, setFrozen] = useState(resume || null);
  const [error, setError] = useState('');
  const [conflicted, setConflicted] = useState(false);
  const projects = useQuery({ queryKey: ['projects', 'options', 'inventory'], queryFn: projectsApi.options, enabled: kind === 'ISSUE' && !resume });
  const amount = parseSwedishNumber(quantity);
  const validAmount = quantity.trim() !== '' && Number.isFinite(amount) && amount >= (kind === 'COUNT' ? 0 : 0.001) && amount <= 1_000_000 && Math.abs(amount * 1000 - Math.round(amount * 1000)) < 0.000001;
  const next = kind === 'COUNT' ? amount : item.balance + (kind === 'ISSUE' ? -amount : amount);
  const save = useMutation({ mutationFn: async () => {
    const request: PendingInventoryMovement = frozen || { itemId: item.id, item, input: { kind, quantity: amount, revision: item.revision, requestKey: crypto.randomUUID(), note: note.trim(), ...(kind === 'ISSUE' ? { projectId } : {}), ...(kind === 'RETURN' ? { sourceIssueId: source!.id } : {}) } };
    persist(request); setFrozen(request);
    await inventoryApi.move(request.itemId, request.input);
    persist(null);
  }, onSuccess: async () => { toast.success('Lagerrörelsen är registrerad'); await onSaved(); }, onError: (cause: Error & { status?: number }) => {
    setError(cause.message);
    // A definite rejection means nothing was committed. An uncertain response retains the exact key and payload.
    if (cause.status && cause.status >= 400 && cause.status < 500) { persist(null); setFrozen(null); }
    if (cause.status === 409) { setConflicted(true); void onRejected(); }
  } });
  const disabled = conflicted || !online || (!frozen && (!validAmount || next < 0 || (kind === 'ISSUE' && !projectId) || (kind === 'COUNT' && note.trim().length < 2) || (source && amount > source.returnableQuantity)));
  return <Dialog open title={labels[kind]} description={item.article.name} onClose={() => { if (!save.isPending) onClose(); }} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={save.isPending} onClick={onClose}>Stäng</Button><Button type="submit" form="inventory-movement" isLoading={save.isPending} disabled={disabled}>{frozen ? 'Bekräfta registreringen' : 'Registrera'}</Button></div>}>
    <form id="inventory-movement" onSubmit={(event) => { event.preventDefault(); if (!save.isPending && !disabled) { setError(''); save.mutate(); } }} className="space-y-4">
      <p>Visat saldo: <strong>{quantityText(item.balance)} {item.unit}</strong></p>
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      {conflicted && <p>Stäng dialogen och kontrollera det uppdaterade lagret innan du öppnar en ny registrering.</p>}
      {frozen && <p role="status" className="text-amber-800">Registreringen kan redan vara sparad. Bekräfta med samma uppgifter; den registreras bara en gång.</p>}
      <fieldset disabled={save.isPending || Boolean(frozen)} className="space-y-4">
        {kind === 'ISSUE' && !resume && <FormField label="Projekt" controlId="inventory-project"><ProjectPicker id="inventory-project" value={projectId} onChange={setProjectId} projects={projects.data || []} required />{projects.isError && <QueryError title="Projekten kunde inte hämtas" onRetry={() => void projects.refetch()} />}</FormField>}
        {source?.project && <p>Retur från {source.project.code} · {source.project.name}. Högst {quantityText(source.returnableQuantity)} {item.unit}.</p>}
        <FormField label={`${kind === 'COUNT' ? 'Räknad mängd' : 'Mängd'} (${item.unit})`} controlId="inventory-quantity"><input id="inventory-quantity" className="input" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} required autoFocus /></FormField>
        <FormField label={kind === 'COUNT' ? 'Orsak (obligatorisk)' : 'Kommentar (valfri)'} controlId="inventory-note"><textarea id="inventory-note" className="input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} required={kind === 'COUNT'} /></FormField>
      </fieldset>
      {validAmount && !frozen && <p role="status">Saldo efter registrering: <strong>{quantityText(next)} {item.unit}</strong>{next < 0 ? ' – mängden överstiger saldot.' : ''}</p>}
      {kind === 'RETURN' && <p className="text-sm text-graphite-600">Returen minskar projektets materialmängd med samma inköpspris som vid uttaget.</p>}
      {kind === 'COUNT' && <p className="text-sm text-graphite-600">Skillnaden sparas som en inventeringsjustering med din orsak.</p>}
    </form>
  </Dialog>;
}

function AddItem({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [articleId, setArticleId] = useState('');
  const [shelf, setShelf] = useState('');
  const query = useQuery({ queryKey: ['material-articles', 'active'], queryFn: () => projectsApi.listMaterialArticles(true) });
  const filtered = (query.data || []).filter((row) => `${row.name} ${row.articleNumber || ''}`.toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv')));
  const selected = query.data?.find((row) => row.id === articleId);
  const save = useMutation({ mutationFn: () => inventoryApi.addItem(articleId, shelf), onSuccess: async ({ id }) => { await onSaved(id); toast.success('Lagerartikeln är tillagd med saldo 0'); } });
  return <Dialog open title="Lägg till lagerartikel" description="Välj en befintlig artikel. Saldot börjar på 0." onClose={() => { if (!save.isPending) onClose(); }} footer={<Button type="submit" form="inventory-add" disabled={!articleId} isLoading={save.isPending}>Lägg till</Button>}>
    <form id="inventory-add" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (articleId && !save.isPending) save.mutate(); }}>
      {save.isError && <p role="alert" className="text-rose-700">{save.error.message}</p>}
      <fieldset disabled={save.isPending} className="space-y-4">
        <FormField label="Sök materialartikel" controlId="inventory-article-search"><input id="inventory-article-search" className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></FormField>
        {query.isLoading ? <p role="status">Hämtar material…</p> : query.isError ? <QueryError title="Materialregistret kunde inte hämtas" onRetry={() => void query.refetch()} /> : <>
          <div className="max-h-60 overflow-auto divide-y divide-graphite-200">{filtered.slice(0, 30).map((article) => <label key={article.id} className="flex min-h-11 cursor-pointer items-center gap-3 py-3"><input type="radio" name="article" value={article.id} checked={articleId === article.id} onChange={() => setArticleId(article.id)} /><span className="break-words">{article.name} · {article.unit}</span></label>)}</div>
          <p className="text-sm text-graphite-600" role="status">{filtered.length > 30 ? 'Visar de första 30 träffarna. Skriv mer för att begränsa sökningen.' : `${filtered.length} träffar`}</p>
        </>}
        {selected && <p>Vald artikel: {selected.name} · {selected.unit}</p>}
        <FormField label="Hyllplats (valfri)" controlId="inventory-shelf"><input id="inventory-shelf" className="input" maxLength={80} value={shelf} onChange={(event) => setShelf(event.target.value)} /></FormField>
      </fieldset>
    </form>
  </Dialog>;
}

function ShelfDialog({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [shelf, setShelf] = useState(item.shelf);
  const save = useMutation({ mutationFn: () => inventoryApi.setShelf(item.id, item.revision, shelf), onSuccess: onSaved });
  return <Dialog open title="Ändra hyllplats" description={item.article.name} onClose={() => { if (!save.isPending) onClose(); }} footer={<Button type="submit" form="inventory-shelf-form" isLoading={save.isPending}>Spara</Button>}>
    <form id="inventory-shelf-form" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      {save.isError && <p role="alert" className="text-rose-700">{save.error.message}</p>}
      <FormField label="Hyllplats" controlId="inventory-shelf-edit"><input id="inventory-shelf-edit" className="input" value={shelf} maxLength={80} disabled={save.isPending} onChange={(event) => setShelf(event.target.value)} /></FormField>
    </form>
  </Dialog>;
}
