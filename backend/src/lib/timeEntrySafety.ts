type EmployeeTimeEntryInput = {
  id: string;
  userId: string;
  projectId?: string | null;
  activityId: string;
  date: Date;
  startTime?: string | null;
  endTime?: string | null;
  hours: number;
  billable: boolean;
  note?: string | null;
  status: string;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  approverId?: string | null;
  rejectNote?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  user?: { id: string; name: string } | null;
  project?: { id: string; name: string; code: string; site?: string | null; customer?: { id: string; name: string } | null } | null;
  activity?: { id: string; name: string; code: string; category?: string | null } | null;
  approver?: { id: string; name: string } | null;
  attachments?: Array<{ id: string; timeEntryId: string; filename: string; originalName: string; mimeType: string; size: number; createdAt: Date }>;
  [key: string]: unknown;
};

/** Employee responses are a closed whitelist, never raw Prisma TimeEntry rows. */
export function toEmployeeTimeEntry(entry: EmployeeTimeEntryInput) {
  return {
    id: entry.id, userId: entry.userId, projectId: entry.projectId ?? null, activityId: entry.activityId,
    date: entry.date, startTime: entry.startTime ?? null, endTime: entry.endTime ?? null,
    hours: entry.hours, billable: entry.billable, note: entry.note ?? null, status: entry.status,
    submittedAt: entry.submittedAt ?? null, approvedAt: entry.approvedAt ?? null,
    approverId: entry.approverId ?? null, rejectNote: entry.rejectNote ?? null,
    ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
    ...(entry.user ? { user: { id: entry.user.id, name: entry.user.name } } : {}),
    ...(entry.project ? { project: {
      id: entry.project.id, name: entry.project.name, code: entry.project.code, site: entry.project.site ?? null,
      ...(entry.project.customer ? { customer: { id: entry.project.customer.id, name: entry.project.customer.name } } : {}),
    } } : {}),
    ...(entry.activity ? { activity: {
      id: entry.activity.id, name: entry.activity.name, code: entry.activity.code,
      ...(entry.activity.category ? { category: entry.activity.category } : {}),
    } } : {}),
    ...(entry.approver ? { approver: { id: entry.approver.id, name: entry.approver.name } } : {}),
    ...(entry.attachments ? { attachments: entry.attachments.map((attachment) => ({
      id: attachment.id, timeEntryId: attachment.timeEntryId, filename: attachment.filename,
      originalName: attachment.originalName, mimeType: attachment.mimeType, size: attachment.size, createdAt: attachment.createdAt,
    })) } : {}),
  };
}

export function getTimeEntryDeletionError(status: string) {
  return status === 'APPROVED' ? 'Veckan måste låsas upp innan raden tas bort' : null;
}
