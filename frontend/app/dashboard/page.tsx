'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  getMeetings, createMeeting, extractTasks,
  getTasks, updateTaskStatus, getAuditLogs,
  type Meeting, type Task, type AuditLog,
  type PaginatedMeetings, type PaginatedTasks, type PaginatedAuditLogs,
} from '@/lib/api';

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatRelative(d: string | Date) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const priorityClass: Record<string, string> = {
  critical: 'badge-priority-critical',
  high: 'badge-priority-high',
  medium: 'badge-priority-medium',
  low: 'badge-priority-low',
};

const statusClass: Record<string, string> = {
  pending: 'badge-status-pending',
  in_progress: 'badge-status-in_progress',
  completed: 'badge-status-completed',
  overdue: 'badge-status-overdue',
};

const agentColors: Record<string, string> = {
  MeetingIngestionAgent: 'bg-blue-500/20 text-blue-400',
  TaskExtractorAgent: 'bg-purple-500/20 text-purple-400',
  ReminderAgent: 'bg-yellow-500/20 text-yellow-400',
  EscalationAgent: 'bg-red-500/20 text-red-400',
  SchedulerAgent: 'bg-cyan-500/20 text-cyan-400',
  AuditLoggerAgent: 'bg-slate-500/20 text-slate-400',
  TaskManagerAgent: 'bg-green-500/20 text-green-400',
  System: 'bg-orange-500/20 text-orange-400',
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${className}`}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { id: number; message: string; type: 'success' | 'error'; }

function Toast({ toasts, remove }: { toasts: ToastMsg[]; remove: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up border
            ${t.type === 'success'
              ? 'bg-green-900/90 border-green-700 text-green-200'
              : 'bg-red-900/90 border-red-700 text-red-200'}`}
        >
          <span>{t.type === 'success' ? '✅' : '❌'}</span>
          {t.message}
          <button id={`toast-close-${t.id}`} onClick={() => remove(t.id)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const counter = useRef(0);
  const add = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, add, remove };
}

// ─── Meetings Tab ─────────────────────────────────────────────────────────────

function MeetingsTab({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getMeetings(1);
      setMeetings(result.data);
    } catch {
      toast.add('Failed to load meetings', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !transcript.trim()) return;
    setSubmitting(true);
    try {
      const created = await createMeeting(title, transcript);
      toast.add(`Meeting created! Extracting tasks…`);
      setTitle(''); setTranscript('');
      setMeetings((m) => [created.meeting, ...m]);

      setExtractingId(created.meeting_id);
      try {
        const extracted = await extractTasks(created.meeting_id);
        toast.add(`✅ ${extracted.tasks_created} tasks extracted from meeting`);
      } catch {
        toast.add('Task extraction failed — check OpenAI key', 'error');
      } finally {
        setExtractingId(null);
      }
    } catch (err) {
      toast.add((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Form */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          📤 <span>Process New Meeting</span>
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="mtg-title" className="label">Meeting Title</label>
            <input
              id="mtg-title"
              type="text"
              className="input"
              placeholder="e.g. Q2 Product Roadmap Planning"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={500}
            />
          </div>
          <div>
            <label htmlFor="mtg-transcript" className="label">Meeting Transcript</label>
            <textarea
              id="mtg-transcript"
              className="input min-h-[180px] resize-y"
              placeholder="Paste your meeting transcript here (minimum 50 characters)…"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              required
              minLength={50}
              maxLength={50000}
            />
            <p className="text-xs text-slate-500 mt-1">{transcript.length.toLocaleString()} / 50,000 chars</p>
          </div>
          <button
            id="btn-process-meeting"
            type="submit"
            disabled={submitting}
            className="btn-primary flex items-center gap-2"
          >
            {submitting ? <><Spinner /> Processing…</> : <><span>🚀</span> Process Meeting</>}
          </button>
        </form>
      </div>

      {/* Meeting List */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Meetings</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4 flex justify-between items-center">
                <div className="space-y-2">
                  <div className="skeleton h-5 w-64 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
                <div className="skeleton h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="card p-12 text-center text-slate-500">
            <p className="text-4xl mb-3">🎙️</p>
            <p className="font-medium">No meetings yet</p>
            <p className="text-sm mt-1">Upload your first meeting transcript above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => (
              <div key={m.id} className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors">
                <div>
                  <p className="font-medium text-white">{m.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(m.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {extractingId === m.id && (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <Spinner /> Extracting…
                    </span>
                  )}
                  <button
                    id={`btn-extract-${m.id}`}
                    onClick={async () => {
                      setExtractingId(m.id);
                      try {
                        const r = await extractTasks(m.id);
                        toast.add(`${r.tasks_created} tasks extracted`);
                      } catch (err) {
                        toast.add((err as Error).message, 'error');
                      } finally { setExtractingId(null); }
                    }}
                    disabled={extractingId === m.id}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    🧠 Re-extract Tasks
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTasks({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        owner: ownerFilter || undefined,
        page,
        limit: 20,
      });
      setTasks(result.data);
      setTotal(result.total);
    } catch {
      toast.add('Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, ownerFilter, page, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, status: string) {
    setUpdating(id);
    try {
      await updateTaskStatus(id, status);
      toast.add('Task status updated');
      await load();
    } catch (err) {
      toast.add((err as Error).message, 'error');
    } finally {
      setUpdating(null);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="filter-status" className="label text-xs">Status</label>
          <select id="filter-status" className="input py-2 text-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label htmlFor="filter-priority" className="label text-xs">Priority</label>
          <select id="filter-priority" className="input py-2 text-sm" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}>
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="filter-owner" className="label text-xs">Owner</label>
          <input id="filter-owner" type="text" className="input py-2 text-sm" placeholder="Search by owner…"
            value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }} />
        </div>
        <button id="btn-refresh-tasks" onClick={load} className="btn-secondary text-sm px-4 py-2">Refresh</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Task</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Owner</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Deadline</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Priority</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Update</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="skeleton h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <p className="text-3xl mb-2">✅</p>
                    <p>No tasks found</p>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const isOverdue = task.status === 'overdue';
                  return (
                    <tr
                      key={task.id}
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${isOverdue ? 'bg-red-950/20' : ''}`}
                    >
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="font-medium text-white truncate" title={task.title}>{task.title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{task.owner}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${isOverdue ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                        {formatDate(task.deadline)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={task.priority} className={priorityClass[task.priority] ?? ''} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          label={task.status.replace('_', ' ')}
                          className={statusClass[task.status] ?? ''}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          id={`status-select-${task.id}`}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={task.status}
                          disabled={updating === task.id}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
            <p className="text-xs text-slate-500">{total} tasks total</p>
            <div className="flex gap-2">
              <button
                id="btn-page-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs px-3 py-1 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs text-slate-400 flex items-center px-2">
                {page} / {totalPages}
              </span>
              <button
                id="btn-page-next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-xs px-3 py-1 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getAuditLogs({ agent: agentFilter || undefined, limit: 50 });
      setLogs(result.data);
    } catch {
      toast.add('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [agentFilter, toast]);

  useEffect(() => {
    load();
    // Auto-refresh every 30s
    intervalRef.current = setInterval(load, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  const agents = [
    'MeetingIngestionAgent', 'TaskExtractorAgent', 'ReminderAgent',
    'EscalationAgent', 'SchedulerAgent', 'TaskManagerAgent', 'System',
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4 flex flex-wrap gap-3 items-end justify-between">
        <div className="flex items-center gap-3">
          <div>
            <label htmlFor="audit-agent-filter" className="label text-xs">Filter by Agent</label>
            <select
              id="audit-agent-filter"
              className="input py-2 text-sm"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <option value="">All Agents</option>
              {agents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button id="btn-refresh-audit" onClick={load} className="btn-secondary text-sm px-4 py-2 mt-5">Refresh</button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-fast inline-block" />
          Auto-refreshes every 30s
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Timestamp</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Agent</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Action</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="skeleton h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    <p className="text-3xl mb-2">📋</p>
                    <p>No audit logs yet</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                      {formatRelative(log.timestamp)}
                      <div className="text-slate-600 text-[10px]">{formatDate(log.timestamp)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${agentColors[log.agent] ?? 'bg-slate-700 text-slate-300'}`}>
                        {log.agent}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[240px] truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────

type Tab = 'meetings' | 'tasks' | 'audit';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('meetings');
  const toast = useToast();

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'meetings', label: 'Meetings', icon: '🎙️' },
    { key: 'tasks', label: 'Tasks', icon: '✅' },
    { key: 'audit', label: 'Audit Log', icon: '📋' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" id="nav-home" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
              A
            </div>
            <span className="font-bold text-white text-lg group-hover:text-blue-400 transition-colors">
              AutoOps AI
            </span>
          </Link>
          <span className="text-xs text-slate-500 hidden sm:block">ET AI Hackathon 2026</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Manage meetings, track tasks, and monitor agent activity
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              id={`tab-${t.key}`}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === t.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {activeTab === 'meetings' && <MeetingsTab toast={toast} />}
          {activeTab === 'tasks' && <TasksTab toast={toast} />}
          {activeTab === 'audit' && <AuditTab toast={toast} />}
        </div>
      </div>

      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
