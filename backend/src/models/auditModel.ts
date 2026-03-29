// ─── Audit Log Interfaces ─────────────────────────────────────────────────────

export interface AuditEntry {
  action: string;
  agent: string;
  task_id?: string;
  meeting_id?: string;
  details?: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  action: string;
  agent: string;
  task_id: string | null;
  meeting_id: string | null;
  details: Record<string, unknown> | null;
  timestamp: Date;
}

export interface AuditFilters {
  agent?: string;
  action?: string;
  task_id?: string;
  meeting_id?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export interface AgentSummary {
  agent: string;
  action: string;
  count: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
