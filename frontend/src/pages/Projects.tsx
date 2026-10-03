import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, ChevronDown, ChevronRight, Edit2, Plus, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectTasksApi, projectsApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectControlItem, ProjectTask, ProjectTaskPriority, ProjectTaskStatus, User } from '../types';
import { AppShell, ConfirmDialog, Dialog, EmptyState, PageHeader } from '../components/ui/design';
import { ListSkeleton, Skeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { ProjectDialog } from '../components/ProjectDialog';
import { refreshProjectQueries } from '../utils/projectQueries';
import { formatHours, toDateInputValue } from '../utils/format';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

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

function needsAttention(project: ProjectControlItem) {
  return project.overdueCount > 0 || project.dueTodayCount > 0 || project.waitingCount > 0
    || Boolean(project.economy && (project.economy.unapprovedHours > 0
      || (project.economy.budgetUsagePercent ?? 0) >= 100 || project.economy.warnings.length > 0));
}

export default function Projects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const archived = searchParams.get('archived') === '1';
  const setArchived = (value: boolean) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set('archived', '1'); else next.delete('archived');
    return next;
  }, { replace: true });
  const directoryPath = archived ? '/projects?archived=1' : '/projects';
  const customerId = searchParams.get('customerId');
  const customerView = searchParams.has('customerId') || searchParams.has('internal');
  const validCustomer = Boolean(customerId) && !searchParams.has('internal');
  const internalView = searchParams.get('internal') === '1' && !searchParams.has('customerId');
  const scopeKey = !customerView ? 'directory' : validCustomer ? `customer:${customerId}` : internalView ? 'internal' : 'invalid';
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const [customerIdentity, setCustomerIdentity] = useState<{ key: string; name: string } | null>(null);
  const inCustomerScope = (project: ProjectControlItem | Project) => !customerView || (validCustomer ? project.customer?.id === customerId : internalView && !project.customer);
  const customerPath = (id?: string) => {
    const params = new URLSearchParams(id ? { customerId: id } : { internal: '1' });
    if (archived) params.set('archived', '1');
    return `/projects?${params}`;
  };
  const projectPath = (id: string) => `/projects/${id}${customerView ? customerPath(validCustomer ? customerId! : undefined).slice('/projects'.length) : archived ? '?archived=1' : ''}`;
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmProjects, setConfirmProjects] = useState<ProjectControlItem[]>([]);
  const [batchError, setBatchError] = useState('');
  const [search, setSearch] = useState('');
  const searchTerm = useDebouncedValue(search);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [taskDialog, setTaskDialog] = useState<{ project?: ProjectControlItem; task?: ProjectTask } | null>(null);
  const [projectDialog, setProjectDialog] = useState<{ project?: Project } | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['project-control', archived, searchTerm, projectStatus, deadline, assigneeId, taskStatus],
    queryFn: () => projectTasksApi.control({ active: archived ? 'false' : 'true', q: searchTerm || undefined, projectStatus: projectStatus || undefined, deadline: deadline || undefined, assigneeId: assigneeId || undefined, taskStatus: taskStatus || undefined }),
    placeholderData: keepPreviousData,
  });
  const { data: users } = useQuery({ queryKey: ['users', 'project-tasks'], queryFn: usersApi.list, enabled: isManager });
  const loadProjectMutation = useMutation({ mutationFn: async (id: string) => {
    const requestedScope = scopeKey;
    return { project: await projectsApi.get(id), requestedScope };
  }, onSuccess: ({ project, requestedScope }) => {
    if (requestedScope === currentScope.current) setProjectDialog({ project });
  }, onError: (error: Error) => toast.error(error.message) });
  const changeArchive = useMutation({
    mutationFn: async (items: ProjectControlItem[]) => {
      const requestedScope = scopeKey;
      const restoring = archived;
      const failed: Array<{ project: ProjectControlItem; message: string }> = [];
      for (const project of items) {
        try {
          if (project.active) await projectsApi.delete(project.id);
          else await projectsApi.restore(project.id);
        } catch (error) {
          failed.push({ project, message: error instanceof Error ? error.message : 'Kunde inte spara' });
        }
      }
      return { failed, succeeded: items.length - failed.length, requestedScope, restoring };
    },
    onSuccess: ({ failed, succeeded, requestedScope, restoring }) => {
      if (requestedScope === currentScope.current) {
        setConfirmProjects([]);
        setSelected(new Set(failed.map((item) => item.project.id)));
        setBatchError(failed.map(({ project, message }) => `${project.code} · ${project.name}: ${message}`).join(' · '));
      }
      if (succeeded) toast.success(`${succeeded} projekt ${restoring ? 'återställdes' : 'arkiverades'}`);
      void refreshProjectQueries(queryClient);
    },
  });
  useEffect(() => {
    setSelected(new Set());
    setBatchError('');
  }, [archived, search, projectStatus, deadline, assigneeId, taskStatus, attentionOnly, scopeKey]);
  useEffect(() => {
    setConfirmProjects([]);
    setTaskDialog(null);
    setProjectDialog(null);
    setExpanded(new Set());
    setManaging(false);
  }, [scopeKey]);
  const scopedProjects = (data?.items || []).filter(inCustomerScope);
  const foundCustomerName = scopedProjects[0]?.customer?.name || (internalView ? 'Intern' : null);
  useEffect(() => {
    setCustomerIdentity((current) => foundCustomerName && customerView
      ? { key: scopeKey, name: foundCustomerName }
      : current?.key === scopeKey ? current : null);
  }, [scopeKey, foundCustomerName, customerView]);
  const customerName = foundCustomerName || (customerIdentity?.key === scopeKey ? customerIdentity.name : null);
  const visibleProjects = scopedProjects.filter((project) => !attentionOnly || needsAttention(project));
  const customerGroups = new Map<string, { name: string; path: string; projects: ProjectControlItem[] }>();
  for (const project of visibleProjects) {
    const key = project.customer ? `customer:${project.customer.id}` : 'internal';
    const group = customerGroups.get(key) || { name: project.customer?.name || 'Intern', path: customerPath(project.customer?.id), projects: [] };
    group.projects.push(project);
    customerGroups.set(key, group);
  }
  const selectedProjects = visibleProjects.filter((project) => selected.has(project.id));
  const allSelected = Boolean(visibleProjects.length) && selectedProjects.length === visibleProjects.length;
  const listUpdating = isFetching || search !== searchTerm;
  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const activeFilterCount = [projectStatus, deadline, taskStatus, assigneeId, archived, attentionOnly].filter(Boolean).length;
  const hasFilters = [projectStatus, deadline, taskStatus, assigneeId].some(Boolean);
  const countLabel = (count: number) => `${count} ${search || hasFilters || attentionOnly ? 'projekt i urvalet' : archived ? count === 1 ? 'arkiverat projekt' : 'arkiverade projekt' : count === 1 ? 'aktivt projekt' : 'aktiva projekt'}`;
  const activeFilterLabels = [
    archived ? 'Arkiverade' : null,
    attentionOnly ? 'Behöver åtgärd' : null,
    projectStatus ? projectStatusLabels[projectStatus] : null,
    deadline ? deadlineLabels[deadline] : null,
    taskStatus ? taskStatusLabels[taskStatus as ProjectTaskStatus] : null,
    assigneeId ? users?.find((item) => item.id === assigneeId)?.name : null,
  ].filter(Boolean);

  const clearFilters = () => {
    setArchived(false);
    setAttentionOnly(false);
    setDeadline('');
    setProjectStatus('');
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
      {customerView && <Link to={directoryPath} className="btn-secondary inline-flex w-fit"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Tillbaka till kunder</Link>}
      <PageHeader
        title={customerView ? customerName || 'Kundens projekt' : 'Projekt'}
        description={customerView ? `${countLabel(visibleProjects.length)}. Välj ett projekt för att öppna detaljerna.` : managing ? isManager ? 'Uppgifter, underlag och hantering av projekten.' : 'Dina öppna uppgifter visas först.' : 'Välj en kund för att se deras projekt.'}
        action={(
          <div className="flex flex-wrap gap-2">
            {isManager && <button type="button" className="btn-primary" onClick={() => setProjectDialog({})}>Nytt projekt</button>}
            <button type="button" className="btn-secondary" aria-pressed={managing} onClick={() => setManaging((current) => !current)}>{isManager ? 'Hantera' : 'Uppgifter'}</button>
            {isManager && managing && <button type="button" className="btn-secondary" onClick={() => setTaskDialog({})} disabled={archived || !scopedProjects.length}>
              <Plus className="h-4 w-4" aria-hidden="true" />Ny uppgift
            </button>}
          </div>
        )}
      />

      {isManager && managing && <div className="flex flex-wrap gap-2 border-b border-graphite-200" aria-label="Projektvy">
        <button type="button" className={`min-h-11 px-3 text-sm font-semibold border-b-2 ${!archived && !attentionOnly ? 'border-primary-600 text-primary-700' : 'border-transparent text-graphite-600'}`} aria-pressed={!archived && !attentionOnly} disabled={changeArchive.isPending} onClick={() => { setArchived(false); setAttentionOnly(false); clearFilters(); }}>Aktiva</button>
        {!archived && <button type="button" className={`min-h-11 px-3 text-sm font-semibold border-b-2 ${attentionOnly ? 'border-primary-600 text-primary-700' : 'border-transparent text-graphite-600'}`} aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)}>Behöver åtgärd</button>}
        <Link to="/project-economy" className="flex min-h-11 items-center px-3 text-sm font-semibold text-graphite-600 hover:text-primary-700">Ekonomi</Link>
        <Link to="/purchases?status=DRAFT" className="flex min-h-11 items-center px-3 text-sm font-semibold text-graphite-600 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500">Inköp{!isError && data?.summary.invoiceDraftCount != null ? ` · ${data.summary.invoiceDraftCount} utkast i företaget` : ''}</Link>
        <button type="button" className={`min-h-11 px-3 text-sm font-semibold border-b-2 ${archived ? 'border-primary-600 text-primary-700' : 'border-transparent text-graphite-600'}`} aria-pressed={archived} disabled={changeArchive.isPending} onClick={() => { clearFilters(); setArchived(true); }}>Arkiverade</button>
      </div>}
      {archived && <p className="text-sm text-graphite-600">Historiken finns kvar. Återställ ett projekt när arbetet ska fortsätta.</p>}
      {batchError && <p role="alert" className="text-sm text-rose-700">Några projekt kunde inte ändras och är fortfarande markerade. {batchError}</p>}
      {loadProjectMutation.isPending && <p role="status" className="text-sm text-graphite-600">Öppnar projekt…</p>}
      {isError ? (
        <QueryError title="Projektkontrollen kunde inte hämtas" description="Kontrollera anslutningen och försök igen." onRetry={() => void refetch()} />
      ) : (
        <>
          {managing && !archived && !customerView && <div className="mb-3 grid grid-cols-4 items-stretch gap-x-2 border-y border-graphite-200 text-xs text-graphite-600 sm:text-sm" aria-label="Projektstatus">
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

          {customerView && Boolean(visibleProjects.length) && <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-3 border-y border-graphite-200 py-4" aria-label="Kundens projektstatus i urvalet">
            {Object.entries(projectStatusLabels).map(([status, label]) => <div key={status}>
              <dt className="text-sm text-graphite-600">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-graphite-950">{visibleProjects.filter((project) => project.status === status).length}</dd>
            </div>)}
          </dl>}
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
              {isManager && <select className="input" aria-label="Visa aktiva eller arkiverade projekt" value={archived ? 'archived' : 'active'} disabled={changeArchive.isPending} onChange={(event) => { clearFilters(); setArchived(event.target.value === 'archived'); }}>
                <option value="active">Aktiva projekt</option><option value="archived">Arkiverade projekt</option>
              </select>}
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
              <button type="button" className="min-h-11 justify-self-start px-1 text-sm font-semibold text-primary-700 disabled:text-graphite-400" onClick={clearFilters} disabled={activeFilterCount === 0}>Rensa filter</button>
            </div>
          )}

          {activeFilterCount > 0 && (
            <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-graphite-200 pb-2 text-sm text-graphite-600">
              <span>Visar: <strong className="font-semibold text-graphite-950">{activeFilterLabels.join(' · ')}</strong></span>
              <button type="button" className="min-h-11 px-2 font-semibold text-primary-700" onClick={clearFilters}>Rensa</button>
            </div>
          )}

          {isManager && managing && Boolean(scopedProjects.length) && <div className="sticky top-0 z-10 mb-2 flex min-h-14 flex-wrap items-center gap-2 border-y border-graphite-200 bg-white px-2 py-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm">
              <input type="checkbox" checked={allSelected} ref={(element) => { if (element) element.indeterminate = selectedProjects.length > 0 && !allSelected; }} disabled={listUpdating || changeArchive.isPending} onChange={() => setSelected(allSelected ? new Set() : new Set(visibleProjects.map((project) => project.id)))} />
              Markera alla visade
            </label>
            <span className="text-sm text-graphite-600" role="status">{selectedProjects.length} valda</span>
            {selectedProjects.length > 0 && <>
              <button type="button" className="btn-primary ml-auto" disabled={listUpdating || changeArchive.isPending} onClick={() => setConfirmProjects(selectedProjects)}><Archive className="h-4 w-4" aria-hidden="true" />{archived ? 'Återställ valda' : 'Arkivera valda'}</button>
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
          ) : !visibleProjects.length ? (
            <EmptyState
              title={customerView && !customerName ? 'Kunden finns inte i aktuellt urval' : attentionOnly ? 'Inga projekt behöver åtgärd i detta urval' : !search && !hasFilters ? archived ? 'Inga arkiverade projekt' : 'Inga aktiva projekt' : 'Inga projekt matchar'}
              description={customerView && !customerName ? 'Justera sökningen eller filtren, eller gå tillbaka till kunder.' : attentionOnly ? 'Välj Rensa för att visa aktiva projekt utan filter.' : !search && !hasFilters ? archived ? 'Arkiverade projekt visas här.' : 'Det finns inga aktiva projekt att visa.' : 'Justera sökningen eller filtren.'}
            />
          ) : (
            <div className="project-list">
              {!managing && !customerView ? [...customerGroups.entries()].map(([key, group]) => <Link key={key} to={group.path} className="project-directory-row">
                <span className="min-w-0">
                  <span className="block font-semibold text-graphite-950 [overflow-wrap:anywhere]">{group.name}</span>
                  <span className="mt-1 block text-sm text-graphite-600">{countLabel(group.projects.length)}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-graphite-400" aria-hidden="true" />
              </Link>) : visibleProjects.map((project) => managing ? (
                <ProjectControlRow
                  key={project.id}
                  detailPath={projectPath(project.id)}
                  project={project}
                  open={expanded.has(project.id)}
                  isManager={isManager}
                  showDone={taskStatus === 'DONE'}
                  onToggle={() => toggleExpanded(project.id)}
                  onAddTask={() => setTaskDialog({ project })}
                  onEditTask={(task) => setTaskDialog({ project, task })}
                  onEditProject={() => loadProjectMutation.mutate(project.id)}
                  selected={selected.has(project.id)}
                  disabled={listUpdating || changeArchive.isPending}
                  loadingEditor={loadProjectMutation.isPending}
                  onSelect={() => toggleSelected(project.id)}
                  onInactivateProject={() => setConfirmProjects([project])}
                />
              ) : (
                <Link key={project.id} to={projectPath(project.id)} className="project-directory-row">
                  <span className="min-w-0">
                    <span className="block font-semibold text-graphite-950 [overflow-wrap:anywhere]">{project.name}</span>
                    <span className="mt-1 block text-sm text-graphite-600">{project.code} · {project.status === 'PLANNED' ? 'Planerad' : project.status === 'COMPLETED' ? 'Avslutad' : 'Pågående'}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-graphite-400" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {taskDialog && <TaskDialog context={taskDialog} projects={scopedProjects.filter((project) => project.active)} users={(users || []) as User[]} isManager={isManager} onClose={() => setTaskDialog(null)} onSaved={() => { setTaskDialog(null); refetch(); }} />}
      {projectDialog && <ProjectDialog project={projectDialog.project} onClose={() => setProjectDialog(null)} onSaved={() => { setProjectDialog(null); refetch(); }} />}
      <ConfirmDialog open={confirmProjects.length > 0} onClose={() => { if (!changeArchive.isPending) setConfirmProjects([]); }} onConfirm={() => changeArchive.mutate(confirmProjects)} title={`${archived ? 'Återställ' : 'Arkivera'} ${confirmProjects.length} projekt?`} description={confirmProjects.map((project) => `${project.code} · ${project.name}`).join(', ')} consequence={archived ? 'Projekten blir valbara för tid och material igen. Tidigare projektstatus behålls.' : 'Projekten flyttas till Arkiverade och blir inte längre valbara för ny tid eller nytt material. Timmar, material och historik finns kvar. Du kan återställa dem senare.'} confirmLabel={archived ? 'Återställ projekt' : 'Arkivera projekt'} confirmVariant="primary" isLoading={changeArchive.isPending} />
    </AppShell>
  );
}

function ProjectControlRow({ detailPath, project, open, isManager, showDone, onToggle, onAddTask, onEditTask, onEditProject, onInactivateProject, selected, disabled, loadingEditor, onSelect }: { detailPath: string; selected: boolean; disabled: boolean; loadingEditor: boolean; onSelect: () => void; project: ProjectControlItem; open: boolean; isManager: boolean; showDone: boolean; onToggle: () => void; onAddTask: () => void; onEditTask: (task: ProjectTask) => void; onEditProject: () => void; onInactivateProject: () => void }) {
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
    <article className={`border-b border-graphite-200 last:border-b-0 ${rowTone}`}>
      <div className={`project-row ${isManager ? 'project-row-selectable' : ''}`}>
        {isManager && <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input type="checkbox" aria-label={`Markera ${project.code} · ${project.name}`} checked={selected} disabled={disabled} onChange={onSelect} /></label>}
        <div className={`project-row-content ${isManager ? 'project-row-manager' : ''}`}>
          <div className="min-w-0">
          <Link to={detailPath} className="flex min-h-11 min-w-0 items-center font-semibold text-graphite-950 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
            <span className="[overflow-wrap:anywhere]">{project.code} · {project.name}</span>
          </Link>
          <p className="text-xs leading-5 text-graphite-600 [overflow-wrap:anywhere]">{project.customer?.name || 'Intern'}{project.site ? ` · ${project.site}` : ''} · {project.status === 'PLANNED' ? 'Planerad' : project.status === 'COMPLETED' ? 'Avslutad' : 'Pågående'}{!project.active ? ' · Arkiverad' : ''}</p>
          </div>
          <div className="min-w-0 xl:pt-3">
            <p className="mb-1 text-xs font-medium text-graphite-500">Nästa uppgift</p>
            {project.nextTask ? <><p className="text-sm font-medium text-graphite-800 [overflow-wrap:anywhere]">{project.nextTask.title}</p><p className="mt-1 text-xs text-graphite-600">{project.nextTask.assignee.name} · {formatTaskDate(project.nextTask.dueDate)}</p></> : <p className="text-sm text-graphite-500">Ingen uppgift i urvalet</p>}
            {attentionLabel && project.active && <span className={`mt-1 inline-block text-xs font-semibold ${attentionTone}`}>{attentionLabel}</span>}
          </div>
          {isManager && project.economy && <div className="flex min-w-0 flex-col gap-1 text-xs text-graphite-600 xl:pt-3">
            <p className="font-medium text-graphite-500">Timmar och underlag</p>
            <span>{formatHours(project.economy.reportedHours)} rapporterat{project.economy.budgetHours != null ? ` / ${formatHours(project.economy.budgetHours)} budget` : ' · Ingen timbudget'}</span>
            {project.economy.unapprovedHours > 0 && <span className="text-amber-800">{formatHours(project.economy.unapprovedHours)} ej attesterat</span>}
            {(project.economy.budgetUsagePercent ?? 0) >= 100 && <span className="font-semibold text-rose-700">Timbudget nådd</span>}
            {project.economy.warnings.length > 0 && <span className="text-amber-800">{project.economy.warnings[0]}</span>}
          </div>}
        </div>
        <div className="project-row-actions">
        {isManager && <button type="button" className="icon-button" disabled={disabled || loadingEditor} onClick={onEditProject} aria-label={`Redigera ${project.code} · ${project.name}`}><Edit2 className="h-4 w-4" aria-hidden="true" /></button>}
        {isManager && !project.active && <button type="button" className="btn-secondary min-w-11 shrink-0 px-3" aria-label={`Återställ ${project.code} · ${project.name}`} disabled={disabled} onClick={onInactivateProject}><RotateCcw className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Återställ</span></button>}
        {canExpand && <button type="button" className="icon-button shrink-0 border-0" onClick={onToggle} disabled={disabled} aria-expanded={open} aria-controls={`project-tasks-${project.id}`} aria-label={`${open ? 'Dölj' : 'Visa'} uppgifter för ${project.name}`}><ChevronDown aria-hidden="true" className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} /></button>}
        </div>
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
