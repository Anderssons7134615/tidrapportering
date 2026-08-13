import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi, projectTasksApi, projectsApi, usersApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectControlItem, ProjectTask, ProjectTaskPriority, ProjectTaskStatus, User } from '../types';
import { AppShell, ConfirmDialog, Dialog, EmptyState, PageHeader } from '../components/ui/design';
import { ListSkeleton } from '../components/ui/Skeleton';
import { QueryError } from '../components/ui/QueryError';
import { parseSwedishNumber } from '../utils/format';
import { toDateInputValue } from '../utils/format';

const taskStatusLabels: Record<ProjectTaskStatus, string> = {
  TODO: 'Att göra',
  IN_PROGRESS: 'Pågår',
  WAITING: 'Väntar',
  DONE: 'Klar',
};

const priorityLabels: Record<ProjectTaskPriority, string> = { LOW: 'Låg', NORMAL: 'Normal', HIGH: 'Hög' };

function formatTaskDate(date: string) {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

function formatActivity(date: string | null) {
  if (!date) return 'Ingen aktivitet registrerad';
  const stockholmDay = (value: Date) => {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'));
  };
  const days = Math.max(0, Math.round((stockholmDay(new Date()) - stockholmDay(new Date(date))) / 86_400_000));
  if (days === 0) return 'Aktivitet idag';
  if (days === 1) return 'Aktivitet igår';
  return `Aktivitet för ${days} dagar sedan`;
}

function formatTaskSummary(project: ProjectControlItem) {
  const parts = [
    project.overdueCount ? (project.overdueCount === 1 ? '1 försenad' : `${project.overdueCount} försenade`) : null,
    project.dueTodayCount ? (project.dueTodayCount === 1 ? '1 förfaller idag' : `${project.dueTodayCount} förfaller idag`) : null,
    project.waitingCount ? `${project.waitingCount} väntar` : null,
    project.upcomingCount ? `${project.upcomingCount} kommande` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Inget brådskande';
}

export default function Projects() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [search, setSearch] = useState('');
  const [deadline, setDeadline] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [taskDialog, setTaskDialog] = useState<{ project?: ProjectControlItem; task?: ProjectTask } | null>(null);
  const [projectDialog, setProjectDialog] = useState<{ project?: Project } | null>(null);
  const [projectToInactivate, setProjectToInactivate] = useState<ProjectControlItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project-control', search, projectStatus, deadline, assigneeId, taskStatus],
    queryFn: () => projectTasksApi.control({ q: search || undefined, projectStatus: projectStatus || undefined, deadline: deadline || undefined, assigneeId: assigneeId || undefined, taskStatus: taskStatus || undefined }),
  });
  const { data: users } = useQuery({ queryKey: ['users', 'project-tasks'], queryFn: usersApi.list, enabled: isManager });
  const loadProjectMutation = useMutation({ mutationFn: projectsApi.get, onSuccess: (project) => setProjectDialog({ project }), onError: (error: Error) => toast.error(error.message) });
  const inactivateProjectMutation = useMutation({ mutationFn: projectsApi.delete, onSuccess: () => { toast.success('Projektet inaktiverades'); setProjectToInactivate(null); refetch(); }, onError: (error: Error) => toast.error(error.message) });

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
        description="Se vad som kräver åtgärd och följ nästa steg i alla aktiva projekt."
        action={isManager ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setProjectDialog({})}>Nytt projekt</button>
            <button type="button" className="btn-primary" onClick={() => setTaskDialog({})} disabled={!data?.items.length}>
              <Plus className="h-4 w-4" aria-hidden="true" />Ny uppgift
            </button>
          </div>
        ) : undefined}
      />

      {isError ? (
        <QueryError title="Projektkontrollen kunde inte hämtas" description="Kontrollera anslutningen och försök igen." onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-graphite-200 py-3 text-sm text-graphite-600" aria-label="Projektstatus">
            <span><strong className="text-graphite-950">{data?.summary.active ?? 0}</strong> aktiva</span>
            <span><strong className="text-rose-700">{data?.summary.overdue ?? 0}</strong> försenade</span>
            <span><strong className="text-amber-800">{data?.summary.dueToday ?? 0}</strong> idag</span>
            <span><strong className="text-graphite-950">{data?.summary.upcoming ?? 0}</strong> kommande sju dagar</span>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 border-b border-graphite-200 pb-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(240px,1fr)_170px_170px_170px_170px]">
            <label className="relative">
              <span className="sr-only">Sök projekt</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-400" aria-hidden="true" />
              <input className="input pl-9" type="search" placeholder="Sök projekt, kund eller plats" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <select className="input" aria-label="Filtrera på projektstatus" value={projectStatus} onChange={(event) => setProjectStatus(event.target.value)}>
              <option value="">Alla projektstatusar</option><option value="PLANNED">Planerade</option><option value="ONGOING">Pågående</option><option value="COMPLETED">Avslutade</option>
            </select>
            <select className="input" aria-label="Filtrera på deadline" value={deadline} onChange={(event) => setDeadline(event.target.value)}>
              <option value="">Alla deadlines</option><option value="OVERDUE">Försenade</option><option value="TODAY">Idag</option><option value="UPCOMING">Kommande sju dagar</option>
            </select>
            <select className="input" aria-label="Filtrera på uppgiftsstatus" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
              <option value="">Alla statusar</option>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {isManager ? (
              <select className="input" aria-label="Filtrera på ansvarig" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Alla ansvariga</option>{users?.filter((item) => item.active && item.role !== 'ACCOUNTANT').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : <div className="flex min-h-11 items-center text-sm text-graphite-600">Visar dina uppgifter</div>}
          </div>

          {!data?.items.length ? (
            <EmptyState title="Inga projekt matchar filtret" description="Justera sökningen eller filtren." />
          ) : (
            <div className="border-t border-graphite-200 bg-white">
              <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(220px,1.5fr)_140px_120px_44px] gap-4 px-3 py-2 text-xs font-semibold text-graphite-500 md:grid">
                <span>Projekt</span><span>Nästa uppgift</span><span>Ansvarig</span><span>Deadline</span><span className="sr-only">Visa</span>
              </div>
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
                  onInactivateProject={() => setProjectToInactivate(project)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {taskDialog && <TaskDialog context={taskDialog} projects={data?.items || []} users={(users || []) as User[]} isManager={isManager} onClose={() => setTaskDialog(null)} onSaved={() => { setTaskDialog(null); refetch(); }} />}
      {projectDialog && <ProjectDialog project={projectDialog.project} onClose={() => setProjectDialog(null)} onSaved={() => { setProjectDialog(null); refetch(); }} />}
      <ConfirmDialog open={Boolean(projectToInactivate)} onClose={() => setProjectToInactivate(null)} onConfirm={() => projectToInactivate && inactivateProjectMutation.mutate(projectToInactivate.id)} title="Inaktivera projektet?" description={projectToInactivate ? `${projectToInactivate.code} · ${projectToInactivate.name} försvinner från aktiva projekt. Historiken sparas.` : undefined} confirmLabel="Inaktivera" isLoading={inactivateProjectMutation.isPending} />
    </AppShell>
  );
}

function ProjectControlRow({ project, open, isManager, showDone, onToggle, onAddTask, onEditTask, onEditProject, onInactivateProject }: { project: ProjectControlItem; open: boolean; isManager: boolean; showDone: boolean; onToggle: () => void; onAddTask: () => void; onEditTask: (task: ProjectTask) => void; onEditProject: () => void; onInactivateProject: () => void }) {
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: ({ task, status }: { task: ProjectTask; status: ProjectTaskStatus }) => projectTasksApi.updateStatus(task.id, { status }),
    onSuccess: () => { toast.success('Uppgiften uppdaterades'); queryClient.invalidateQueries({ queryKey: ['project-control'] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const rowTone = project.overdueCount > 0 ? 'bg-rose-50/70' : project.dueTodayCount > 0 ? 'bg-orange-50/70' : project.upcomingCount > 0 ? 'bg-amber-50/60' : '';
  const visibleTasks = project.tasks.filter((task) => showDone ? task.status === 'DONE' : task.status !== 'DONE');

  const changeStatus = (task: ProjectTask, status: ProjectTaskStatus) => {
    if (status === 'WAITING') onEditTask({ ...task, status });
    else statusMutation.mutate({ task, status });
  };

  return (
    <article className={`border-b border-graphite-200 ${rowTone}`}>
      <div className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_44px] gap-2 px-3 py-3 md:grid-cols-[minmax(180px,1.2fr)_minmax(220px,1.5fr)_140px_120px_44px] md:gap-4 md:items-center">
        <div className="col-start-1 row-start-1 min-w-0">
          <Link to={`/projects/${project.id}`} className="font-semibold text-graphite-950 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">{project.code} · {project.name}</Link>
          <p className="mt-1 text-xs text-graphite-600">{project.status === 'PLANNED' ? 'Planerad' : project.status === 'COMPLETED' ? 'Avslutad' : 'Pågående'} · {project.customer?.name || 'Intern'}{project.site ? ` · ${project.site}` : ''}</p>
          <p className="mt-1 text-xs text-graphite-500">{formatActivity(project.lastActivityAt)}</p>
        </div>
        <div className="col-span-2 col-start-1 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
          <p className="font-semibold text-graphite-900">{project.nextTask?.title || 'Ingen öppen uppgift'}</p>
          <p className="mt-1 text-xs text-graphite-600">{formatTaskSummary(project)}</p>
        </div>
        <div className="col-span-2 col-start-1 row-start-3 text-sm text-graphite-700 md:col-span-1 md:col-start-3 md:row-start-1">{project.nextTask?.assignee.name || '—'}</div>
        <div className={`col-span-2 col-start-1 row-start-4 text-sm font-semibold md:col-span-1 md:col-start-4 md:row-start-1 ${project.nextTask?.deadlineBucket === 'OVERDUE' ? 'text-rose-700' : project.nextTask?.deadlineBucket === 'TODAY' ? 'text-amber-800' : 'text-graphite-700'}`}>
          {project.nextTask ? (project.nextTask.deadlineBucket === 'OVERDUE' ? `Försenad · ${formatTaskDate(project.nextTask.dueDate)}` : project.nextTask.deadlineBucket === 'TODAY' ? 'Idag' : formatTaskDate(project.nextTask.dueDate)) : '—'}
        </div>
        <button type="button" className="icon-button col-start-2 row-start-1 self-start border-0 md:col-start-5 md:row-start-1 md:self-center" onClick={onToggle} aria-expanded={open} aria-controls={`project-tasks-${project.id}`} aria-label={`${open ? 'Dölj' : 'Visa'} uppgifter för ${project.name}`}>
          <ChevronDown aria-hidden="true" className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div id={`project-tasks-${project.id}`} className="mx-3 mb-3 rounded-lg border border-graphite-200 bg-white px-3">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-graphite-950">{showDone ? 'Klara uppgifter' : 'Öppna uppgifter'}</h2>
            {isManager && <div className="flex flex-wrap items-center gap-1"><button type="button" className="min-h-11 px-2 text-sm font-semibold text-primary-700" onClick={onAddTask}>Lägg till uppgift</button><button type="button" className="min-h-11 px-2 text-sm font-semibold text-graphite-700" onClick={onEditProject}>Redigera projekt</button><button type="button" className="min-h-11 px-2 text-sm font-semibold text-rose-700" onClick={onInactivateProject}>Inaktivera</button></div>}
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
    mutationFn: (data: { projectId: string; title: string; note?: string; assigneeId: string; priority: ProjectTaskPriority; status: ProjectTaskStatus; dueDate: string }) => task
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
    saveMutation.mutate({ projectId: String(form.get('projectId') || context.project?.id || ''), title: String(form.get('title') || task?.title || ''), note: String(form.get('note') || task?.note || '') || undefined, assigneeId: String(form.get('assigneeId') || task?.assigneeId || ''), priority: String(form.get('priority') || task?.priority || 'NORMAL') as ProjectTaskPriority, status: String(form.get('status')) as ProjectTaskStatus, dueDate: String(form.get('dueDate') || task?.dueDate || '') });
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
    {task && <ConfirmDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} onConfirm={() => archiveMutation.mutate()} title="Arkivera uppgiften?" description={`”${task.title}” tas bort från projektets arbetslista men historiken sparas.`} confirmLabel="Arkivera" isLoading={archiveMutation.isPending} />}
  </>;
}

function ProjectDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: () => void }) {
  const { data: customers } = useQuery({ queryKey: ['customers', 'active'], queryFn: () => customersApi.list(true) });
  const { data: nextCode } = useQuery({ queryKey: ['projects', 'next-code'], queryFn: projectsApi.nextCode, enabled: !project });
  const createMutation = useMutation({ mutationFn: projectsApi.create, onSuccess: () => { toast.success('Projektet skapades'); onSaved(); }, onError: (error: Error) => toast.error(error.message) });
  const updateMutation = useMutation({ mutationFn: (data: Partial<Project>) => projectsApi.update(project!.id, data), onSuccess: () => { toast.success('Projektet uppdaterades'); onSaved(); }, onError: (error: Error) => toast.error(error.message) });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const budgetText = String(form.get('budgetHours') || '').trim();
    const fixedPriceText = String(form.get('fixedPrice') || '').trim();
    const defaultRateText = String(form.get('defaultRate') || '').trim();
    const budgetHours = budgetText ? parseSwedishNumber(budgetText) : undefined;
    const fixedPrice = fixedPriceText ? parseSwedishNumber(fixedPriceText) : null;
    const defaultRate = defaultRateText ? parseSwedishNumber(defaultRateText) : null;
    const billingModel = String(form.get('billingModel')) as Project['billingModel'];
    if ((budgetText && (!Number.isFinite(budgetHours) || (budgetHours ?? 0) < 0)) || (fixedPriceText && !Number.isFinite(fixedPrice)) || (defaultRateText && (!Number.isFinite(defaultRate) || (defaultRate ?? 0) < 0))) {
      toast.error('Kontrollera budget, timpris och fast pris.');
      return;
    }
    if (billingModel === 'FIXED' && fixedPrice == null) {
      toast.error('Ange anbud eller fast pris för ett fastprisprojekt.');
      return;
    }
    const data = { name: String(form.get('name')), code: String(form.get('code')), customerId: String(form.get('customerId') || '') || undefined, site: String(form.get('site') || '') || undefined, status: String(form.get('status')) as Project['status'], budgetHours, billingModel, fixedPrice, defaultRate, notes: String(form.get('notes') || '') || undefined, employeeCanSeeResults: form.get('employeeCanSeeResults') === 'on' };
    if (project) updateMutation.mutate(data); else createMutation.mutate(data);
  };
  const saving = createMutation.isPending || updateMutation.isPending;
  return <Dialog open onClose={onClose} title={project ? 'Redigera projekt' : 'Nytt projekt'} description={!project && nextCode?.code ? `Nästa lediga projektnummer är förifyllt: ${nextCode.code}.` : undefined} footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button><button type="submit" form="project-form" className="btn-primary" disabled={saving}>{project ? 'Spara' : 'Skapa projekt'}</button></div>}><form id="project-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">Kund</span><select name="customerId" className="input" defaultValue={project?.customerId || ''}><option value="">Intern</option>{customers?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><ProjectField autoFocus name="name" label="Projektnamn" defaultValue={project?.name} required /><ProjectField key={project?.code || nextCode?.code || 'code'} name="code" label="Projektnummer" defaultValue={project?.code || nextCode?.code || ''} required /><ProjectField name="site" label="Arbetsplats" defaultValue={project?.site} /><label><span className="label">Status</span><select name="status" className="input" defaultValue={project?.status || 'PLANNED'}><option value="PLANNED">Planerad</option><option value="ONGOING">Pågående</option><option value="COMPLETED">Avslutad</option></select></label><ProjectField name="budgetHours" label="Budget timmar" defaultValue={project?.budgetHours} inputMode="decimal" placeholder="80" /><label><span className="label">Debitering</span><select name="billingModel" className="input" defaultValue={project?.billingModel || 'HOURLY'}><option value="HOURLY">Löpande</option><option value="FIXED">Fast pris</option></select></label><ProjectField name="defaultRate" label="Timpris till kund (kr/tim)" defaultValue={project?.defaultRate ?? ''} inputMode="decimal" placeholder="650" /><ProjectField name="fixedPrice" label="Anbud / fast pris (exkl. moms)" defaultValue={project?.fixedPrice ?? ''} inputMode="decimal" placeholder="150 000" /><label className="sm:col-span-2"><span className="label">Anteckningar</span><textarea name="notes" className="input min-h-24" defaultValue={project?.notes || ''} /></label><label className="sm:col-span-2 flex min-h-11 items-center gap-3 border-y border-graphite-200 py-3 text-sm"><input name="employeeCanSeeResults" type="checkbox" defaultChecked={project?.employeeCanSeeResults || false} /><span>Visa attesterade projekttimmar för medarbetare</span></label></form></Dialog>;
}

function ProjectField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label><span className="label">{label}</span><input {...props} className="input" /></label>;
}
