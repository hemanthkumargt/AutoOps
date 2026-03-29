// ─── Types ────────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  title: string;
  transcript: string;
  created_at: string;
  tasks?: Task[];
}

export interface Task {
  id: string;
  meeting_id: string;
  title: string;
  owner: string;
  owner_email: string;
  deadline: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  agent: string;
  task_id: string | null;
  meeting_id: string | null;
  details: Record<string, unknown> | null;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type PaginatedMeetings = PaginatedResponse<Meeting>;
export type PaginatedTasks = PaginatedResponse<Task>;
export type PaginatedAuditLogs = PaginatedResponse<AuditLog>;

export interface MeetingWithTasks extends Meeting {
  tasks: Task[];
}

export interface ExtractTasksResult {
  success: boolean;
  tasks_created: number;
  tasks: Task[];
}

export interface TaskFilters {
  status?: string;
  owner?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export interface AuditFilters {
  agent?: string;
  action?: string;
  task_id?: string;
  meeting_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// ─── API Client ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

function buildQueryString(params: Record<string, unknown>): string {
  const filtered = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (filtered.length === 0) return '';
  return '?' + new URLSearchParams(filtered.map(([k, v]) => [k, String(v)])).toString();
}

// ─── Meeting API ──────────────────────────────────────────────────────────────

export async function getMeetings(page = 1): Promise<PaginatedMeetings> {
  return apiFetch<PaginatedMeetings>(`/meetings?page=${page}&limit=10`);
}

export async function getMeeting(id: string): Promise<{ success: boolean; data: MeetingWithTasks }> {
  return apiFetch(`/meetings/${id}`);
}

export async function createMeeting(title: string, transcript: string): Promise<{ success: boolean; meeting_id: string; meeting: Meeting }> {
  return apiFetch('/meetings', {
    method: 'POST',
    body: JSON.stringify({ title, transcript }),
  });
}

export async function extractTasks(meetingId: string): Promise<ExtractTasksResult> {
  return apiFetch(`/meetings/${meetingId}/extract-tasks`, { method: 'POST' });
}

// ─── Task API ──────────────────────────────────────────────────────────────────

export async function getTasks(filters?: TaskFilters): Promise<PaginatedTasks> {
  const qs = buildQueryString({ ...filters, limit: filters?.limit ?? 20 });
  return apiFetch<PaginatedTasks>(`/tasks${qs}`);
}

export async function updateTaskStatus(id: string, status: string): Promise<{ success: boolean; data: Task }> {
  return apiFetch(`/tasks/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function getOverdueTasks(): Promise<{ success: boolean; data: Task[]; total: number }> {
  return apiFetch('/tasks/overdue');
}

// ─── Audit API ─────────────────────────────────────────────────────────────────

export async function getAuditLogs(filters?: AuditFilters): Promise<PaginatedAuditLogs> {
  const qs = buildQueryString({ ...filters, limit: filters?.limit ?? 50 });
  return apiFetch<PaginatedAuditLogs>(`/audit${qs}`);
}

// ─── Health API ───────────────────────────────────────────────────────────────

export async function getHealth(): Promise<{
  status: string;
  database: string;
  scheduler: string;
  uptime: number;
  timestamp: string;
}> {
  const BASE = BASE_URL.replace('/api/v1', '');
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

// ─── Stats (derived) ──────────────────────────────────────────────────────────

export async function getStats(): Promise<{
  totalMeetings: number;
  totalTasks: number;
  overdueTasks: number;
}> {
  const [meetings, tasks, overdue] = await Promise.all([
    getMeetings(1),
    getTasks({ limit: 1 }),
    getOverdueTasks(),
  ]);

  return {
    totalMeetings: meetings.total,
    totalTasks: tasks.total,
    overdueTasks: overdue.total,
  };
}
