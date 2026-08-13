type ProjectSummaryEntryInput = {
  id: string;
  userId: string;
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
  user?: { id: string; name: string } | null;
  project?: { id: string; name: string; code: string; site?: string | null } | null;
  activity?: { id: string; name: string; code: string; category?: string | null } | null;
};

export const permanentDeletionDisabledMessage =
  'Permanent radering är avstängd för att skydda tid, attest och ekonomiskt underlag. Inaktivera eller arkivera i stället.';

export const materialMutationErrors = {
  inactiveProject: {
    code: 'PROJECT_INACTIVE',
    message: 'Projektet är inaktivt. Historiken kan läsas, men material får inte ändras.',
  },
  invoiced: {
    code: 'MATERIAL_INVOICED',
    message: 'Materialraden är fakturerad och kan inte ändras eller tas bort.',
  },
  invoiceReferenceRequired: {
    code: 'INVOICE_REFERENCE_REQUIRED',
    message: 'Ange fakturareferens när materialraden faktureras.',
  },
} as const;

export function canApproveWeek(reviewerId: string, weekOwnerId: string) {
  return reviewerId !== weekOwnerId;
}

export function getMaterialMutationError(projectActive: boolean, invoiceStatus?: string | null) {
  if (!projectActive) return materialMutationErrors.inactiveProject;
  if (invoiceStatus === 'INVOICED') return materialMutationErrors.invoiced;
  return null;
}

export function isAccountant(role: string) {
  return role === 'ACCOUNTANT';
}

/**
 * Project summaries must never pass Prisma relations through directly. This
 * whitelist keeps financial rates, GPS data, invoice fields and attachments
 * out of the response for every role.
 */
export function toPublicProjectSummaryEntry(entry: ProjectSummaryEntryInput) {
  return {
    id: entry.id,
    userId: entry.userId,
    date: entry.date,
    startTime: entry.startTime ?? null,
    endTime: entry.endTime ?? null,
    hours: entry.hours,
    billable: entry.billable,
    note: entry.note ?? null,
    status: entry.status,
    submittedAt: entry.submittedAt ?? null,
    approvedAt: entry.approvedAt ?? null,
    approverId: entry.approverId ?? null,
    rejectNote: entry.rejectNote ?? null,
    user: entry.user ? { id: entry.user.id, name: entry.user.name } : null,
    project: entry.project
      ? { id: entry.project.id, name: entry.project.name, code: entry.project.code, site: entry.project.site ?? null }
      : null,
    activity: entry.activity
      ? {
          id: entry.activity.id,
          name: entry.activity.name,
          code: entry.activity.code,
          ...(entry.activity.category ? { category: entry.activity.category } : {}),
        }
      : null,
  };
}

export function withoutActivityRate<T extends { rateOverride?: number | null }>(activity: T) {
  const { rateOverride: _rateOverride, ...publicActivity } = activity;
  return publicActivity;
}

export function withoutHourlyCost<T extends { hourlyCost?: number | null }>(user: T) {
  const { hourlyCost: _hourlyCost, ...publicUser } = user;
  return publicUser;
}
