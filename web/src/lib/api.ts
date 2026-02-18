const getBaseUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const AUTH_ROUTES_WITHOUT_REFRESH = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);

export type Permission =
  | 'analytics.read'
  | 'customers.read'
  | 'customers.write'
  | 'admin.users.read'
  | 'admin.users.write'
  | 'admin.audit.read'
  | 'alerts.manage'
  | 'reports.manage';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiFetchOptions = RequestInit & {
  skipAuthRefresh?: boolean;
  _retriedAfterRefresh?: boolean;
};

function buildUrl(path: string): string {
  return `${getBaseUrl().replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function normalizePath(path: string): string {
  return `/${path.replace(/^\//, '').split('?')[0]}`;
}

function toApiError(res: Response, data: unknown): ApiError {
  const message =
    typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : res.statusText || 'Request failed';
  return new ApiError(message, res.status);
}

async function requestJson(path: string, options: ApiFetchOptions): Promise<{ res: Response; data: unknown }> {
  const { skipAuthRefresh: _skipAuthRefresh, _retriedAfterRefresh: _retriedAfterRefresh, ...fetchOptions } = options;
  const res = await fetch(buildUrl(path), {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function shouldTryRefresh(path: string, options: ApiFetchOptions): boolean {
  if (options.skipAuthRefresh || options._retriedAfterRefresh) return false;
  return !AUTH_ROUTES_WITHOUT_REFRESH.has(normalizePath(path));
}

async function downloadAuthenticatedFile(path: string, fileName: string): Promise<void> {
  const res = await fetch(buildUrl(path), { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw toApiError(res, data);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(href);
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const first = await requestJson(path, options);
  if (first.res.ok) return first.data as T;

  if (first.res.status === 401 && shouldTryRefresh(path, options)) {
    const refresh = await requestJson('/auth/refresh', { method: 'POST', skipAuthRefresh: true });
    if (refresh.res.ok) {
      const retried = await requestJson(path, {
        ...options,
        _retriedAfterRefresh: true,
        skipAuthRefresh: true,
      });
      if (!retried.res.ok) throw toApiError(retried.res, retried.data);
      return retried.data as T;
    }
  }

  throw toApiError(first.res, first.data);
}

export type User = { id: string; email: string; name?: string; role: 'admin' | 'viewer'; permissions: Permission[] };

export const authApi = {
  me: () => apiFetch<{ user: User }>('/auth/me'),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { email: string; password: string; name?: string }) =>
    apiFetch<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  refresh: () => apiFetch<{ user: User }>('/auth/refresh', { method: 'POST' }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiFetch<{ ok: boolean }>('/auth/password', { method: 'PATCH', body: JSON.stringify(body) }),
  updateProfile: (body: { name?: string }) =>
    apiFetch<{ user: User }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
};

export type KpiResponse = {
  totalCustomers: number;
  activeCustomers: number;
  newInPeriod: number;
  churnedInPeriod: number;
  from: string;
  to: string;
};

export type SeriesPoint = { date: string; count: number };

export type SeriesResponse = {
  series: SeriesPoint[];
  from: string;
  to: string;
};

export type CohortRetentionRow = {
  cohort: string;
  size: number;
  retention: Array<{ month: string; monthOffset: number; retained: number; retentionRate: number }>;
};

export type CohortRetentionResponse = {
  from: string;
  to: string;
  horizonMonths: number;
  series: CohortRetentionRow[];
};

export type AlertRule = {
  _id: string;
  name: string;
  type: 'churn_spike' | 'activity_drop';
  thresholdPct: number;
  windowDays: number;
  enabled: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
};

export type AlertEvent = {
  _id: string;
  ruleId: string;
  type: 'churn_spike' | 'activity_drop';
  message: string;
  metrics?: Record<string, unknown>;
  createdAt: string;
};

export const analyticsApi = {
  kpis: (params: { from?: string; to?: string }) => apiFetch<KpiResponse>(`/analytics/kpis${buildQuery(params)}`),
  newCustomers: (params: { from?: string; to?: string; groupBy?: string }) =>
    apiFetch<SeriesResponse>(`/analytics/new-customers${buildQuery(params)}`),
  activityTrend: (params: { from?: string; to?: string; groupBy?: string }) =>
    apiFetch<SeriesResponse>(`/analytics/activity-trend${buildQuery(params)}`),
  churn: (params: { from?: string; to?: string; groupBy?: string }) =>
    apiFetch<SeriesResponse>(`/analytics/churn${buildQuery(params)}`),
  cohortRetention: (params: { from?: string; to?: string; horizonMonths?: number }) =>
    apiFetch<CohortRetentionResponse>(`/analytics/cohort-retention${buildQuery(params)}`),
  alerts: {
    rules: () => apiFetch<{ items: AlertRule[] }>('/analytics/alerts/rules'),
    createRule: (body: {
      name: string;
      type: 'churn_spike' | 'activity_drop';
      thresholdPct: number;
      windowDays: number;
      enabled?: boolean;
    }) => apiFetch<{ rule: AlertRule }>('/analytics/alerts/rules', { method: 'POST', body: JSON.stringify(body) }),
    updateRule: (
      id: string,
      body: Partial<{ name: string; type: 'churn_spike' | 'activity_drop'; thresholdPct: number; windowDays: number; enabled: boolean }>
    ) => apiFetch<{ rule: AlertRule }>(`/analytics/alerts/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteRule: (id: string) => apiFetch<{ ok: boolean }>(`/analytics/alerts/rules/${id}`, { method: 'DELETE' }),
    events: (limit = 50) => apiFetch<{ items: AlertEvent[] }>(`/analytics/alerts/events${buildQuery({ limit })}`),
    evaluate: () => apiFetch<{ ok: boolean; rulesChecked: number; triggered: Array<{ ruleId: string; type: string; message: string }> }>(
      '/analytics/alerts/evaluate',
      { method: 'POST' }
    ),
  },
};

export type Customer = {
  _id: string;
  name: string;
  email: string;
  status: 'active' | 'churned';
  segment?: string;
  createdAt: string;
};

export type CustomersResponse = {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
};

export type CustomerSavedView = {
  _id: string;
  userId: string;
  name: string;
  type: 'customers';
  config: {
    q?: string;
    status?: 'active' | 'churned';
    sortBy?: 'name' | 'createdAt';
    order?: 'asc' | 'desc';
    segmentId?: string;
  };
  createdAt: string;
};

export type CustomerSegment = {
  _id: string;
  userId: string;
  name: string;
  rules: {
    status?: 'active' | 'churned';
    segmentEquals?: string;
    createdAfter?: string;
    createdBefore?: string;
    inactivityDaysGte?: number;
  };
  createdAt: string;
};

export const customersApi = {
  list: (params: {
    page?: number;
    limit?: number;
    q?: string;
    status?: 'active' | 'churned';
    sortBy?: 'name' | 'createdAt';
    order?: 'asc' | 'desc';
    segmentId?: string;
  }) => apiFetch<CustomersResponse>(`/customers${buildQuery(params)}`),
  get: (id: string) => apiFetch<{ customer: Customer; healthScore: number; lastEventAt: string | null }>(`/customers/${id}`),
  update: (id: string, body: { name?: string; email?: string; status?: 'active' | 'churned'; segment?: string }) =>
    apiFetch<{ customer: Customer }>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/customers/${id}`, { method: 'DELETE' }),
  bulk: (
    body:
      | { action: 'updateStatus'; ids: string[]; status: 'active' | 'churned' }
      | { action: 'updateSegment'; ids: string[]; segment?: string }
      | { action: 'delete'; ids: string[] }
  ) => apiFetch<{ ok: boolean; affected: number }>('/customers/bulk', { method: 'POST', body: JSON.stringify(body) }),
  activity: (id: string, limit = 50) =>
    apiFetch<{ items: Array<{ _id: string; type: string; timestamp: string }> }>(
      `/customers/${id}/activity${buildQuery({ limit })}`
    ),
  notes: (id: string) =>
    apiFetch<{ items: Array<{ _id: string; customerId: string; content: string; createdAt: string; updatedAt: string }> }>(
      `/customers/${id}/notes`
    ),
  createNote: (id: string, content: string) =>
    apiFetch<{ note: { _id: string; customerId: string; content: string; createdAt: string; updatedAt: string } }>(
      `/customers/${id}/notes`,
      { method: 'POST', body: JSON.stringify({ content }) }
    ),
  deleteNote: (id: string, noteId: string) => apiFetch<void>(`/customers/${id}/notes/${noteId}`, { method: 'DELETE' }),
  views: {
    list: () => apiFetch<{ items: CustomerSavedView[] }>('/customers/views'),
    create: (body: { name: string; config: CustomerSavedView['config'] }) =>
      apiFetch<{ view: CustomerSavedView }>('/customers/views', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/customers/views/${id}`, { method: 'DELETE' }),
  },
  segments: {
    list: () => apiFetch<{ items: CustomerSegment[] }>('/customers/segments'),
    create: (body: {
      name: string;
      rules: {
        status?: 'active' | 'churned';
        segmentEquals?: string;
        createdAfter?: string;
        createdBefore?: string;
        inactivityDaysGte?: number;
      };
    }) => apiFetch<{ segment: CustomerSegment }>('/customers/segments', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/customers/segments/${id}`, { method: 'DELETE' }),
    preview: (id: string) => apiFetch<{ count: number }>(`/customers/segments/${id}/preview`),
  },
  exportCsv: (params: {
    q?: string;
    status?: 'active' | 'churned';
    sortBy?: 'name' | 'createdAt';
    order?: 'asc' | 'desc';
    limit?: number;
    segmentId?: string;
  }) => downloadAuthenticatedFile(`/customers/export${buildQuery(params)}`, 'customers.csv'),
};

export type AdminUser = {
  _id: string;
  email: string;
  name?: string;
  role: 'admin' | 'viewer';
  permissions: Permission[];
  createdAt: string;
};

export type AuditEntry = {
  _id: string;
  userId?: string;
  action: string;
  meta?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: string;
};

export type ScheduledReport = {
  _id: string;
  name: string;
  frequency: 'weekly' | 'monthly';
  emails: string[];
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt: string;
  createdAt: string;
};

export const adminApi = {
  users: {
    list: () => apiFetch<{ items: AdminUser[] }>('/admin/users'),
    create: (body: { email: string; password: string; name?: string; role?: 'admin' | 'viewer'; permissions?: Permission[] }) =>
      apiFetch<{ user: AdminUser }>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    updateRole: (userId: string, role: 'admin' | 'viewer') =>
      apiFetch<{ user: AdminUser }>(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    updatePermissions: (userId: string, permissions: Permission[]) =>
      apiFetch<{ user: AdminUser }>(`/admin/users/${userId}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) }),
    resetPassword: (userId: string, newPassword: string) =>
      apiFetch<{ ok: boolean }>(`/admin/users/${userId}/password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) }),
    delete: (userId: string) => apiFetch<{ ok: boolean }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  },
  audit: {
    list: (params?: { limit?: number; userId?: string; action?: string; q?: string; from?: string; to?: string }) =>
      apiFetch<{ items: AuditEntry[] }>(`/admin/audit${buildQuery(params ?? {})}`),
    exportCsv: (params?: { limit?: number; userId?: string; action?: string; q?: string; from?: string; to?: string }) =>
      downloadAuthenticatedFile(`/admin/audit/export${buildQuery(params ?? {})}`, 'audit-log.csv'),
  },
  reports: {
    list: () => apiFetch<{ items: ScheduledReport[] }>('/admin/reports/schedules'),
    create: (body: { name: string; frequency: 'weekly' | 'monthly'; emails: string[]; enabled?: boolean }) =>
      apiFetch<{ schedule: ScheduledReport }>('/admin/reports/schedules', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: string,
      body: Partial<{ name: string; frequency: 'weekly' | 'monthly'; emails: string[]; enabled: boolean }>
    ) => apiFetch<{ schedule: ScheduledReport }>(`/admin/reports/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/admin/reports/schedules/${id}`, { method: 'DELETE' }),
    runDue: () => apiFetch<{ ok: boolean; ran: number; items: Array<Record<string, unknown>> }>('/admin/reports/run-due', { method: 'POST' }),
  },
};

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.set(key, String(value));
  }
  return `?${search.toString()}`;
}
