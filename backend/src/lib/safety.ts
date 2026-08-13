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

type ProjectTimeEntryInput = {
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
  user: { id: string; name: string };
  activity: { id: string; name: string; code: string };
};

type ProjectHoursEntryInput = {
  id: string;
  userId: string;
  date: Date;
  hours: number;
  status: string;
  user: { id: string; name: string };
  activity: { id: string; name: string; code: string };
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

export function canViewProjectHours(role: string, employeeCanSeeResults: boolean) {
  return ['ADMIN', 'SUPERVISOR'].includes(role)
    || (role === 'EMPLOYEE' && employeeCanSeeResults);
}

export function canViewProjectFinancials(role: string) {
  return ['ADMIN', 'SUPERVISOR'].includes(role);
}

type ApprovedHoursPrisma = {
  timeEntry: {
    aggregate: (args: { where: { projectId: string; status: 'APPROVED' }; _sum: { hours: true } }) => Promise<{
      _sum: { hours: number | null };
    }>;
  };
};

export async function getApprovedProjectHours(prisma: ApprovedHoursPrisma, projectId: string) {
  const result = await prisma.timeEntry.aggregate({
    where: { projectId, status: 'APPROVED' },
    _sum: { hours: true },
  });
  return result._sum.hours ?? 0;
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

// This list can be viewed by employees when a supervisor enables project
// results. Keep colleagues' location, financial, invoice and sync data out.
export function toPublicProjectTimeEntry(entry: ProjectTimeEntryInput) {
  return {
    id: entry.id,
    userId: entry.userId,
    projectId: entry.projectId ?? null,
    activityId: entry.activityId,
    date: entry.date,
    startTime: entry.startTime ?? null,
    endTime: entry.endTime ?? null,
    hours: entry.hours,
    billable: entry.billable,
    note: entry.note ?? null,
    status: entry.status,
    submittedAt: entry.submittedAt ?? null,
    approvedAt: entry.approvedAt ?? null,
    user: { id: entry.user.id, name: entry.user.name },
    activity: { id: entry.activity.id, name: entry.activity.name, code: entry.activity.code },
  };
}

// `employeeCanSeeResults` is labelled "Visa projekttimmar fÃ¶r anstÃ¤llda".
// Its contract is deliberately narrower than the manager project time list.
export function toPublicProjectHoursEntry(entry: ProjectHoursEntryInput) {
  return {
    id: entry.id,
    userId: entry.userId,
    date: entry.date,
    hours: entry.hours,
    status: entry.status,
    user: { id: entry.user.id, name: entry.user.name },
    activity: { id: entry.activity.id, name: entry.activity.name, code: entry.activity.code },
  };
}

type ProjectMaterialInput = {
  purchasePrice?: number | null;
  unitPrice?: number | null;
  quantity: number;
  invoiceStatus?: string | null;
  invoicedAt?: Date | null;
  invoiceReference?: string | null;
  integrationOperationId?: string | null;
  integrationRowIndex?: number | null;
  [key: string]: unknown;
};

export function toPublicProjectMaterial(item: ProjectMaterialInput, canViewFinancials: boolean, canViewInvoiceStatus = false) {
  const {
    integrationOperationId: _integrationOperationId,
    integrationRowIndex: _integrationRowIndex,
    invoiceStatus: _invoiceStatus,
    invoicedAt: _invoicedAt,
    invoiceReference: _invoiceReference,
    ...publicMaterial
  } = item;
  const lineTotal = item.purchasePrice != null ? item.quantity * item.purchasePrice : null;

  return {
    ...publicMaterial,
    purchasePrice: canViewFinancials ? item.purchasePrice : null,
    unitPrice: null,
    lineTotal: canViewFinancials ? lineTotal : null,
    ...(canViewInvoiceStatus
      ? {
          invoiceStatus: _invoiceStatus,
          invoicedAt: _invoicedAt,
          invoiceReference: _invoiceReference,
        }
      : {}),
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
