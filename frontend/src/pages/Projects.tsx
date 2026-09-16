import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronDown, ChevronRight, Edit2, Plus, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectTasksApi, projectsApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectControlItem, ProjectTask, ProjectTaskPriority, ProjectTaskStatus, User } from '../types';
import { AppShell, ConfirmDialog, Dialog, EmptyState, PageHeader } from '../components/ui/design';
import { ListSkeleton, Skeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { ProjectDialog } from '../components/ProjectDialog';
import { refreshProjectQueries } from '../utils/projectQueries';
import { toDateInputValue } from '../utils/format';

const taskStatusLabels: Record<ProjectTaskStatus, string> = {
  TODO: 'Att göra',
  IN_PROGRESS: 'Pågår',
  WAITING: 'Väntar',
  DONE: 'Klar',
};

const priorityLabels: Record<ProjectTaskPriority, string> = { LOW: 'Låg', NORMAL: 'Normal', HIGH: 'Hög' };
const projectStatusLabels: Record<string, string> = { PLANNED: 'Planerade', ONGOING: 'Pågående', COMPLETED: 'Avslutade' };
const deadlineLabels: Record<string, string> = { OVERDUE: 'Försenade', TODAY: 'Idag', UPCOMING: 'Kommande sju dagar' };

function formatTaskDate(date: string) {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

export default function Projects() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmProjects, setConfirmProjects] = useState<ProjectControlItem[]>([]);
  const [batchError, setBatchError] = useState('');
  const [search, setSearch] = useState('');
  const [deadline, setDeadline] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [taskDialog, setTaskDialog] = useState<{ project?: ProjectControlItem; task?: ProjectTask } | null>(null);
  const [projectDialog, setProjectDialog] = useState<{ project?: Project } | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['project-control', archived, search, projectStatus, deadline, assigneeId, taskStatus],
    queryFn: () => projectTasksApi.control({ active: archived ? 'false' : 'true', q: search || undefined, projectStatus: projectStatus || undefined, deadline: deadline || undefined, assigneeId: assigneeId || undefined, taskStatus: taskStatus || undefined }),
    placeholderData: keepPreviousData,
  });
  const { data: users } = useQuery({ queryKey: ['users', 'project-tasks'], queryFn: usersApi.list, enabled: isManager });
  const loadProjectMutation = useMutation({ mutationFn: projectsApi.get, onSuccess: (project) => setProjectDialog({ project }), onError: (error: Error) => toast.error(error.message) });
  const changeArchive = useMutation({
    mutationFn: async (items: ProjectControlItem[]) => {
      const failed: Array<{ project: ProjectControlItem; message: string }> = [];
      for (const project of items) {
        try {
          if (project.active) await projectsApi.delete(project.id);
          else await projectsApi.restore(project.id);
        } catch (error) {
          failed.push({ project, message: error instanceof Error ? error.message : 'Kunde inte spara' });
        }
      }
      return { failed, succeeded: items.length - failed.length };
    },
    onSuccess: ({ failed, succeeded }) => {
      setConfirmProjects([]);
      setSelected(new Set(failed.map((item) => item.project.id)));
      setBatchError(failed.map(({ project, message }) => `${project.code} · ${project.name}: ${message}`).join(' · '));
      if (succeeded) toast.success(`${succeeded} projekt ${archived ? 'återställdes' : 'arkiverades'}`);
      void refreshProjectQueries(queryClient);
    },
  });
  useEffect(() => {
    setSelected(new Set());
    setBatchError('');
  }, [archived, search, projectStatus, deadline, assigneeId, taskStatus]);
  const selectedProjects = (data?.items || []).filter((project) => selected.has(project.id));
  const allSelected = Boolean(data?.items.length) && selectedProjects.length === data?.items.length;
  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const activeFilterCount = [projectStatus, deadline, taskStatus, assigneeId].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;
  const activeFilterLabels = [
    projectStatus ? projectStatusLabels[projectStatus] : null,
    deadline ? deadlineLabels[deadline] : null,
    taskStatus ? taskStatusLabels[taskStatus as ProjectTaskStatus] : null,
    assigneeId ? users?.find((item) => item.id === assigneeId)?.name : null,
  ].filter(Boolean);

  const clearFilters = () => {
    setProjectStatus('');
    setDeadline('');
    setTaskStatus('');
    setAssigneeId('');
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading) return <ListSkeleton />;

  return (
    <AppShell>
      <PageHeader
        title="Projekt"
        description={isManager ? 'Öppna och redigera projekt. Kryssa i dem du vill arkivera.' : 'Alla aktiva projekt visas. Dina öppna uppgifter visas först.'}
        action={isManager ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setProjectDialog({})}>Nytt projekt</button>
            <button type="button" className="btn-primary" onClick={() => setTaskDialog({})} disabled={archived || !data?.items.length}>
              <Plus className="h-4 w-4" aria-hidden="true" />Ny uppgift
            </button>
          </div>
        ) : undefined}
      />

      {isManager && <div className="flex gap-2 border-b border-graphite-200" aria-label="Projektvy">
        <button type="button" className={`min-h-11 px-3 text-sm font-semibold border-b-2 ${!archived ? 'border-primary-600 text-primary-700' : 'border-transparent text-graphite-600'}`} aria-pressed={!archived} disabled={changeArchive.isPending} onClick={() => { setArchived(false); clearFilters(); }}>Aktiva</button>
        <button type="button" className={`min-h-11 px-3 text-sm font-semibold border-b-2 ${archived ? 'border-primary-600 text-primary-700' : 'border-transparent text-graphite-600'}`} aria-pressed={archived} disabled={changeArchive.isPending} onClick={() => { setArchived(true); clearFilters(); }}>Arkiverade</button>
      </div>}
      {archived && <p className="text-sm text-graphite-600">Historiken finns kvar. Återställ ett projekt när arbetet ska fortsätta.</p>}
      {batchError && <p role="alert" className="text-sm text-rose-700">Några projekt kunde inte ändras och är fortfarande markerade. {batchError}</p>}
      {loadProjectMutation.isPending && <p role="status" className="text-sm text-graphite-600">Öppnar projekt…</p>}
      {isError ? (
        <QueryError title="Projektkontrollen kunde inte hämtas" description="Kontrollera anslutningen och försök igen." onRetry={() => void refetch()} />
      ) : (
        <>
          {!archived && <div className="mb-3 grid grid-cols-4 items-stretch gap-x-2 border-y border-graphite-200 text-xs text-graphite-600 sm:text-sm" aria-label="Projektstatus">
            <button type="button" className={`min-h-11 min-w-0 border-b-2 px-0.5 font-semibold ${!deadline ? 'border-primary-600 text-graphite-950' : 'border-transparent hover:text-graphite-950'}`} aria-pressed={!deadline} onClick={() => setDeadline('')}>
              {data?.summary.active ?? 0} projekt
            </button>
            <button type="button" className={`min-h-11 min-w-0 border-b-2 px-0.5 font-semibold ${deadline === 'OVERDUE' ? 'border-rose-600 text-rose-700' : 'border-transparent text-rose-700 hover:border-rose-200'}`} aria-pressed={deadline === 'OVERDUE'} onClick={() => setDeadline(deadline === 'OVERDUE' ? '' : 'OVERDUE')}>
              {data?.summary.overdue === 1 ? '1 försenad' : `${data?.summary.overdue ?? 0} försenade`}
            </button>
            <button type="button" className={`min-h-11 min-w-0 border-b-2 px-0.5 font-semibold ${deadline === 'TODAY' ? 'border-amber-700 text-amber-800' : 'border-transparent text-amber-800 hover:border-amber-200'}`} aria-pressed={deadline === 'TODAY'} onClick={() => setDeadline(deadline === 'TODAY' ? '' : 'TODAY')}>
              {data?.summary.dueToday ?? 0} idag
            </button>
            <button type="button" className={`min-h-11 min-w-0 border-b-2 px-0.5 font-semibold ${deadline === 'UPCOMING' ? 'border-primary-600 text-graphite-950' : 'border-transparent hover:text-graphite-950'}`} aria-pressed={deadline === 'UPCOMING'} onClick={() => setDeadline(deadline === 'UPCOMING' ? '' : 'UPCOMING')}>
              {data?.summary.upcoming ?? 0} / 7 dagar
            </button>
          </div>}

          <div className="mb-3 flex gap-2 border-b border-graphite-200 pb-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Sök projekt</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-400" aria-hidden="true" />
              <input className="input pl-9" type="search" placeholder="Sök projekt, kund eller plats" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <button type="button" className="btn-secondary min-w-11 shrink-0 px-3" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen} aria-controls="project-filters" aria-label={activeFilterCount > 0 ? `Filter, ${activeFilterCount} aktiva` : 'Filter'}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Filter</span>{activeFilterCount > 0 && <span aria-label={`${activeFilterCount} aktiva filter`}>({activeFilterCount})</span>}
            </button>
          </div>

          {filtersOpen && (
            <div id="project-filters" className="mb-3 grid grid-cols-1 gap-3 border-b border-graphite-200 pb-4 sm:grid-cols-2 xl:grid-cols-4">
              <select className="input" aria-label="Filtrera på projektstatus" value={projectStatus} onChange={(event) => setProjectStatus(event.target.value)}>
                <option value="">Alla projektstatusar</option><option value="PLANNED">Planerade</option><option value="ONGOING">Pågående</option><option value="COMPLETED">Avslutade</option>
              </select>
              <select className="input" aria-label="Filtrera på uppgiftsstatus" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
                <option value="">Alla uppgiftsstatusar</option>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {isManager ? (
                <select className="input" aria-label="Filtrera på ansvarig" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Alla ansvariga</option>{users?.filter((item) => item.active && item.role !== 'ACCOUNTANT').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              ) : <div className="flex min-h-11 items-center text-sm text-graphite-600">Dina öppna uppgifter visas först</div>}
              <button type="button" className="min-h-11 justify-self-start px-1 text-sm font-semibold text-primary-700 disabled:text-graphite-400" onClick={clearFilters} disabled={!hasFilters}>Rensa filter</button>
            </div>
          )}

          {hasFilters && (
            <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-graphite-200 pb-2 text-sm text-graphite-600">
              <span>Visar: <strong className="font-semibold text-graphite-950">{activeFilterLabels.join(' · ')}</strong></span>
              <button type="button" className="min-h-11 px-2 font-semibold text-primary-700" onClick={clearFilters}>Rensa</button>
            </div>
          )}

          {isManager && Boolean(data?.items.length) && <div className="sticky top-0 z-10 mb-2 flex min-h-14 flex-wrap items-center gap-2 border-y border-graphite-200 bg-white px-2 py-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm">
              <input type="checkbox" checked={allSelected} ref={(element) => { if (element) element.indeterminate = selectedProjects.length > 0 && !allSelected; }} disabled={isFetching || changeArchive.isPending} onChange={() => setSelected(allSelected ? new Set() : new Set(data?.items.map((project) => project.id)))} />
              Markera alla visade
            </label>
            <span className="text-sm text-graphite-600" role="status">{selectedProjects.length} valda</span>
            {selectedProjects.length > 0 && <>
              <button type="button" className="btn-primary ml-auto" disabled={isFetching || changeArchive.isPending} onClick={() => setConfirmProjects(selectedProjects)}><Archive className="h-4 w-4" aria-hidden="true" />{archived ? 'Återställ valda' : 'Arkivera valda'}</button>
              <button type="button" className="btn-secondary" disabled={changeArchive.isPending} onClick={() => setSelected(new Set())}>Avmarkera</button>
            </>}
          </div>}
          {isFetching && <p role="status" className="mb-2 text-sm text-graphite-600">Uppdaterar projektlistan…</p>}
          {isFetching && !data ? (
            <div className="border-t border-graphite-200 bg-white" role="status" aria-live="polite" aria-label="Uppdaterar projektlistan">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-graphite-200 px-3 py-1">
                  <Skeleton width={row === 2 ? '72%' : '58%'} height={16} />
                  <Skeleton width={44} height={20} />
                </div>
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title={!search && !hasFilters ? archived ? 'Inga arkiverade projekt' : 'Inga aktiva projekt' : 'Inga projekt matchar'}
              description={!search && !hasFilters ? archived ? 'Arkiverade projekt visas här.' : 'Det finns inga aktiva projekt att visa.' : 'Justera sökningen eller filtren.'}
            />
          ) : (
            <div className="border-t border-graphite-200 bg-white">
              {data.items.map((project) => (
                <ProjectControlRow
                  key={project.id}
                  project={project}
                  open={expanded.has(project.id)}
                  isManager={isManager}
                  showDone={taskStatus === 'DONE'}
                  onToggle={() => toggleExpanded(project.id)}
                  onAddTask={() => setTaskDialog({ project })}
                  onEditTask={(task) => setTaskDialog({ project, task })}
                  onEditProject={() => loadProjectMutation.mutate(project.id)}
                  selected={selected.has(project.id)}
                  disabled={isFetching || changeArchive.isPending}
                  loadingEditor={loadProjectMutation.isPending}
                  onSelect={() => toggleSelected(project.id)}
                  onInactivateProject={() => setConfirmProjects([project])}
                />
              ))}
            </div>
          )}
        </>
      )}

      {taskDialog && <TaskDialog context={taskDialog} projects={(data?.items || []).filter((project) => project.active)} users={(users || []) as User[]} isManager={isManager} onClose={() => setTaskDialog(null)} onSaved={() => { setTaskDialog(null); refetch(); }} />}
      {projectDialog && <ProjectDialog project={projectDialog.project} onClose={() => setProjectDialog(null)} onSaved={() => { setProjectDialog(null); refetch(); }} />}
      <ConfirmDialog open={confirmProjects.length > 0} onClose={() => { if (!changeArchive.isPending) setConfirmProjects([]); }} onConfirm={() => changeArchive.mutate(confirmProjects)} title={`${archived ? 'Återställ' : 'Arkivera'} ${confirmProjects.length} projekt?`} description={confirmProjects.map((project) => `${project.code} · ${project.name}`).join(', ')} consequence={archived ? 'Projekten blir valbara för tid och material igen. Tidigare projektstatus behålls.' : 'Projekten flyttas till Arkiverade och blir inte längre valbara för ny tid eller nytt material. Timmar, material och historik finns kvar. Du kan återställa dem senare.'} confirmLabel={archived ? 'Återställ projekt' : 'Arkivera projekt'} confirmVariant="primary" isLoading={changeArchive.isPending} />
    </AppShell>
  );
}

function ProjectControlRow({ project, open, isManager, showDone, onToggle, onAddTask, onEditTask, onEditProject, onInactivateProject, selected, disabled, loadingEditor, onSelect }: { selected: boolean; disabled: boolean; loadingEditor: boolean; onSelect: () => void; project: ProjectControlItem; open: boolean; isManager: boolean; showDone: boolean; onToggle: () => void; onAddTask: () => void; onEditTask: (task: ProjectTask) => void; onEditProject: () => void; onInactivateProject: () => void }) {
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: ({ task, status }: { task: ProjectTask; status: ProjectTaskStatus }) => projectTasksApi.updateStatus(task.id, { status }),
    onSuccess: () => { toast.success('Uppgiften uppdaterades'); queryClient.invalidateQueries({ queryKey: ['project-control'] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const openTaskCount = project.tasks.filter((task) => task.status !== 'DONE').length;
  const visibleTasks = project.tasks.filter((task) => showDone ? task.status === 'DONE' : task.status !== 'DONE');
  const canExpand = project.active && (isManager || visibleTasks.length > 0);
  const rowTone = selected ? 'bg-primary-50/60' : '';
  const attentionLabel = project.overdueCount > 0
    ? (project.overdueCount === 1 ? '1 försenad' : `${project.overdueCount} försenade`)
    : project.dueTodayCount > 0
      ? (project.dueTodayCount === 1 ? '1 idag' : `${project.dueTodayCount} idag`)
      : project.upcomingCount > 0
        ? `${project.upcomingCount} kommande`
        : project.waitingCount > 0
          ? `${project.waitingCount} väntar`
          : showDone && visibleTasks.length > 0
            ? `${visibleTasks.length} klara`
            : openTaskCount > 0
              ? (openTaskCount === 1 ? '1 uppgift' : `${openTaskCount} uppgifter`)
              : null;
  const attentionTone = project.overdueCount > 0
    ? 'text-rose-700'
    : project.dueTodayCount > 0 || project.upcomingCount > 0 || project.waitingCount > 0
      ? 'text-amber-800'
      : 'text-graphite-600';

  const changeStatus = (task: ProjectTask, status: ProjectTaskStatus) => {
    if (status === 'WAITING') onEditTask({ ...task, status });
    else statusMutation.mutate({ task, status });
  };

  return (
    <article className={`border-b border-graphite-200 ${rowTone}`}>
      <div className="flex min-h-16 items-center gap-2 px-2 py-2 sm:px-3">
        {isManager && <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input type="checkbox" aria-label={`Markera ${project.code} · ${project.name}`} checked={selected} disabled={disabled} onChange={onSelect} /></label>}
        <div className="min-w-0 flex-1">
          <Link to={`/projects/${project.id}`} className="flex min-h-11 min-w-0 items-center font-semibold text-graphite-950 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <span className="[overflow-wrap:anywhere]">{project.code} · {project.name}</span>
          </Link>
          <p className="text-xs leading-5 text-graphite-600 [overflow-wrap:anywhere]">{project.customer?.name || 'Intern'}{project.site ? ` · ${project.site}` : ''} · {project.status === 'PLANNED' ? 'Planerad' : project.status === 'COMPLETED' ? 'Avslutad' : 'Pågående'}{!project.active ? ' · Arkiverad' : ''}</p>
          {attentionLabel && project.active && <span className={`text-xs font-semibold ${attentionTone}`}>{attentionLabel}</span>}
        </div>
        {isManager && <button type="button" className="btn-secondary min-w-11 shrink-0 px-3" disabled={disabled || loadingEditor} onClick={onEditProject} aria-label={`Redigera ${project.code} · ${project.name}`}><Edit2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Redigera</span></button>}
        {isManager && !project.active && <button type="button" className="btn-secondary min-w-11 shrink-0 px-3" aria-label={`Återställ ${project.code} · ${project.name}`} disabled={disabled} onClick={onInactivateProject}><RotateCcw className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Återställ</span></button>}
        {canExpand && <button type="button" className="icon-button shrink-0 border-0" onClick={onToggle} disabled={disabled} aria-expanded={open} aria-controls={`project-tasks-${project.id}`} aria-label={`${open ? 'Dölj' : 'Visa'} uppgifter för ${project.name}`}><ChevronDown aria-hidden="true" className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} /></button>}
      </div>
      {open && canExpand && (
        <div id={`project-tasks-${project.id}`} className="mx-3 mb-3 rounded-lg border border-graphite-200 bg-white px-3">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-graphite-950">{showDone ? 'Klara uppgifter' : 'Öppna uppgifter'}</h2>
            {isManager && <div className="flex flex-wrap items-center gap-1"><button type="button" className="min-h-11 px-2 text-sm font-semibold text-primary-700" onClick={onAddTask}>Lägg till uppgift</button><button type="button" className="min-h-11 px-2 text-sm font-semibold text-rose-700" disabled={disabled} onClick={onInactivateProject}>Arkivera</button></div>}
          </div>
          {!visibleTasks.length ? <p className="border-t border-graphite-200 py-4 text-sm text-graphite-600">{showDone ? 'Inga klara uppgifter.' : 'Inga öppna uppgifter.'}</p> : visibleTasks.map((task) => (
            <div key={task.id} className="grid gap-2 border-t border-graphite-200 py-3 md:grid-cols-[minmax(180px,1fr)_150px_140px_44px] md:items-center">
              <button type="button" className="min-h-11 text-left text-sm font-medium text-graphite-950 hover:text-primary-700" onClick={() => onEditTask(task)}>{task.title}</button>
              <span className="text-sm text-graphite-600">{task.assignee.name} · {formatTaskDate(task.dueDate)}</span>
              <select className="input" aria-label={`Status för ${task.title}`} value={task.status} disabled={statusMutation.isPending} onChange={(event) => changeStatus(task, event.target.value as ProjectTaskStatus)}>
                {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronRight className="hidden h-4 w-4 text-graphite-400 md:block" aria-hidden="true" />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function TaskDialog({ context, projects, users, isManager, onClose, onSaved }: { context: { project?: ProjectControlItem; task?: ProjectTask }; projects: ProjectControlItem[]; users: User[]; isManager: boolean; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const task = context.task;
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [dialogStatus, setDialogStatus] = useState<ProjectTaskStatus>(task?.status || 'TODO');
  const today = toDateInputValue(new Date());
  const initialDueDate = task?.deadlineBucket === 'OVERDUE' && task.status === 'WAITING' ? today : task?.dueDate || today;
  const saveMutation = useMutation({
    mutationFn: (data: { projectId: string; title: string; note?: string | null; assigneeId: string; priority: ProjectTaskPriority; status: ProjectTaskStatus; dueDate: string }) => task
      ? isManager ? projectTasksApi.update(task.id, data) : projectTasksApi.updateStatus(task.id, { status: data.status, ...(data.status === 'WAITING' ? { dueDate: data.dueDate } : {}) })
      : projectTasksApi.create(data.projectId, { title: data.title, note: data.note, assigneeId: data.assigneeId, priority: data.priority, status: data.status, dueDate: data.dueDate }),
    onSuccess: () => { toast.success(task ? 'Uppgiften sparades' : 'Uppgiften skapades'); queryClient.invalidateQueries({ queryKey: ['project-control'] }); onSaved(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveMutation = useMutation({
    mutationFn: () => projectTasksApi.archive(task!.id),
    onSuccess: () => { toast.success('Uppgiften arkiverades'); queryClient.invalidateQueries({ queryKey: ['project-control'] }); onSaved(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveMutation.mutate({ projectId: String(form.get('projectId') || context.project?.id || ''), title: String(form.get('title') || task?.title || ''), note: isManager ? String(form.get('note') || '').trim() || null : undefined, assigneeId: String(form.get('assigneeId') || task?.assigneeId || ''), priority: String(form.get('priority') || task?.priority || 'NORMAL') as ProjectTaskPriority, status: String(form.get('status')) as ProjectTaskStatus, dueDate: String(form.get('dueDate') || task?.dueDate || '') });
  };
  const availableUsers = users.filter((item) => item.active && item.role !== 'ACCOUNTANT');
  return <>
    <Dialog open={!confirmArchive} onClose={onClose} title={task ? 'Redigera uppgift' : 'Ny uppgift'} description={context.project ? `${context.project.code} · ${context.project.name}` : 'Välj projekt och ansvarig.'} footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">{task && isManager ? <button type="button" className="btn-danger" onClick={() => setConfirmArchive(true)}>Arkivera</button> : <span />}<div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button><button type="submit" form="project-task-form" className="btn-primary" disabled={saveMutation.isPending}>Spara uppgift</button></div></div>}>
      <form id="project-task-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!context.project && <label className="sm:col-span-2"><span className="label">Projekt</span><select name="projectId" className="input" required defaultValue=""><option value="" disabled>Välj projekt</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>}
        <label className="sm:col-span-2"><span className="label">Vad ska göras?</span><input autoFocus name="title" className="input" required maxLength={160} defaultValue={task?.title || ''} disabled={!isManager && Boolean(task)} /></label>
        {isManager ? <label><span className="label">Ansvarig</span><select name="assigneeId" className="input" required defaultValue={task?.assigneeId || availableUsers[0]?.id || ''}>{availableUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <div><span className="label">Ansvarig</span><div className="flex min-h-11 items-center text-sm text-graphite-800">{task?.assignee.name}</div></div>}
        <label><span className="label">Deadline / uppföljning</span><input name="dueDate" className="input" type="date" required min={dialogStatus === 'WAITING' ? today : undefined} defaultValue={initialDueDate} disabled={!isManager && dialogStatus !== 'WAITING'} /></label>
        <label><span className="label">Status</span><select name="status" className="input" value={dialogStatus} onChange={(event) => setDialogStatus(event.target.value as ProjectTaskStatus)}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="label">Prioritet</span><select name="priority" className="input" defaultValue={task?.priority || 'NORMAL'} disabled={!isManager}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="label">Anteckning, valfri</span><textarea name="note" className="input min-h-24" maxLength={2000} defaultValue={task?.note || ''} disabled={!isManager} /></label>
      </form>
    </Dialog>
    {task && <ConfirmDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} onConfirm={() => archiveMutation.mutate()} title="Arkivera uppgiften?" description={`”${task.title}” tas bort från projektets arbetslista men historiken sparas.`} confirmLabel="Arkivera" consequence="Uppgiften döljs från arbetslistan. Historiken sparas." isLoading={archiveMutation.isPending} />}
  </>;
}
