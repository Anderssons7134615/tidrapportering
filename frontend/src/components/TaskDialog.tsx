import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { projectTasksApi } from '../services/api';
import type { ProjectControlItem, ProjectTask, ProjectTaskPriority, ProjectTaskStatus, User } from '../types';
import { ConfirmDialog, Dialog } from './ui/design';
import { refreshProjectQueries } from '../utils/projectQueries';
import { toDateInputValue } from '../utils/format';

export const taskStatusLabels: Record<ProjectTaskStatus, string> = { TODO: 'Att göra', IN_PROGRESS: 'Pågår', WAITING: 'Väntar', DONE: 'Klar' };
const priorityLabels: Record<ProjectTaskPriority, string> = { LOW: 'Låg', NORMAL: 'Normal', HIGH: 'Hög' };

type TaskProject = Pick<ProjectControlItem, 'id' | 'code' | 'name' | 'active'>;
export function TaskDialog({ context, projects, users, isManager, onClose, onSaved }: { context: { project?: TaskProject; task?: ProjectTask }; projects: TaskProject[]; users: User[]; isManager: boolean; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const task = context.task;
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [dialogStatus, setDialogStatus] = useState<ProjectTaskStatus>(task?.status || 'TODO');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || '');
  const today = toDateInputValue(new Date());
  const initialDueDate = task?.deadlineBucket === 'OVERDUE' && task.status === 'WAITING' ? today : task?.dueDate || today;
  const saveMutation = useMutation({
    mutationFn: (data: { projectId: string; title: string; note?: string | null; assigneeId: string; priority: ProjectTaskPriority; status: ProjectTaskStatus; dueDate: string }) => task
      ? isManager ? projectTasksApi.update(task.id, data) : projectTasksApi.updateStatus(task.id, { status: data.status, ...(data.status === 'WAITING' ? { dueDate: data.dueDate } : {}) })
      : projectTasksApi.create(data.projectId, { title: data.title, note: data.note, assigneeId: data.assigneeId, priority: data.priority, status: data.status, dueDate: data.dueDate }),
    onSuccess: () => { toast.success(task ? 'Uppgiften sparades' : 'Uppgiften skapades'); void refreshProjectQueries(queryClient); onSaved(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveMutation = useMutation({
    mutationFn: () => projectTasksApi.archive(task!.id),
    onSuccess: () => { toast.success('Uppgiften arkiverades'); void refreshProjectQueries(queryClient); onSaved(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = saveMutation.isPending || archiveMutation.isPending;
  const close = () => { if (!busy) onClose(); };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    saveMutation.mutate({ projectId: String(form.get('projectId') || context.project?.id || ''), title: String(form.get('title') || task?.title || ''), note: isManager ? String(form.get('note') || '').trim() || null : undefined, assigneeId: String(form.get('assigneeId') || task?.assigneeId || ''), priority: String(form.get('priority') || task?.priority || 'NORMAL') as ProjectTaskPriority, status: String(form.get('status')) as ProjectTaskStatus, dueDate: String(form.get('dueDate') || task?.dueDate || '') });
  };
  const availableUsers = users.filter((item) => item.active && item.role !== 'ACCOUNTANT');
  return <>
    <Dialog open={!confirmArchive} onClose={close} title={task ? 'Redigera uppgift' : 'Ny uppgift'} description={context.project ? `${context.project.code} · ${context.project.name}` : 'Välj projekt och ansvarig.'} footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">{task && isManager ? <button type="button" className="btn-danger" disabled={busy} onClick={() => setConfirmArchive(true)}>Arkivera</button> : <span />}<div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="btn-secondary" onClick={close} disabled={busy}>Avbryt</button><button type="submit" form="project-task-form" className="btn-primary" disabled={busy}>Spara uppgift</button></div></div>}>
      <form id="project-task-form" onSubmit={handleSubmit}><fieldset disabled={busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!context.project && <label className="sm:col-span-2"><span className="label">Projekt</span><select name="projectId" className="input" required defaultValue=""><option value="" disabled>Välj projekt</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>}
        <label className="sm:col-span-2"><span className="label">Vad ska göras?</span><input autoFocus name="title" className="input" required maxLength={160} defaultValue={task?.title || ''} disabled={!isManager && Boolean(task)} /></label>
        {isManager ? <label><span className="label">Ansvarig</span><select name="assigneeId" className="input" required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="" disabled>Välj ansvarig</option>{task && !availableUsers.some((item) => item.id === task.assigneeId) && <option value={task.assigneeId}>{task.assignee.name} (nuvarande ansvarig)</option>}{availableUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <div><span className="label">Ansvarig</span><div className="flex min-h-11 items-center text-sm text-graphite-800">{task?.assignee.name}</div></div>}
        <label><span className="label">Deadline / uppföljning</span><input name="dueDate" className="input" type="date" required min={dialogStatus === 'WAITING' ? today : undefined} defaultValue={initialDueDate} disabled={!isManager && dialogStatus !== 'WAITING'} /></label>
        <label><span className="label">Status</span><select name="status" className="input" value={dialogStatus} onChange={(event) => setDialogStatus(event.target.value as ProjectTaskStatus)}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="label">Prioritet</span><select name="priority" className="input" defaultValue={task?.priority || 'NORMAL'} disabled={!isManager}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="label">Anteckning, valfri</span><textarea name="note" className="input min-h-24" maxLength={2000} defaultValue={task?.note || ''} disabled={!isManager} /></label>
      </fieldset></form>
    </Dialog>
    {task && <ConfirmDialog open={confirmArchive} onClose={() => { if (!busy) setConfirmArchive(false); }} onConfirm={() => { if (!busy) archiveMutation.mutate(); }} title="Arkivera uppgiften?" description={`”${task.title}” tas bort från projektets arbetslista men historiken sparas.`} confirmLabel="Arkivera" consequence="Uppgiften döljs från arbetslistan. Historiken sparas." isLoading={archiveMutation.isPending} />}
  </>;
}
