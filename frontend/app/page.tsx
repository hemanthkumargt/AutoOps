'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStats } from '@/lib/api';

interface Stats {
  totalMeetings: number;
  totalTasks: number;
  overdueTasks: number;
}

function StatCard({ value, label, color, icon }: {
  value: number | string;
  label: string;
  color: string;
  icon: string;
}) {
  return (
    <div className={`card p-6 flex items-center gap-4 animate-slide-up`}>
      <div className={`text-4xl`}>{icon}</div>
      <div>
        <div className={`text-3xl font-bold ${color}`}>{value}</div>
        <div className="text-sm text-slate-400 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function GlowOrb({ className }: { className: string }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl opacity-20 pointer-events-none ${className}`}
    />
  );
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getStats()
      .then((s) => { if (!cancelled) { setStats(s); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-4 py-20">
      {/* Background glow orbs */}
      <GlowOrb className="w-[600px] h-[600px] bg-blue-600 top-[-200px] left-[-200px]" />
      <GlowOrb className="w-[400px] h-[400px] bg-purple-600 bottom-[-100px] right-[-100px]" />
      <GlowOrb className="w-[300px] h-[300px] bg-cyan-500 top-[30%] right-[10%]" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-4xl w-full text-center space-y-8">
        {/* Logo / Badge */}
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-blue-400 font-medium mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse-fast inline-block" />
          ET AI Hackathon 2026 — Live Demo
        </div>

        {/* Hero */}
        <div className="space-y-4">
          <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight leading-none">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400">
              AutoOps
            </span>
            <span className="text-white"> AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 font-light max-w-2xl mx-auto leading-relaxed">
            AI that doesn&apos;t just record meetings —<br />
            <span className="font-semibold text-white">it ensures decisions get executed.</span>
          </p>
        </div>

        {/* Description */}
        <p className="text-slate-400 max-w-xl mx-auto text-base leading-relaxed">
          Upload your meeting transcript. Our 7-agent AI system extracts tasks,
          assigns owners, sets deadlines, sends reminders, and escalates overdue
          items — automatically.
        </p>

        {/* Agent pills */}
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            '🎙️ Meeting Ingestion',
            '🧠 Task Extraction',
            '📧 Reminder',
            '🚨 Escalation',
            '⏰ Scheduler',
            '📊 Audit Logger',
            '✅ Task Manager',
          ].map((agent) => (
            <span
              key={agent}
              className="glass rounded-full px-3 py-1.5 text-xs text-slate-300 font-medium"
            >
              {agent}
            </span>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-4 justify-center flex-wrap pt-2">
          <Link
            href="/dashboard"
            id="btn-upload-meeting"
            className="btn-primary text-base px-8 py-3 flex items-center gap-2 shadow-lg shadow-blue-500/25"
          >
            <span>📤</span> Upload Meeting
          </Link>
          <Link
            href="/dashboard"
            id="btn-view-dashboard"
            className="btn-secondary text-base px-8 py-3 flex items-center gap-2"
          >
            <span>📊</span> View Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-6 flex items-center gap-4">
                <div className="skeleton w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                  <div className="skeleton h-7 w-12 rounded" />
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
              </div>
            ))
          ) : (
            <>
              <StatCard
                value={stats?.totalMeetings ?? '—'}
                label="Meetings Processed"
                color="text-blue-400"
                icon="🎙️"
              />
              <StatCard
                value={stats?.totalTasks ?? '—'}
                label="Tasks Extracted"
                color="text-cyan-400"
                icon="✅"
              />
              <StatCard
                value={stats?.overdueTasks ?? '—'}
                label="Overdue Tasks"
                color={stats && stats.overdueTasks > 0 ? 'text-red-400' : 'text-green-400'}
                icon="🚨"
              />
            </>
          )}
        </div>

        {/* Footer note */}
        <p className="text-xs text-slate-600 pt-4">
          Built with Next.js · Express · PostgreSQL · OpenAI GPT-4o · node-cron
        </p>
      </div>
    </main>
  );
}
