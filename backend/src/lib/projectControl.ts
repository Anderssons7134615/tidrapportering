import { addUtcDays, getDateOnlyInTimeZone, startOfUtcDay } from './dateOnly.js';

export type ProjectTaskDeadlineBucket = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'LATER';
export type ProjectTaskStatusValue = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE';
export type ProjectTaskPriorityValue = 'LOW' | 'NORMAL' | 'HIGH';
export type ProjectTaskRole = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'ACCOUNTANT';

export function getProjectTaskCapabilities(role: string) {
  return {
    workQueue: role === 'ADMIN' || role === 'SUPERVISOR' || role === 'EMPLOYEE',
    manage: role === 'ADMIN' || role === 'SUPERVISOR',
    portfolio: role === 'ADMIN' || role === 'SUPERVISOR' || role === 'ACCOUNTANT',
  };
}

export function getProjectTaskScope(actor: { id: string; companyId: string; role: string }) {
  if (!getProjectTaskCapabilities(actor.role).workQueue) return null;
  return {
    companyId: actor.companyId,
    ...(actor.role === 'EMPLOYEE' ? { assigneeId: actor.id } : {}),
  };
}

export function escapePrismaLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export type ProjectControlSortableRow = {
  code: string;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  highestPriority: ProjectTaskPriorityValue | null;
  earliestDueDate: Date | null;
  lastActivityAt: Date | null;
};

export function classifyProjectTaskDeadline(
  dueDate: Date,
  referenceDate = new Date()
): ProjectTaskDeadlineBucket {
  const today = getDateOnlyInTimeZone(referenceDate);
  const dueDay = startOfUtcDay(dueDate);

  if (dueDay < today) return 'OVERDUE';
  if (dueDay.getTime() === today.getTime()) return 'TODAY';
  if (dueDay <= addUtcDays(today, 7)) return 'UPCOMING';
  return 'LATER';
}

export function getProjectTaskCompletion(
  previousStatus: ProjectTaskStatusValue,
  nextStatus: ProjectTaskStatusValue,
  completedAt: Date | null,
  now = new Date()
): Date | null {
  if (nextStatus !== 'DONE') return null;
  if (previousStatus === 'DONE' && completedAt) return completedAt;
  return now;
}

const priorityRank: Record<ProjectTaskPriorityValue, number> = { LOW: 1, NORMAL: 2, HIGH: 3 };

function urgencyRank(row: ProjectControlSortableRow) {
  if (row.overdueCount > 0) return 0;
  if (row.dueTodayCount > 0) return 1;
  if (row.upcomingCount > 0) return 2;
  return 3;
}

export function compareProjectControlRows(a: ProjectControlSortableRow, b: ProjectControlSortableRow) {
  const urgencyDifference = urgencyRank(a) - urgencyRank(b);
  if (urgencyDifference !== 0) return urgencyDifference;

  const priorityDifference = (priorityRank[b.highestPriority ?? 'LOW']) - (priorityRank[a.highestPriority ?? 'LOW']);
  if (urgencyRank(a) === 3) {
    if (priorityDifference !== 0) return priorityDifference;
    const activityDifference = (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0);
    if (activityDifference !== 0) return activityDifference;
  }

  const aDue = a.earliestDueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDue = b.earliestDueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  if (priorityDifference !== 0) return priorityDifference;

  if (urgencyRank(a) !== 3) {
    const activityDifference = (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0);
    if (activityDifference !== 0) return activityDifference;
  }

  return a.code.localeCompare(b.code, 'sv');
}
