'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UploadCloud, RefreshCw, Filter, ListCheck, Activity, BrainCircuit,
  Megaphone, ShieldAlert, BadgeCheck, Clock, Layers, Network, Mic
} from 'lucide-react';
import {
  getMeetings, createMeeting, extractTasks,
  getTasks, updateTaskStatus, getAuditLogs,
  type Meeting, type Task, type AuditLog,
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
  critical: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.1)]',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]',
  low: 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]',
};

const statusClass: Record<string, string> = {
  pending: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
  overdue: 'bg-red-500/10 text-red-400 border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.25)] animate-pulse',
};

const agentColors: Record<string, string> = {
  MeetingIngestionAgent: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  TaskExtractorAgent: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  ReminderAgent: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  EscalationAgent: 'bg-red-500/20 text-red-400 border border-red-500/30',
  SchedulerAgent: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  AuditLoggerAgent: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  TaskManagerAgent: 'bg-green-500/20 text-green-400 border border-green-500/30',
  System: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm ${className}`}>
      {label}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { id: number; message: string; type: 'success' | 'error' | 'info'; }

function Toast({ toasts, remove }: { toasts: ToastMsg[]; remove: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold border backdrop-blur-xl
              ${t.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200' : 
                t.type === 'info' ? 'bg-cyan-950/80 border-cyan-500/30 text-cyan-200' :
                'bg-red-950/80 border-red-500/30 text-red-200'}`}
          >
            {t.type === 'success' ? <BadgeCheck className="w-5 h-5" /> : 
             t.type === 'info' ? <Activity className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            {t.message}
            <button onClick={() => remove(t.id)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">✕</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const counter = useRef(0);
  const add = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, add, remove };
}

// ─── Meetings Tab ─────────────────────────────────────────────────────────────

function MeetingsTab({ toast, socket }: { toast: ReturnType<typeof useToast>, socket: Socket | null }) {
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

  // Handle live updates
  useEffect(() => {
    if (!socket) return;
    const handler = () => load(); // refresh if remote extraction occurred
    socket.on('task_created', handler);
    return () => { socket.off('task_created', handler); };
  }, [socket, load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !transcript.trim()) return;
    setSubmitting(true);
    try {
      const created = await createMeeting(title, transcript);
      toast.add(`Meeting uploaded! AI Agents initialized.`, 'success');
      setTitle(''); setTranscript('');
      setMeetings((m) => [created.meeting, ...m]);

      setExtractingId(created.meeting_id);
      try {
        const extracted = await extractTasks(created.meeting_id);
        toast.add(`Extraction complete! ${extracted.tasks_created} tasks logged.`, 'success');
      } catch {
        toast.add('Extraction failed — verify API key.', 'error');
      } finally {
        setExtractingId(null);
        setSubmitting(false);
      }
    } catch (err) {
      toast.add((err as Error).message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-8 bg-slate-900/50 backdrop-blur-xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500" />
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
          <UploadCloud className="w-6 h-6 text-blue-400" />
          Ingest New Meeting Transcript
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label">Meeting Title / Context</label>
            <input
              type="text"
              className="input bg-slate-950/50 border-slate-800 text-lg py-3"
              placeholder="e.g. Q4 Executive Planning Sync"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Raw Transcript</label>
            <textarea
              className="input bg-slate-950/50 border-slate-800 min-h-[200px] font-mono text-sm leading-relaxed"
              placeholder="Paste the raw meeting dialogue here..."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors"
          >
            {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
            {submitting ? 'AutoOps Agents Processing...' : 'Trigger AI Pipeline'}
          </button>
        </form>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest pl-2 mb-4">Ingestion History</h2>
        <div className="space-y-3">
          {loading ? (
             <div className="skeleton h-20 w-full rounded-xl" />
          ) : meetings.map((m) => (
            <div key={m.id} className="card p-5 bg-slate-900/40 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 flex items-center justify-between transition-all">
              <div>
                <p className="font-semibold text-lg text-slate-200">{m.title}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <Clock className="w-3 h-3" /> {formatDate(m.created_at)}
                </div>
              </div>
              <div className="flex items-center">
                {extractingId === m.id ? (
                  <span className="flex items-center gap-2 text-sm text-cyan-400 font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Extracting Tasks
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      setExtractingId(m.id);
                      try {
                        const r = await extractTasks(m.id);
                        toast.add(`✅ ${r.tasks_created} tasks forcibly re-extracted`);
                      } catch (err) {
                        toast.add((err as Error).message, 'error');
                      } finally { setExtractingId(null); }
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <BrainCircuit className="w-4 h-4" /> Re-Scan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab({ toast, socket }: { toast: ReturnType<typeof useToast>, socket: Socket | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTasks({ status: statusFilter || undefined, limit: 50 });
      setTasks(result.data);
    } catch {
      toast.add('Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  // Live real-time UI updates
  useEffect(() => {
    if (!socket) return;
    const reload = () => load();
    socket.on('task_created', reload);
    socket.on('task_updated', reload);
    return () => {
      socket.off('task_created', reload);
      socket.off('task_updated', reload);
    };
  }, [socket, load]);

  async function handleStatusChange(id: string, status: string) {
    setUpdating(id);
    try {
      await updateTaskStatus(id, status);
    } catch (err) {
      toast.add((err as Error).message, 'error');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-4 bg-slate-900/60 backdrop-blur-md flex items-center gap-4">
        <Filter className="w-5 h-5 text-slate-500" />
        <select 
          className="bg-slate-950 border border-slate-800 rounded-lg py-2 px-4 text-sm font-medium w-48 text-slate-300"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Live View (All Tasks)</option>
          <option value="pending">Pending Only</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue / Escalated</option>
        </select>
        <button onClick={load} className="ml-auto flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <RefreshCw className="w-4 h-4" /> Sync
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {tasks.map((task) => {
            const isOverdue = task.status === 'overdue';
            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={task.id}
                className={`card p-6 flex flex-col justify-between border ${isOverdue ? 'bg-red-950/20 border-red-900/50 shadow-[0_0_30px_rgba(239,68,68,0.1)]' : 'bg-slate-900/50 backdrop-blur-lg border-slate-800 hover:border-slate-700'}`}
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <Badge label={task.priority.toUpperCase()} className={priorityClass[task.priority]} />
                    <Badge label={task.status.toUpperCase()} className={statusClass[task.status]} />
                  </div>
                  <h3 className="font-bold text-lg text-slate-100 leading-tight mb-2">{task.title}</h3>
                  <div className="text-sm font-medium text-slate-400 mb-6 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                      {task.owner.charAt(0).toUpperCase()}
                    </div>
                    {task.owner}
                  </div>
                </div>
                
                <div className="space-y-4 pt-4 border-t border-slate-800/50">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Clock className={`w-4 h-4 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`} />
                    <span className={isOverdue ? 'text-red-400' : 'text-slate-400'}>
                      Due: {formatDate(task.deadline)}
                    </span>
                  </div>
                  <select
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 font-medium focus:ring-1 focus:ring-blue-500 transition-colors"
                    value={task.status}
                    disabled={updating === task.id || isOverdue}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                  >
                    {isOverdue && <option value="overdue">Overdue (Escalated)</option>}
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab({ toast, socket }: { toast: ReturnType<typeof useToast>, socket: Socket | null }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await getAuditLogs({ limit: 100 });
      setLogs(result.data);
    } catch {
      toast.add('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // LIVE WebSocket Streaming Log
  useEffect(() => {
    if (!socket) return;
    const handler = (newLog: AuditLog) => {
      setLogs((prev) => [newLog, ...prev].slice(0, 100));
      toast.add(`System Event: ${newLog.agent} performed ${newLog.action}`, 'info');
    };
    socket.on('agent_action', handler);
    return () => { socket.off('agent_action', handler); };
  }, [socket, toast]);

  return (
    <div className="card bg-slate-900/40 backdrop-blur-xl border border-slate-800 overflow-hidden relative">
      <div className="absolute top-0 right-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="p-6 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-3">
          <Activity className="w-5 h-5 text-cyan-400" />
          Live Agent Terminal
        </h2>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          STREAMING ACTIVE
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto px-6 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <motion.div
              layout
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              key={log.id}
              className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 font-mono text-sm"
            >
              <div className="flex-shrink-0 text-slate-500 mt-1 uppercase text-xs">
                {formatDate(log.timestamp).split(',')[1]}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${agentColors[log.agent] ?? 'bg-slate-800 text-slate-300'}`}>
                    {log.agent}
                  </span>
                  <span className="text-slate-300 font-semibold">{log.action}</span>
                </div>
                {log.details && (
                  <div className="text-slate-500 text-xs break-all whitespace-pre-wrap bg-slate-900 p-2 rounded border border-slate-800/50">
                    {JSON.stringify(log.details)}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Dashboard Configuration ──────────────────────────────────────────────────

type Tab = 'meetings' | 'tasks' | 'audit';

const AGENTS = [
  { id: 'MeetingIngestionAgent', label: 'Ingestion' },
  { id: 'TaskExtractorAgent', label: 'Extractor' },
  { id: 'TaskManagerAgent', label: 'Manager' },
  { id: 'SchedulerAgent', label: 'Scheduler' },
  { id: 'ReminderAgent', label: 'Reminder' },
  { id: 'EscalationAgent', label: 'Escalator' },
  { id: 'AuditLoggerAgent', label: 'Logger' },
];

function AgentNetworkMap({ socket }: { socket: Socket | null }) {
  const [activeAgents, setActiveAgents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!socket) return;
    const handler = (log: AuditLog) => {
      setActiveAgents((prev) => ({ ...prev, [log.agent]: true }));
      setTimeout(() => {
        setActiveAgents((prev) => ({ ...prev, [log.agent]: false }));
      }, 1500); // Pulse for 1.5 seconds
    };
    socket.on('agent_action', handler);
    return () => { socket.off('agent_action', handler); };
  }, [socket]);

  return (
    <div className="mb-8 p-6 card bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden relative">
      <div className="absolute top-0 left-10 w-64 h-64 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
      <h3 className="text-slate-400 font-semibold mb-6 flex items-center gap-2 uppercase tracking-widest text-xs z-10 relative">
        <Network className="w-4 h-4 text-cyan-500" /> Live AI Architecture Topology
      </h3>
      <div className="flex gap-2 sm:gap-4 items-center justify-center flex-wrap z-10 relative">
        {AGENTS.map((agent, i) => {
          const isActive = activeAgents[agent.id];
          return (
            <React.Fragment key={agent.id}>
              <div 
                className={`flex flex-col items-center justify-center p-3 sm:px-4 sm:py-3 rounded-2xl border transition-all duration-300 w-24 sm:w-28
                  ${isActive 
                    ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)] scale-110 z-10' 
                    : 'bg-slate-950/80 border-slate-800 opacity-70'}
                `}
              >
                <BrainCircuit className={`w-5 h-5 sm:w-6 sm:h-6 mb-2 ${isActive ? 'text-cyan-300 animate-pulse' : 'text-slate-600'}`} />
                <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-center ${isActive ? 'text-cyan-100' : 'text-slate-500'}`}>
                  {agent.label}
                </span>
                {isActive && (
                  <motion.div layoutId={`pulse-${agent.id}`} className="absolute inset-0 rounded-xl bg-cyan-400 opacity-20 animate-ping pointer-events-none" />
                )}
              </div>
              {i < AGENTS.length - 1 && (
                <div className="hidden md:block w-4 sm:w-8 h-px bg-slate-800 relative"></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('meetings');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const toast = useToast();

  useEffect(() => {
    // Determine websocket URL from API URL (strip /api/v1)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    const socketUrl = apiUrl.replace('/api/v1', '');
    
    const ioSocket = io(socketUrl, { transports: ['polling', 'websocket'] });
    setSocket(ioSocket);

    ioSocket.on('connect', () => setSocketStatus('connected'));
    ioSocket.on('connect_error', () => setSocketStatus('error'));

    return () => { ioSocket.disconnect(); };
  }, []);

  const tabs = [
    { key: 'meetings' as Tab, label: 'Meetings', icon: Mic },
    { key: 'tasks' as Tab, label: 'Tasks', icon: ListCheck },
    { key: 'audit' as Tab, label: 'Live Audit', icon: Activity },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Premium Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-black shadow-[0_0_15px_rgba(59,130,246,0.5)] group-hover:scale-105 transition-transform">
              <Network className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-white tracking-tight">AutoOps <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">AI</span></span>
          </Link>

          <div className="flex items-center gap-4">
            {/* Live Socket Connection Badge */}
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors
              ${socketStatus === 'connected' ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 
                socketStatus === 'error' ? 'bg-red-900/30 border-red-500/50 text-red-400' : 
                'bg-yellow-900/30 border-yellow-500/50 text-yellow-400'}`}
            >
              <div className={`w-2 h-2 rounded-full ${socketStatus === 'connected' ? 'bg-cyan-400 animate-pulse' : 'bg-current'}`} />
              {socketStatus === 'connected' ? 'WEBSOCKET CONNECTED' : socketStatus.toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 w-full flex-1">
        
        {/* Live Topology Map */}
        <AgentNetworkMap socket={socket} />

        {/* Animated Tabs */}
        <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-2xl w-fit border border-slate-800 backdrop-blur-md relative">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative z-10 flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300
                ${activeTab === t.key ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <t.icon className={`w-4 h-4 ${activeTab === t.key ? 'text-current' : 'opacity-70'}`} />
              {t.label}
              {/* Active Tab Glow */}
              {activeTab === t.key && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-slate-800 rounded-xl -z-10 shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-slate-700"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Dynamic Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'meetings' && <MeetingsTab toast={toast} socket={socket} />}
            {activeTab === 'tasks' && <TasksTab toast={toast} socket={socket} />}
            {activeTab === 'audit' && <AuditTab toast={toast} socket={socket} />}
          </motion.div>
        </AnimatePresence>

      </div>
      
      {/* Global Toasts */}
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </div>
  );
}
