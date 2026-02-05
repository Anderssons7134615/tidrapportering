export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
  hourlyCost?: number;
  active: boolean;
  createdAt: string;
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
  active: boolean;
  totalHours?: number;
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
  project?: { id: string; name: string; code: string; customer?: { id: string; name: string } };
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

export interface DashboardData {
  summary: {
    monthlyHours: number;
    monthlyBillableHours: number;
    weeklyHours: number;
    pendingApprovalCount: number;
  };
  projects: {
    id: string;
    name: string;
    code: string;
    customerName: string;
    budgetHours?: number;
    totalHours: number;
    monthlyHours: number;
    budgetUsedPercent?: number;
  }[];
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

export interface WeekData {
  entries: TimeEntry[];
  weekLock?: WeekLock;
  summary: {
    totalHours: number;
    billableHours: number;
    dailyTotals: Record<string, number>;
  };
}
