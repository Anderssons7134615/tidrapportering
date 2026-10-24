import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, CheckSquare, ChevronRight, Edit2, FolderKanban, MessageSquareText, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectTasksApi, projectsApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { ProjectTask, ProjectTaskStatus, ProjectUpdate, ProjectUpdateType } from '../types';
import type { WorkspaceProject } from '../types/projectWorkspace';
import { AppShell, DataTable, Dialog, EmptyState, PageHeader, StatusBadge, Tabs } from '../components/ui/design';
import { IdentityMark } from '../components/ui/IdentityMark';
import { ProjectDialog } from '../components/ProjectDialog';
import { QueryError } from '../components/ui/QueryError';
import { ListSkeleton } from '../components/ui/Skeleton';
import { formatDate, formatHours } from '../utils/format';
import { refreshProjectQueries } from '../utils/projectQueries';
import './ProjectWorkspace.css';
import { TaskDialog } from './Projects';

const statusLabel = { PLANNED: 'Planerad', ONGOING: 'Pågående', COMPLETED: 'Avslutad' };
const updateLabel: Record<ProjectUpdateType, string> = { NOTE: 'Anteckning', STATUS: 'Lägesuppdatering', NEXT_STEP: 'Nästa steg', RISK: 'Risk', DECISION: 'Beslut' };
const taskLabel: Record<ProjectTaskStatus, string> = { TODO: 'Att göra', IN_PROGRESS: 'Pågår', WAITING: 'Väntar', DONE: 'Klar' };
const panelTabs = [{ id: 'overview', label: 'Översikt' }, { id: 'tasks', label: 'Att göra' }, { id: 'notes', label: 'Anteckningar' }, { id: 'hours', label: 'Tid' }];
type NoteRow = { project: WorkspaceProject; update: ProjectUpdate | null };

export default function ProjectWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuthStore();
  const manager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const client = useQueryClient();
  const [projectEditor, setProjectEditor] = useState<WorkspaceProject | 'new' | null>(null);
  const [addition, setAddition] = useState<{ projectId?: string; kind: 'note' | 'task' } | null>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const workspace = useQuery({ queryKey: ['project-workspace', user?.companyId, user?.id, user?.role], queryFn: projectTasksApi.workspace, refetchOnMount: 'always', refetchInterval: 60_000 });
  const projects = workspace.data?.items || [];
  const selected = projects.find(project => project.id === id);
  const q = params.get('q') || '';
  const scope = manager ? params.get('scope') || (params.get('archived') === '1' ? 'archived' : 'all') : 'active';
  const view = params.get('view') || 'projects';
  const tab = panelTabs.some(item => item.id === params.get('tab')) ? params.get('tab')! : 'overview';
  const status = params.get('status') || '';
  const setParam = (key: string, value: string) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'scope') next.delete('archived');
    return next;
  }, { replace: true });
  const path = (projectId?: string, panelTab?: string) => {
    const next = new URLSearchParams(params);
    if (panelTab) next.set('tab', panelTab);
    return `/projects${projectId ? `/${encodeURIComponent(projectId)}` : ''}${next.size ? `?${next}` : ''}`;
  };
  const shown = projects.filter(project => {
    if (scope === 'active' && !project.active || scope === 'archived' && project.active) return false;
    if (params.has('customerId') && project.customer?.id !== params.get('customerId')) return false;
    if (params.has('internal') && (params.get('internal') !== '1' || params.has('customerId') || project.customer)) return false;
    if (status && project.status !== status) return false;
    const text = [project.name, project.code, project.site, project.customer?.name, project.notes, ...project.tasks.flatMap(task => [task.title, task.note]), ...project.updates.map(update => update.content)].join(' ').toLocaleLowerCase('sv');
    return text.includes(q.toLocaleLowerCase('sv'));
  });
  const matches = (text?: string | null) => (text || '').toLocaleLowerCase('sv').includes(q.toLocaleLowerCase('sv'));
  const matchesIdentity = (project: WorkspaceProject) => matches([project.name, project.code, project.site, project.customer?.name].join(' '));
  const tasks = shown.flatMap(project => project.tasks.filter(task => matchesIdentity(project) || matches(task.title) || matches(task.note)).map(task => ({ project, task })));
  const updates = shown.flatMap<NoteRow>(project => [...project.updates.map(update => ({ project, update })), ...(project.notes ? [{ project, update: null }] : [])])
    .filter(({ project, update }) => matchesIdentity(project) || matches(update ? update.content : project.notes))
    .sort((a, b) => (b.update?.occurredAt || '').localeCompare(a.update?.occurredAt || ''));
  const clear = () => setParams(new URLSearchParams());
  useEffect(() => { setAddition(null); setProjectEditor(null); }, [id]);
  useEffect(() => { if (id && selected) panelTitle.current?.focus({ preventScroll: true }); }, [id, Boolean(selected)]);
  const refresh = () => { void refreshProjectQueries(client); };
  const revealNotes = () => {
    setParam('tab', 'notes');
    window.requestAnimationFrame(() => panelTitle.current?.closest('.workspace-inspector')?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus());
  };

  if (workspace.isLoading) return <ListSkeleton />;
  return <AppShell><div className={`space-y-5 sm:space-y-6 ${id ? 'workspace-context-open' : ''}`}>
    <PageHeader title="Projektarbetsyta" description="Samma projekt. Anteckningar, nästa steg och timmar samlade på ett ställe." action={<div className="flex flex-wrap gap-2">
      {manager && <button className="btn-secondary" onClick={() => setAddition({ projectId: selected?.active ? selected.id : undefined, kind: 'note' })} disabled={workspace.isError || !projects.some(project => project.active)}><Plus size={16} aria-hidden="true" />Lägg till</button>}
      <button className="btn-primary" onClick={() => setProjectEditor('new')} disabled={workspace.isError}><Plus size={16} aria-hidden="true" />Nytt projekt</button>
    </div>} />
    {workspace.isError && <QueryError title="Arbetsytan kunde inte hämtas" description="Senast hämtade uppgifter kan vara inaktuella. Försök igen innan du använder dem som underlag." onRetry={() => void workspace.refetch()} />}
    {!workspace.isError && <>
      <div className="workspace-directory-tools flex flex-wrap items-center justify-between gap-2 border-b border-graphite-200">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Arbetsytans vy">
          {([['projects', 'Projekt', FolderKanban], ['tasks', 'Att göra', CheckSquare], ['notes', 'Anteckningar', MessageSquareText]] as const).map(([key, label, Icon]) => <button key={key} type="button" className={`workspace-view ${view === key ? 'workspace-view-active' : ''}`} aria-pressed={view === key} onClick={() => setParam('view', key === 'projects' ? '' : key)}><Icon size={15} aria-hidden="true" />{label}</button>)}
        </div>
        {manager && <Link className="workspace-register-link" to="/project-register">Hantera och arkivera<ArrowUpRight size={14} aria-hidden="true" /></Link>}
      </div>
      <div className="workspace-directory-tools flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 basis-56"><span className="sr-only">Sök i arbetsytan</span><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-graphite-400" /><input type="search" className="input pl-9" value={q} onChange={event => setParam('q', event.target.value)} placeholder="Sök projekt, kund, anteckning eller uppgift" /></label>
        {manager && <label><span className="sr-only">Projekturval</span><select className="input" value={scope} onChange={event => setParam('scope', event.target.value)}><option value="all">Alla projekt</option><option value="active">Aktiva projekt</option><option value="archived">Arkiverade projekt</option></select></label>}
        <label><span className="sr-only">Projektstatus</span><select className="input" value={status} onChange={event => setParam('status', event.target.value)}><option value="">Alla statusar</option><option value="PLANNED">Planerade</option><option value="ONGOING">Pågående</option><option value="COMPLETED">Avslutade</option></select></label>
        {(q || status || scope !== (manager ? 'all' : 'active') || params.has('customerId') || params.has('internal')) && <button className="btn-secondary" onClick={clear}>Rensa urval</button>}
      </div>
      <p className="workspace-directory-tools text-xs text-graphite-600" role="status">{shown.length} av {projects.length} projekt{scope === 'all' && manager ? ' · inklusive arkiverade' : ''}{workspace.isFetching ? ' · Uppdaterar…' : ''}</p>
      <div className={`workspace-split ${id ? 'workspace-has-selection' : ''}`}>
        <section className="workspace-master" aria-label="Projektlista">
          {view === 'projects' ? shown.length ? <div className="workspace-directory">{shown.map(project => <Link key={project.id} to={path(project.id)} className={`workspace-project-row ${id === project.id ? 'workspace-project-selected' : ''}`} aria-current={id === project.id ? 'true' : undefined}>
            <IdentityMark name={project.customer?.name || 'Intern'} />
            <div className="min-w-0 flex-1"><span className="block font-semibold text-graphite-950 [overflow-wrap:anywhere]">{project.name}</span><span className="mt-1 block text-xs text-graphite-500 [overflow-wrap:anywhere]">{project.code} · {project.customer?.name || 'Intern'}{!project.active ? ' · Arkiverad' : ''}</span></div>
            <div className="workspace-row-meta"><span className="text-xs text-graphite-600">{statusLabel[project.status]}</span><span className="text-xs tabular-nums text-graphite-600">{project.hours.reported !== null ? `${formatHours(project.hours.reported)} rapporterat` : project.hours.approved !== null ? `${formatHours(project.hours.approved)} attesterat` : 'Timmar dolda'}</span></div><ChevronRight size={16} aria-hidden="true" className="shrink-0 text-graphite-400" />
          </Link>)}</div> : <EmptyState title="Inga projekt i urvalet" description="Ändra sökning eller filter. Projekten har inte ändrats." /> : view === 'tasks' ? <TaskRows rows={tasks} manager={manager} path={project => path(project.id, 'tasks')} /> : <NoteRows rows={updates} path={project => path(project.id, 'notes')} />}
        </section>
        <section className="workspace-inspector" aria-label="Projektpanel">
          {id && !selected ? <><Link to={path()} className="btn-secondary"><ArrowLeft size={16} />Till projektlistan</Link><EmptyState title="Projektet kunde inte hittas" description="Projektet kan vara arkiverat eller inte tillgängligt för ditt konto." /></> : selected ? <>
            <Link to={path()} className="workspace-back"><ArrowLeft size={16} aria-hidden="true" />Till projektlistan</Link>
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs text-graphite-500">{selected.code} · {selected.customer?.name || 'Intern'}</p><h2 ref={panelTitle} tabIndex={-1} className="mt-2 text-xl font-semibold tracking-tight text-graphite-950 outline-none [overflow-wrap:anywhere]">{selected.name}</h2></div>{manager && <button className="icon-button shrink-0" aria-label={`Redigera ${selected.name}`} onClick={() => setProjectEditor(selected)}><Edit2 size={16} /></button>}</div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge label={selected.active ? statusLabel[selected.status] : 'Arkiverad'} tone={!selected.active || selected.status === 'COMPLETED' ? 'gray' : 'blue'} />{selected.site && <span className="text-xs text-graphite-600 [overflow-wrap:anywhere]">{selected.site}</span>}</div>
            {!selected.active && <p className="text-sm text-graphite-600">Arkiverat projekt. Historiken är bevarad. Återställ via Hantera och arkivera om arbetet ska fortsätta.</p>}
            <section className="workspace-hours" aria-label="Projektets timmar">
              {selected.hours.reported !== null && <div><strong>{formatHours(selected.hours.reported)}</strong><span>rapporterat</span></div>}
              <div><strong>{selected.hours.approved !== null ? formatHours(selected.hours.approved) : '—'}</strong><span>{selected.hours.approved !== null ? 'attesterat' : 'projekttimmar dolda'}</span></div>
            </section>
            <Tabs tabs={panelTabs} active={tab} onChange={value => setParam('tab', value)} label="Projektinnehåll">
              {tab === 'overview' && <div className="space-y-6 pt-4">
                {selected.notes && <div><h3 className="section-title">Projektbeskrivning</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{selected.notes}</p></div>}
                <div><div className="workspace-section-heading"><h3 className="section-title">Nästa steg</h3>{manager && selected.active && <button className="workspace-text-button" onClick={() => setAddition({ projectId: selected.id, kind: 'task' })}><Plus size={14} />Ny uppgift</button>}</div><TaskRows rows={selected.tasks.filter(task => task.status !== 'DONE').map(task => ({ project: selected, task }))} manager={manager} /></div>
                <div><div className="workspace-section-heading"><h3 className="section-title">Senaste anteckningar</h3>{manager && selected.active && <button className="workspace-text-button" onClick={() => setAddition({ projectId: selected.id, kind: 'note' })}>Lägg till anteckning</button>}</div><NoteRows rows={selected.updates.slice(0, 3).map(update => ({ project: selected, update }))} />{selected.updates.length > 3 && <button className="workspace-text-button" onClick={revealNotes}>Visa alla {selected.updates.length} händelser</button>}</div>
              </div>}
              {tab === 'tasks' && <div className="pt-4">{manager && selected.active && <button className="workspace-text-button" onClick={() => setAddition({ projectId: selected.id, kind: 'task' })}><Plus size={14} />Lägg till uppgift</button>}<TaskRows rows={selected.tasks.map(task => ({ project: selected, task }))} manager={manager} /></div>}
              {tab === 'notes' && <div className="pt-4">{manager && selected.active && <button className="workspace-text-button" onClick={() => setAddition({ projectId: selected.id, kind: 'note' })}><Plus size={14} />Lägg till anteckning</button>}<NoteRows rows={selected.updates.map(update => ({ project: selected, update }))} />{selected.notes && <div className="border-t border-graphite-200 py-4"><h3 className="text-xs font-semibold text-graphite-600">Äldre projektanteckning</h3><p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{selected.notes}</p></div>}</div>}
              {tab === 'hours' && <WorkspaceHours key={selected.id} project={selected} />}
            </Tabs>
          </> : <div className="workspace-placeholder"><FolderKanban size={28} aria-hidden="true" /><h2 className="section-title">Välj ett projekt</h2><p>Öppna ett projekt för anteckningar, uppgifter och timmar.</p></div>}
        </section>
      </div>
    </>}
    {projectEditor && <ProjectDialog project={projectEditor === 'new' ? undefined : { ...projectEditor, customerId: projectEditor.customer?.id || null, customer: projectEditor.customer || undefined }} onClose={() => setProjectEditor(null)} onSaved={() => { setProjectEditor(null); refresh(); }} />}
    {addition && <WorkspaceAddition key={`${addition.projectId}-${addition.kind}`} projects={projects.filter(project => project.active)} initial={addition} onClose={() => setAddition(null)} onSaved={() => { setAddition(null); refresh(); }} />}
  </div></AppShell>;
}

function TaskRows({ rows, manager, path }: { rows: { project: WorkspaceProject; task: ProjectTask }[]; manager: boolean; path?: (project: WorkspaceProject) => string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<{ project: WorkspaceProject; task: ProjectTask } | null>(null);
  const { data: users } = useQuery({ queryKey: ['users', 'workspace-task-editor'], queryFn: usersApi.list, enabled: manager && Boolean(editing) });
  const listRef = useRef<HTMLDivElement>(null);
  const focusedTask = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (focusedTask.current && !focusedTask.current.isConnected) {
      if (document.activeElement === document.body) listRef.current?.focus({ preventScroll: true });
      focusedTask.current = null;
    }
  }, [rows]);
  const save = useMutation({ mutationFn: ({ task, checked }: { task: ProjectTask; checked: boolean }) => projectTasksApi.updateStatus(task.id, { status: checked ? 'DONE' : 'TODO' }), onSuccess: () => { void refreshProjectQueries(client); }, onError: (error: Error) => toast.error(error.message) });
  const userId = useAuthStore(state => state.user?.id);
  return <div ref={listRef} role="group" aria-label="Uppgiftslista" tabIndex={-1} className="divide-y divide-graphite-200">{!rows.length && <p className="py-5 text-sm text-graphite-500">Inga uppgifter i urvalet.</p>}{rows.map(({ project, task }) => <div key={task.id} className="flex items-start gap-2 py-3">
    <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input type="checkbox" aria-label={`Avklarad: ${task.title} (${project.code})`} checked={task.status === 'DONE'} disabled={!project.active || save.isPending || (!manager && task.assigneeId !== userId)} onBlur={event => { if (event.relatedTarget) focusedTask.current = null; }} onChange={event => { focusedTask.current = event.currentTarget; save.mutate({ task, checked: event.target.checked }); }} /></label>
    <div className="min-w-0 flex-1"><button type="button" className={`min-h-11 text-left text-sm [overflow-wrap:anywhere] ${task.status === 'DONE' ? 'text-graphite-500 line-through' : 'font-medium text-graphite-900'}`} disabled={!project.active || (!manager && task.assigneeId !== userId)} onClick={() => setEditing({ project, task })}>{task.title}</button><p className="mt-1 text-xs leading-5 text-graphite-500">{task.assignee?.name || 'Ansvarig saknas'} · {formatDate(task.dueDate)} · {taskLabel[task.status]}</p>{task.note && <p className="mt-2 whitespace-pre-wrap text-sm text-graphite-600 [overflow-wrap:anywhere]">{task.note}</p>}{path && <Link to={path(project)} className="workspace-text-button">{project.code} · {project.name}<ArrowUpRight size={13} aria-hidden="true" /></Link>}</div>
  </div>)}{save.isError && <p role="alert" className="py-2 text-sm text-rose-700">{save.error.message} Uppgiften visas med senast hämtade status.</p>}{editing && <TaskDialog context={editing} projects={[editing.project]} users={users || []} isManager={manager} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}</div>;
}

function NoteRows({ rows, path }: { rows: NoteRow[]; path?: (project: WorkspaceProject) => string }) {
  if (!rows.length) return <p className="py-5 text-sm text-graphite-500">Inga anteckningar i urvalet.</p>;
  return <div className="divide-y divide-graphite-200">{rows.map(({ project, update }) => <article key={update?.id || `legacy-${project.id}`} className="py-4"><p className="text-xs text-graphite-500">{update ? <>{updateLabel[update.type] || 'Projekthändelse'} · {formatDate(update.occurredAt)}{update.createdByUser?.name ? ` · ${update.createdByUser.name}` : ''}</> : 'Äldre projektanteckning'}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graphite-800 [overflow-wrap:anywhere]">{update ? update.content : project.notes}</p>{path && <Link to={path(project)} className="workspace-text-button">{project.code} · {project.name}<ArrowUpRight size={13} aria-hidden="true" /></Link>}</article>)}</div>;
}

function WorkspaceHours({ project }: { project: WorkspaceProject }) {
  const user = useAuthStore(state => state.user);
  const allowed = project.hours.approved !== null;
  const query = useQuery({ queryKey: ['project', project.id, 'time-entries'], queryFn: () => projectsApi.listTimeEntries(project.id), enabled: allowed });
  if (!allowed) return <EmptyState title="Projekttimmar är dolda" description="Ditt konto har inte åtkomst till projektets tidrader." />;
  if (query.isLoading) return <p role="status" className="py-4">Laddar tidrader…</p>;
  if (query.isError) return <QueryError title="Tidraderna kunde inte hämtas" onRetry={() => void query.refetch()} />;
  return <div className="pt-4"><p className="mb-3 text-xs text-graphite-600">{user?.role === 'EMPLOYEE' ? 'Endast attesterad tid.' : 'Alla rapporterade tidrader. Status visar vad som är attesterat.'} Tidraderna ändras inte här.</p>{query.data?.length ? <DataTable label="Projektets tidrader"><table className="min-w-full text-sm"><thead className="table-head"><tr><th className="px-3 py-3">Datum</th><th className="px-3 py-3">Person / aktivitet</th><th className="px-3 py-3 text-right">Timmar</th>{user?.role !== 'EMPLOYEE' && <th className="px-3 py-3">Status</th>}</tr></thead><tbody>{query.data.map(entry => <tr key={entry.id} className="border-b border-graphite-200"><td className="whitespace-nowrap px-3 py-3">{formatDate(entry.date)}</td><td className="px-3 py-3"><span className="block">{entry.user?.name}</span><span className="text-xs text-graphite-500">{entry.activity?.name || 'Saknar aktivitet'}</span></td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatHours(entry.hours)}</td>{user?.role !== 'EMPLOYEE' && <td className="px-3 py-3">{{ DRAFT: 'Utkast', SUBMITTED: 'Inskickad', APPROVED: 'Attesterad', REJECTED: 'Behöver rättas' }[entry.status]}</td>}</tr>)}</tbody></table></DataTable> : <EmptyState title="Inga tidrader att visa" />}</div>;
}

function WorkspaceAddition({ projects, initial, onClose, onSaved }: { projects: WorkspaceProject[]; initial: { projectId?: string; kind: 'note' | 'task' }; onClose: () => void; onSaved: () => void }) {
  const [projectId, setProjectId] = useState(initial.projectId || '');
  const [kind, setKind] = useState(initial.kind);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const { data: users, isError: usersFailed, refetch } = useQuery({ queryKey: ['users', 'workspace-tasks'], queryFn: usersApi.list, enabled: kind === 'task' });
  const save = useMutation<ProjectUpdate | ProjectTask, Error, FormData>({ mutationFn: (form: FormData) => kind === 'note'
    ? projectsApi.createUpdate(projectId, { type: 'NOTE', content: text.trim() })
    : projectTasksApi.create(projectId, { title: text.trim(), assigneeId: String(form.get('assigneeId') || ''), dueDate: String(form.get('dueDate') || ''), priority: 'NORMAL', status: 'TODO' }),
    onSuccess: () => { toast.success(kind === 'note' ? 'Anteckningen sparades' : 'Uppgiften sparades'); onSaved(); }, onError: (cause: Error) => setError(cause.message), onSettled: () => { submitting.current = false; } });
  const close = () => { if (!submitting.current) onClose(); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (submitting.current) return; setError(''); if (!projectId || text.trim().length < (kind === 'task' ? 2 : 1)) { setError('Välj ett projekt och skriv en text. Uppgifter behöver minst två tecken.'); return; } submitting.current = true; save.mutate(new FormData(event.currentTarget)); };
  return <Dialog open onClose={close} title={kind === 'note' ? 'Lägg till anteckning' : 'Ny uppgift'} description="Sparas i tidsappen på det valda projektet." footer={<div className="flex flex-wrap justify-end gap-2"><button className="btn-secondary" onClick={close} disabled={save.isPending}>Avbryt</button><button type="submit" form="workspace-addition" className="btn-primary" disabled={save.isPending || kind === 'task' && (!users || usersFailed)}>{save.isPending ? 'Sparar…' : kind === 'note' ? 'Spara anteckning' : 'Spara uppgift'}</button></div>}>
    <form id="workspace-addition" onSubmit={submit}><fieldset disabled={save.isPending} className="space-y-4">
      <label className="block"><span className="label">Projekt</span><select className="input" required value={projectId} onChange={event => setProjectId(event.target.value)}><option value="" disabled>Välj projekt</option>{projects.map(project => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
      <label className="block"><span className="label">Typ av tillägg</span><select className="input" value={kind} onChange={event => { setKind(event.target.value as 'note' | 'task'); setError(''); }}><option value="note">Anteckning</option><option value="task">Uppgift</option></select></label>
      <label className="block"><span className="label">{kind === 'note' ? 'Anteckning' : 'Vad ska göras?'}</span><textarea autoFocus className="input min-h-28" required minLength={kind === 'task' ? 2 : 1} maxLength={kind === 'task' ? 160 : 5000} value={text} onChange={event => setText(event.target.value)} /></label>
      {kind === 'task' && <><p className="text-sm text-graphite-600">Tidsappens uppgifter behöver ansvarig och deadline. Välj dem uttryckligen; inget fylls i automatiskt.</p>{usersFailed && <p role="alert" className="text-sm text-rose-700">Ansvariga kunde inte hämtas. <button type="button" className="workspace-text-button" onClick={() => void refetch()}>Försök igen</button></p>}<label className="block"><span className="label">Ansvarig</span><select name="assigneeId" className="input" required defaultValue=""><option value="" disabled>Välj ansvarig</option>{users?.filter(user => user.active && user.role !== 'ACCOUNTANT').map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="block"><span className="label">Deadline / uppföljning</span><input name="dueDate" type="date" className="input" required /></label></>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </fieldset></form>
  </Dialog>;
}
