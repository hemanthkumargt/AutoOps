'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStats } from '@/lib/api';
import { motion, Variants } from 'framer-motion';
import { BrainCircuit, Mic, CheckCircle2, AlertOctagon, Activity } from 'lucide-react';

interface Stats {
  totalMeetings: number;
  totalTasks: number;
  overdueTasks: number;
}

function StatCard({ value, label, colorClass, icon: Icon }: {
  value: number | string;
  label: string;
  colorClass: string;
  icon: any;
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      className={`relative overflow-hidden group card p-6 flex flex-col items-center gap-3 bg-slate-900/40 backdrop-blur-md border border-slate-800/60 hover:border-slate-700 transition-colors`}
    >
      <div className={`absolute -inset-4 opacity-0 group-hover:opacity-20 transition-opacity blur-xl bg-gradient-to-tr from-transparent via-current to-transparent ${colorClass}`} />
      <div className={`p-3 rounded-xl bg-slate-800/80 ${colorClass}`}>
        <Icon className="w-8 h-8" />
      </div>
      <div className="text-center z-10">
        <div className={`text-4xl font-extrabold tracking-tight ${colorClass}`}>{value}</div>
        <div className="text-sm font-medium text-slate-400 mt-1">{label}</div>
      </div>
    </motion.div>
  );
}

function GlowOrb({ className, animate }: { className: string, animate?: Record<string, any> }) {
  return (
    <motion.div
      animate={animate}
      transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
      className={`absolute rounded-full blur-[100px] opacity-20 pointer-events-none ${className}`}
    />
  );
}

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
};

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
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <GlowOrb 
          className="w-[800px] h-[800px] bg-blue-600 top-[-20%] left-[-10%]" 
          animate={{ rotate: 360, scale: [1, 1.1, 1] }} 
        />
        <GlowOrb 
          className="w-[600px] h-[600px] bg-purple-600 bottom-[-20%] right-[-10%]" 
          animate={{ rotate: -360, scale: [1, 1.2, 1] }} 
        />
        <GlowOrb 
          className="w-[400px] h-[400px] bg-cyan-500 top-[30%] right-[20%]" 
          animate={{ y: [0, -50, 0] }} 
        />
      </div>

      {/* Grid overlay */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <motion.div 
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-5xl w-full text-center space-y-8"
      >
        {/* Badge */}
        <motion.div variants={fadeUp} className="flex justify-center">
          <div className="inline-flex items-center gap-2 bg-slate-900/50 backdrop-blur-md border border-blue-500/30 rounded-full px-5 py-2.5 text-sm text-blue-300 font-medium shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            Live Multi-Agent Architecture Demo
          </div>
        </motion.div>

        {/* Hero */}
        <motion.div variants={fadeUp} className="space-y-4">
          <h1 className="text-6xl sm:text-7xl md:text-8xl font-black tracking-tight leading-none drop-shadow-2xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500">
              AutoOps
            </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 ml-3">
              AI
            </span>
          </h1>
          <p className="text-xl md:text-3xl text-slate-300 font-light max-w-3xl mx-auto leading-relaxed">
            AI that doesn't just record meetings.<br />
            <span className="font-semibold text-white drop-shadow-md">It guarantees execution.</span>
          </p>
        </motion.div>

        {/* Description */}
        <motion.p variants={fadeUp} className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed pt-2">
          Upload a transcript. Our independent 7-agent pipeline automatically triggers extraction, sets deadlines, assigns owners, and blasts escalations.
        </motion.p>

        {/* Agent Pills */}
        <motion.div variants={fadeUp} className="flex flex-wrap gap-3 justify-center max-w-3xl mx-auto py-2">
          {[
            { name: 'Meeting Ingestion', icon: Mic, col: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { name: 'Task Extraction', icon: BrainCircuit, col: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
            { name: 'Scheduling Heartbeat', icon: Activity, col: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
          ].map((agent, i) => (
            <motion.div 
              whileHover={{ scale: 1.05 }}
              key={agent.name}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border backdrop-blur-sm ${agent.bg} ${agent.col}`}
            >
              <agent.icon className="w-4 h-4" />
              {agent.name}
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div variants={fadeUp} className="flex gap-4 justify-center flex-wrap pt-6">
          <Link href="/dashboard">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)] px-10 py-4 rounded-2xl font-bold flex items-center gap-3 transition-colors text-lg"
            >
              <Mic className="w-5 h-5" /> Launch Dashboard 
            </motion.button>
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-16 max-w-4xl mx-auto">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-6 flex flex-col items-center gap-4 border border-slate-800/50">
                <div className="skeleton w-12 h-12 rounded-xl" />
                <div className="skeleton h-8 w-20 rounded" />
                <div className="skeleton h-4 w-32 rounded" />
              </div>
            ))
          ) : (
            <>
              <StatCard value={stats?.totalMeetings ?? '—'} label="Meetings Processed" colorClass="text-blue-400" icon={Mic} />
              <StatCard value={stats?.totalTasks ?? '—'} label="Tasks Extracted" colorClass="text-purple-400" icon={CheckCircle2} />
              <StatCard value={stats?.overdueTasks ?? '—'} label="Overdue Escapations" colorClass={stats && stats.overdueTasks > 0 ? 'text-red-400' : 'text-emerald-400'} icon={AlertOctagon} />
            </>
          )}
        </motion.div>

      </motion.div>
    </main>
  );
}
