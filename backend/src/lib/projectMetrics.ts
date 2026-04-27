import { PrismaClient } from '@prisma/client';

export type ProjectComputedStatus =
  | 'PLANNED'
  | 'ONGOING'
  | 'MISSING_BUDGET'
  | 'RISK'
  | 'READY_TO_INVOICE'
  | 'COMPLETED'
  | 'INACTIVE';

export type ProjectStatusInfo = {
  code: ProjectComputedStatus;
  label: string;
  tone: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
  priority: number;
};

export type ProjectMetrics = {
  totalHours: number;
  weekHours: number;
  billableHours: number;
  billableValue: number;
  laborCost: number;
  materialCost: number;
  materialSalesValue: number;
  projectResult: number | null;
  marginPercent: number | null;
  budgetUsagePercent: number | null;
  uninvoicedValue: number;
  lastActivityAt: Date | null;
  status: ProjectStatusInfo;
  warnings: string[];
};

const STATUS: Record<ProjectComputedStatus, ProjectStatusInfo> = {
  PLANNED: { code: 'PLANNED', label: 'Planerad', tone: 'blue', priority: 10 },
  ONGOING: { code: 'ONGOING', label: 'Pågående', tone: 'green', priority: 20 },
  MISSING_BUDGET: { code: 'MISSING_BUDGET', label: 'Saknar budget', tone: 'yellow', priority: 40 },
  RISK: { code: 'RISK', label: 'Risk', tone: 'red', priority: 60 },
  READY_TO_INVOICE: { code: 'READY_TO_INVOICE', label: 'Klar för fakturering', tone: 'yellow', priority: 50 },
  COMPLETED: { code: 'COMPLETED', label: 'Avslutad', tone: 'gray', priority: 5 },
  INACTIVE: { code: 'INACTIVE', label: 'Inaktiv', tone: 'gray', priority: 0 },
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getRate(entry: any): number {
  return entry.activity?.rateOverride ?? entry.project?.defaultRate ?? entry.project?.customer?.defaultRate ?? 0;
}

export async function getProjectMetrics(
  prisma: PrismaClient,
  project: any,
  referenceDate = new Date()
): Promise<ProjectMetrics> {
  const weekStart = getWeekStart(referenceDate);
  const weekEnd = getWeekEnd(weekStart);
  const nowMinus30Days = new Date(referenceDate);
  nowMinus30Days.setDate(nowMinus30Days.getDate() - 30);

  const [entries, materials] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId: project.id },
      include: {
        user: { select: { hourlyCost: true } },
        project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
        activity: { select: { rateOverride: true } },
      },
    }),
    prisma.projectMaterial.findMany({
      where: { projectId: project.id },
    }),
  ]);

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const weekHours = entries
    .filter((entry) => entry.date >= weekStart && entry.date <= weekEnd)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const billableEntries = entries.filter((entry) => entry.billable);
  const billableHours = billableEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const billableValue = billableEntries.reduce((sum, entry) => sum + entry.hours * getRate(entry), 0);
  const laborCost = entries.reduce((sum, entry) => sum + entry.hours * (entry.user?.hourlyCost || 0), 0);
  const materialCost = materials.reduce(
    (sum, item) => sum + item.quantity * (item.purchasePrice ?? item.unitPrice ?? 0),
    0
  );
  const materialSalesValue = materials.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
  const fixedPrice = project.fixedPrice ?? null;
  const revenueBase = fixedPrice ?? billableValue + materialSalesValue;
  const projectResult = revenueBase > 0 ? revenueBase - laborCost - materialCost : null;
  const marginPercent = projectResult != null && revenueBase > 0 ? (projectResult / revenueBase) * 100 : null;
  const budgetUsagePercent = project.budgetHours ? (totalHours / project.budgetHours) * 100 : null;
  const uninvoicedTimeValue = billableEntries
    .filter((entry) => entry.invoiceStatus !== 'INVOICED')
    .reduce((sum, entry) => sum + entry.hours * getRate(entry), 0);
  const uninvoicedMaterialValue = materials
    .filter((item) => item.invoiceStatus !== 'INVOICED')
    .reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
  const lastActivityAt = entries.reduce<Date | null>((latest, entry) => {
    const candidate = entry.createdAt > entry.date ? entry.createdAt : entry.date;
    return !latest || candidate > latest ? candidate : latest;
  }, null);
  const warnings: string[] = [];

  if (totalHours > 0 && !project.budgetHours) warnings.push('Saknar budget');
  if (budgetUsagePercent != null && budgetUsagePercent >= 100) warnings.push('Över budget');
  else if (budgetUsagePercent != null && budgetUsagePercent >= 80) warnings.push('Nära budget');
  if (billableHours > 0 && billableValue === 0) warnings.push('Saknar timpris');

  return {
    totalHours,
    weekHours,
    billableHours,
    billableValue,
    laborCost,
    materialCost,
    materialSalesValue,
    projectResult,
    marginPercent,
    budgetUsagePercent,
    uninvoicedValue: uninvoicedTimeValue + uninvoicedMaterialValue,
    lastActivityAt,
    status: getProjectStatus({
      active: project.active,
      manualStatus: project.status,
      totalHours,
      budgetHours: project.budgetHours,
      budgetUsagePercent,
      lastActivityAt,
      uninvoicedValue: uninvoicedTimeValue + uninvoicedMaterialValue,
      referenceDate,
      nowMinus30Days,
    }),
    warnings,
  };
}

export function getProjectStatus(input: {
  active: boolean;
  manualStatus: string;
  totalHours: number;
  budgetHours?: number | null;
  budgetUsagePercent: number | null;
  lastActivityAt: Date | null;
  uninvoicedValue: number;
  referenceDate?: Date;
  nowMinus30Days?: Date;
}): ProjectStatusInfo {
  if (!input.active) return STATUS.INACTIVE;
  if (['COMPLETED', 'INVOICED'].includes(input.manualStatus)) return STATUS.COMPLETED;
  if (input.totalHours === 0) return STATUS.PLANNED;
  if (!input.budgetHours) return STATUS.MISSING_BUDGET;
  if (input.budgetUsagePercent != null && input.budgetUsagePercent >= 80) return STATUS.RISK;
  if (input.uninvoicedValue > 0) return STATUS.READY_TO_INVOICE;
  if (input.lastActivityAt && input.nowMinus30Days && input.lastActivityAt >= input.nowMinus30Days) {
    return STATUS.ONGOING;
  }
  return STATUS.ONGOING;
}

export async function getCompanyProjectMetrics(prisma: PrismaClient, companyId: string) {
  const projects = await prisma.project.findMany({
    where: { companyId },
    include: { customer: { select: { id: true, name: true, defaultRate: true } } },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });

  return Promise.all(
    projects.map(async (project) => ({
      ...project,
      metrics: await getProjectMetrics(prisma, project),
    }))
  );
}
