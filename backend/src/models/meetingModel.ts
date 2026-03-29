// ─── Meeting Interfaces ────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  title: string;
  transcript: string;
  created_at: Date;
}

export interface CreateMeetingDTO {
  title: string;
  transcript: string;
}

export interface MeetingWithTasks extends Meeting {
  tasks: import('./taskModel').Task[];
}

export interface PaginatedMeetings {
  data: Meeting[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
