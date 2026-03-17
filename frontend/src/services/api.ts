import { useAuthStore } from '../stores/authStore';
import type {
  User,
  Customer,
  Project,
  Activity,
  TimeEntry,
  WeekLock,
  Settings,
  DashboardData,
  DashboardDrilldownData,
  DashboardMetric,
  WeekData,
  WorkItem,
  WorkLog,
  WorkLogStats,
  ProjectManagerSummary,
  TeamWeekSummary,
  PushSubscriptionInfo,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers: HeadersInit = {
    ...(options.body && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Ett fel uppstod' }));
    throw new Error(error.error || 'Ett fel uppstod');
  }

  // Hantera CSV-svar
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    return response.text() as Promise<T>;
  }

  return response.json();
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    fetchApi<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (data: { companyName: string; orgNumber?: string; name: string; email: string; password: string }) =>
    fetchApi<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  me: () => fetchApi<User>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    fetchApi<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// Users
export const usersApi = {
  list: () => fetchApi<User[]>('/users'),
  get: (id: string) => fetchApi<User>(`/users/${id}`),
  create: (data: Partial<User> & { password: string }) =>
    fetchApi<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<User>) =>
    fetchApi<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),
  gdprDelete: (id: string) =>
    fetchApi<{ message: string }>(`/users/${id}/gdpr`, { method: 'DELETE' }),
};

// Customers
export const customersApi = {
  list: (active?: boolean) =>
    fetchApi<Customer[]>(`/customers${active !== undefined ? `?active=${active}` : ''}`),
  get: (id: string) => fetchApi<Customer>(`/customers/${id}`),
  create: (data: Partial<Customer>) =>
    fetchApi<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Customer>) =>
    fetchApi<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ message: string }>(`/customers/${id}`, { method: 'DELETE' }),
};

// Projects
export const projectsApi = {
  list: (params?: { status?: string; customerId?: string; active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.customerId) searchParams.set('customerId', params.customerId);
    if (params?.active !== undefined) searchParams.set('active', String(params.active));
    const query = searchParams.toString();
    return fetchApi<Project[]>(`/projects${query ? `?${query}` : ''}`);
  },
  get: (id: string) => fetchApi<Project>(`/projects/${id}`),
  getManagerSummary: async (id: string) => {
    const raw = await fetchApi<any>(`/projects/${id}/manager-summary`);

    // Nyare shape: kan ha employeeBreakdown + totals
    if (raw?.employeeBreakdown) {
      return {
        totalHours: raw?.totalHours ?? raw?.totals?.totalHours ?? 0,
        billableHours: raw?.billableHours ?? raw?.totals?.totalBillableHours ?? 0,
        totalAmount: raw?.totalAmount ?? 0,
        employeeBreakdown: raw.employeeBreakdown,
      } as ProjectManagerSummary;
    }

    const employeeBreakdown = (raw?.employees || []).map((e: any) => ({
      userId: e.userId,
      userName: e.name,
      totalHours: e.hours || 0,
      billableHours: e.billableHours || 0,
      amount: 0,
      weekStartDate: e.weekStartDate,
      weekNumber: e.weekNumber,
      dayHours: e.dayHours,
    }));

    return {
      totalHours: raw?.totals?.totalHours || 0,
      billableHours: raw?.totals?.totalBillableHours || 0,
      totalAmount: 0,
      employeeBreakdown,
    } as ProjectManagerSummary;
  },
  create: (data: Partial<Project>) =>
    fetchApi<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Project>) =>
    fetchApi<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ message: string }>(`/projects/${id}`, { method: 'DELETE' }),
  permanentDelete: (id: string) => fetchApi<{ message: string }>(`/projects/${id}/permanent`, { method: 'DELETE' }),
};

// Activities
export const activitiesApi = {
  list: (active?: boolean) =>
    fetchApi<Activity[]>(`/activities${active !== undefined ? `?active=${active}` : ''}`),
  get: (id: string) => fetchApi<Activity>(`/activities/${id}`),
  create: (data: Partial<Activity>) =>
    fetchApi<Activity>('/activities', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Activity>) =>
    fetchApi<Activity>(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ message: string }>(`/activities/${id}`, { method: 'DELETE' }),
};

// Time Entries
export const timeEntriesApi = {
  list: (params?: { from?: string; to?: string; userId?: string; projectId?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.userId) searchParams.set('userId', params.userId);
    if (params?.projectId) searchParams.set('projectId', params.projectId);
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return fetchApi<TimeEntry[]>(`/time-entries${query ? `?${query}` : ''}`);
  },
  getWeek: (weekStart: string, userId?: string) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    const query = params.toString();
    return fetchApi<WeekData>(`/time-entries/week/${weekStart}${query ? `?${query}` : ''}`);
  },
  getTeamWeekSummary: (weekStart: string) =>
    fetchApi<TeamWeekSummary>(`/time-entries/week-summary/${weekStart}`),
  get: (id: string) => fetchApi<TimeEntry>(`/time-entries/${id}`),
  create: (data: Partial<TimeEntry>) =>
    fetchApi<TimeEntry>('/time-entries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TimeEntry>) =>
    fetchApi<TimeEntry>(`/time-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ message: string }>(`/time-entries/${id}`, { method: 'DELETE' }),
  sync: (entries: any[]) =>
    fetchApi<{ results: any[] }>('/time-entries/sync', {
      method: 'POST',
      body: JSON.stringify(entries),
    }),
};

// Week Locks
export const weekLocksApi = {
  list: (params?: { status?: string; userId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.userId) searchParams.set('userId', params.userId);
    const query = searchParams.toString();
    return fetchApi<WeekLock[]>(`/week-locks${query ? `?${query}` : ''}`);
  },
  pendingCount: () => fetchApi<{ count: number }>('/week-locks/pending-count'),
  submit: (weekStartDate: string) =>
    fetchApi<WeekLock>('/week-locks/submit', {
      method: 'POST',
      body: JSON.stringify({ weekStartDate }),
    }),
  approve: (id: string) =>
    fetchApi<WeekLock>(`/week-locks/${id}/approve`, { method: 'POST' }),
  reject: (id: string, comment: string) =>
    fetchApi<WeekLock>(`/week-locks/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  unlock: (id: string) => fetchApi<{ message: string }>(`/week-locks/${id}/unlock`, { method: 'POST' }),
};

// Reports
export const reportsApi = {
  salary: (from: string, to: string, userId?: string, format?: 'json' | 'csv') => {
    const params = new URLSearchParams({ from, to });
    if (userId) params.set('userId', userId);
    if (format) params.set('format', format);
    return fetchApi<any>(`/reports/salary?${params}`);
  },
  invoice: (from: string, to: string, customerId?: string, projectId?: string, format?: 'json' | 'csv') => {
    const params = new URLSearchParams({ from, to });
    if (customerId) params.set('customerId', customerId);
    if (projectId) params.set('projectId', projectId);
    if (format) params.set('format', format);
    return fetchApi<any>(`/reports/invoice?${params}`);
  },
  project: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return fetchApi<any>(`/reports/project/${id}${query ? `?${query}` : ''}`);
  },
};

// Settings
export const settingsApi = {
  get: () => fetchApi<Settings>('/settings'),
  update: (data: Partial<Settings>) =>
    fetchApi<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// Push Subscriptions
export const pushSubscriptionsApi = {
  getPublicKey: () => fetchApi<{ publicKey: string }>('/push-subscriptions/vapid-public-key'),
  list: () => fetchApi<PushSubscriptionInfo[]>('/push-subscriptions'),
  register: (subscription: PushSubscriptionJSON & { userAgent?: string }) =>
    fetchApi<{ id: string; endpoint: string; createdAt: string }>('/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscription),
    }),
  unregister: (endpoint: string) =>
    fetchApi<{ message: string }>('/push-subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
};

// Work Items
export const workItemsApi = {
  list: (active?: boolean) =>
    fetchApi<WorkItem[]>(`/work-items${active !== undefined ? `?active=${active}` : ''}`),
  create: (data: Partial<WorkItem>) =>
    fetchApi<WorkItem>('/work-items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<WorkItem>) =>
    fetchApi<WorkItem>(`/work-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/work-items/${id}`, { method: 'DELETE' }),
  importExcel: async (file: File) => {
    const token = useAuthStore.getState().token;
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/work-items/import-excel`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Ett fel uppstod' }));
      throw new Error(error.error || 'Ett fel uppstod vid import');
    }

    return response.json() as Promise<{ created: number; updated: number; deactivated: number; totalRows: number }>;
  },
};

// Work Logs
export const workLogsApi = {
  list: (params?: { workItemId?: string; projectId?: string; from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.workItemId) searchParams.set('workItemId', params.workItemId);
    if (params?.projectId) searchParams.set('projectId', params.projectId);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return fetchApi<WorkLog[]>(`/work-logs${query ? `?${query}` : ''}`);
  },
  create: (data: { workItemId: string; projectId?: string; date: string; quantity: number; minutes: number; note?: string }) =>
    fetchApi<WorkLog>('/work-logs', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/work-logs/${id}`, { method: 'DELETE' }),
  getStats: (params?: { from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return fetchApi<WorkLogStats[]>(`/work-logs/stats${query ? `?${query}` : ''}`);
  },
};

// Dashboard
export const dashboardApi = {
  get: () => fetchApi<DashboardData>('/dashboard'),
  getDrilldown: (metric: DashboardMetric, date?: string) => {
    const params = new URLSearchParams({ metric });
    if (date) params.set('date', date);
    return fetchApi<DashboardDrilldownData>(`/dashboard/drilldown?${params.toString()}`);
  },
  quickStats: () => fetchApi<{ todayHours: number; weekHours: number }>('/dashboard/quick-stats'),
};
