export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
  hourlyCost?: number;
  active: boolean;
  createdAt: string;
  companyId?: string;
  companyName?: string;
}

export interface Customer {
  id: string;
  name: string;
  orgNumber?: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  defaultRate?: number;
  active: boolean;
  projects?: Project[];
  _count?: { projects: number };
}

export interface Project {
  id: string;
  customerId?: string;
  customer?: { id: string; name: string };
  name: string;
  code: string;
  site?: string;
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'INVOICED';
  budgetHours?: number;
  billingModel: 'HOURLY' | 'FIXED';
  defaultRate?: number;
  employeeCanSeeResults?: boolean;
  active: boolean;
  totalHours?: number;
  billableHours?: number;
}

export interface ProjectEmployeeSummary {
  userId: string;
  userName: string;
  totalHours: number;
  billableHours?: number;
  billableRate?: number;
  amount?: number;
  weekStartDate?: string;
  weekNumber?: number;
  dayHours?: Record<string, number>;
}

export interface ProjectManagerSummary {
  totalHours: number;
  billableHours?: number;
  totalAmount?: number;
  employeeBreakdown: ProjectEmployeeSummary[];
}

export interface Activity {
  id: string;
  name: string;
  code: string;
  category: 'WORK' | 'TRAVEL' | 'MEETING' | 'INTERNAL' | 'CHANGE_ORDER' | 'ABSENCE';
  billableDefault: boolean;
  rateOverride?: number;
  sortOrder: number;
  active: boolean;
}

export interface TimeEntry {
  id: string;
  userId: string;
  user?: { id: string; name: string };
  projectId?: string;
  project?: { id: string; name: string; code: string; site?: string; customer?: { id: string; name: string } };
  activityId: string;
  activity?: { id: string; name: string; code: string };
  date: string;
  startTime?: string;
  endTime?: string;
  hours: number;
  billable: boolean;
  note?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  submittedAt?: string;
  approvedAt?: string;
  approverId?: string;
  approver?: { id: string; name: string };
  rejectNote?: string;
  gpsLat?: number;
  gpsLng?: number;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  timeEntryId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: string;
}

export interface WeekLock {
  id: string;
  userId: string;
  user?: { id: string; name: string; email: string };
  weekStartDate: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  comment?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewerId?: string;
  totalHours?: number;
  billableHours?: number;
  entryCount?: number;
}

export interface Settings {
  id: string;
  companyName: string;
  vatRate: number;
  weekStartDay: number;
  csvDelimiter: string;
  defaultCurrency: string;
  reminderTime: string;
  reminderEnabled: boolean;
}

export interface PushSubscriptionInfo {
  id: string;
  endpoint: string;
  contentEncoding?: string | null;
  createdAt: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  failureReason?: string | null;
}

export interface DashboardData {
  summary: {
    monthlyHours: number;
    monthlyBillableHours: number;
    weeklyHours: number;
    pendingApprovalCount: number;
  };
  pendingApprovals: WeekLock[];
  myPendingWeeks: string[];
  recentEntries: TimeEntry[];
  dailyHours: Record<string, number>;
  period: {
    monthStart: string;
    monthEnd: string;
    weekStart: string;
    weekEnd: string;
  };
}

export type DashboardMetric =
  | 'weekly-hours'
  | 'monthly-hours'
  | 'billable-hours'
  | 'pending-approval';

export interface DashboardTimeEntryDrilldown {
  kind: 'time-entries';
  metric: DashboardMetric;
  title: string;
  description: string;
  totalHours: number;
  period: {
    start: string;
    end: string;
  };
  entries: TimeEntry[];
}

export interface DashboardPendingApprovalDrilldown {
  kind: 'pending-approvals';
  metric: DashboardMetric;
  title: string;
  description: string;
  totalCount: number;
  period: {
    start: string;
    end: string;
  };
  approvals: WeekLock[];
}

export type DashboardDrilldownData =
  | DashboardTimeEntryDrilldown
  | DashboardPendingApprovalDrilldown;

export interface WorkItem {
  id: string;
  name: string;
  unit: string;
  unitPrice?: number;
  grossPrice?: number;
  description?: string;
  active: boolean;
}

export interface WorkLog {
  id: string;
  userId: string;
  user?: { id: string; name: string };
  workItemId: string;
  workItem?: WorkItem;
  projectId?: string;
  project?: { id: string; name: string };
  date: string;
  quantity: number;
  minutes: number;
  note?: string;
}

export interface WorkLogStats {
  workItemId: string;
  name: string;
  unit: string;
  totalQuantity: number;
  totalMinutes: number;
  avgMinPerUnit: number;
  entryCount: number;
}

export interface WeekData {
  entries: TimeEntry[];
  weekLock?: WeekLock;
  summary: {
    totalHours: number;
    billableHours: number;
    dailyTotals: Record<string, number>;
  };
}

export interface TeamWeekSummaryProject {
  projectId: string | null;
  projectName: string;
  projectCode: string;
  hours: number;
  billableHours: number;
}

export interface TeamWeekSummaryUser {
  userId: string;
  userName: string;
  role: string;
  totalHours: number;
  billableHours: number;
  entryCount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  projects: TeamWeekSummaryProject[];
}

export interface TeamWeekSummary {
  weekStart: string;
  weekEnd: string;
  totals: {
    totalHours: number;
    billableHours: number;
  };
  users: TeamWeekSummaryUser[];
}
