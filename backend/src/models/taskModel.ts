// ─── Task Status & Priority ────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

// ─── Task Interfaces ──────────────────────────────────────────────────────────

export interface Task {
  id: string;
  meeting_id: string;
  title: string;
  owner: string;
  owner_email: string;
  deadline: Date;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskDTO {
  meeting_id: string;
  title: string;
  owner: string;
  owner_email: string;
  deadline: string;
  priority: TaskPriority;
}

export interface UpdateTaskStatusDTO {
  status: TaskStatus;
}

export interface TaskFilters {
  status?: TaskStatus;
  owner?: string;
  priority?: TaskPriority;
  page?: number;
  limit?: number;
}

export interface PaginatedTasks {
  data: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
