import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart2, Zap, TrendingUp, Activity, CheckCircle2, XCircle, RefreshCw, Inbox, Server, CreditCard, AlertCircle } from 'lucide-react'
import { API_BASE } from '../config'
import { fadeUp, stagger } from '../lib/animations'
import { SkeletonCard, SkeletonRow } from '../components/ui/Skeleton'

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

function PassBadge({ rate }) {
  const n = Math.round(rate || 0)
  const color = n >= 80 ? '#10b981' : n >= 60 ? '#f59e0b' : '#ef4444'
  return <span className="text-sm font-black font-mono-crisp" style={{ color }}>{n}%</span>
}

function StatusChip({ status }) {
  if (status === 'completed') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981' }}>
      <CheckCircle2 size={9} /> Done
    </span>
  )
  if (status === 'failed') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
      <XCircle size={9} /> Failed
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold"
      style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Running
    </span>
  )
}

const STAT_CARDS = [
  { key: 'total_evaluations', label: 'Total Evals',    icon: Activity,    color: '#7C3AED', format: v => v ?? 0 },
  { key: 'models_evaluated',  label: 'Models',          icon: Server,      color: '#06B6D4', format: v => v ?? 0 },
  { key: 'avg_pass_rate',     label: 'Avg Pass Rate',   icon: TrendingUp,  color: '#10b981', format: v => `${v ?? 0}%` },
  { key: 'total_tests_run',   label: 'Tests Run',       icon: Zap,         color: '#f59e0b', format: v => (v ?? 0).toLocaleString() },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats]               = useState(null)
  const [evals, setEvals]               = useState([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingEvals, setLoadingEvals] = useState(true)
  const [offline, setOffline]           = useState(false)
  const [usageStats, setUsageStats]     = useState(null)
  const [regressionAlerts, setRegressionAlerts] = useState([])

  const fetchAll = () => {
    setLoadingStats(true)
    setLoadingEvals(true)
    setOffline(false)
    fetch(`${API_BASE}/stats`)
      .then(r => r.json())
      .then(data => { setStats(data); setLoadingStats(false) })
      .catch(() => { setOffline(true); setLoadingStats(false) })
    fetch(`${API_BASE}/evaluations?limit=10`)
      .then(r => r.json())
      .then(data => { setEvals(data || []); setLoadingEvals(false) })
      .catch(() => setLoadingEvals(false))
    fetch(`${API_BASE}/usage/stats`)
      .then(r => r.json())
      .then(data => setUsageStats(data))
      .catch(() => {})
    fetch(`${API_BASE}/regression/alerts`)
      .then(r => r.json())
      .then(data => setRegressionAlerts(data || []))
      .catch(() => {})
  }

  useEffect(() => { fetchAll() }, [])

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="p-6 max-w-6xl mx-auto space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Real-time stats from your evaluation database</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-all"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            <RefreshCw size={12} className={(loadingStats || loadingEvals) ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/run')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}
          >
            <Zap size={13} /> New Evaluation
          </button>
        </div>
      </motion.div>

      {/* Offline banner */}
      {offline && (
        <motion.div variants={fadeUp} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-red-300 text-sm font-semibold">Backend Offline</p>
            <p className="text-red-500 text-xs">Could not reach API at {API_BASE}. Start uvicorn on port 8000.</p>
          </div>
          <button onClick={fetchAll} className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>Retry</button>
        </motion.div>
      )}

      {/* High usage warning */}
      {(() => {
        const groqPct = usageStats?.providers?.groq?.today?.tokens_pct_used || 0
        const geminiPct = usageStats?.providers?.gemini?.today?.tokens_pct_used || 0
        if (groqPct > 80 || geminiPct > 80) {
          const highProv = groqPct > 80 ? 'Groq' : 'Gemini'
          const highPct = groqPct > 80 ? groqPct : geminiPct
          return (
            <motion.div variants={fadeUp} onClick={() => navigate('/usage')} className="rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div className="flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-amber-300 text-xs font-bold">{highProv} at {highPct}% daily limit</p>
                  <p className="text-amber-500 text-[11px]">Consider switching providers for remaining evaluations.</p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-400">View Usage →</span>
            </motion.div>
          )
        }
        return null
      })()}

      {/* Best model banner */}
      {stats?.best_model && (
        <motion.div variants={fadeUp} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid #7C3AED' }}>
          <div className="p-2 rounded-xl" style={{ background: 'rgba(124,58,237,0.15)' }}>
            <TrendingUp size={16} className="text-violet-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Best Model</p>
            <p className="text-white font-bold text-sm">
              {stats.best_model}
              <span className="ml-2 text-xs font-normal text-violet-400">{stats.best_score}% pass rate</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Stat cards */}
      <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingStats
          ? [1,2,3,4].map(i => <SkeletonCard key={i} rows={2} />)
          : STAT_CARDS.map(card => (
              <motion.div
                key={card.key}
                variants={fadeUp}
                className="relative overflow-hidden rounded-2xl p-5 group"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', transition: 'border-color 0.2s' }}
                whileHover={{ borderColor: `${card.color}44`, boxShadow: `0 0 28px ${card.color}18` }}
              >
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-[0.07] blur-2xl" style={{ background: card.color }} />
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-xl" style={{ background: `${card.color}18`, border: `1px solid ${card.color}30` }}>
                    <card.icon size={15} style={{ color: card.color }} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{card.label}</span>
                </div>
                <p className="text-3xl font-black text-white font-mono-crisp">{card.format(stats?.[card.key])}</p>
              </motion.div>
            ))}
      </motion.div>

      {/* Regression Alerts */}
      {regressionAlerts.length > 0 && (
        <motion.div variants={fadeUp} className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
            <span className="animate-pulse">🚨</span>
            Regression Alerts ({regressionAlerts.length})
          </div>
          <div className="space-y-2">
            {regressionAlerts.map(alert => (
              <div key={alert.model} className="flex items-center justify-between p-3 rounded-xl text-xs" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{alert.model}</span>
                  <span className="text-red-400">dropped {Math.abs(alert.trend_analysis?.change_from_previous || 0)}% from last eval</span>
                </div>
                <button
                  onClick={() => navigate(`/regression?model=${encodeURIComponent(alert.model)}`)}
                  className="px-3 py-1 rounded-lg font-bold text-[11px] transition-all hover:bg-red-600 hover:text-white"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                >
                  View Trend →
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent evaluations */}
      <motion.div variants={fadeUp} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-violet-400" />
            <h2 className="text-sm font-bold text-slate-200">Recent Evaluations</h2>
          </div>
          <button onClick={() => navigate('/history')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-semibold">View all →</button>
        </div>

        {loadingEvals ? (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {[1,2,3,4].map(i => <SkeletonRow key={i} />)}
          </div>
        ) : evals.length === 0 ? (
          <div className="p-14 flex flex-col items-center gap-4 text-center">
            <div className="p-4 rounded-2xl" style={{ background: 'rgba(124,58,237,0.08)' }}>
              <Inbox size={28} className="text-violet-800" />
            </div>
            <div>
              <p className="text-slate-400 font-semibold text-sm">No evaluations yet</p>
              <p className="text-slate-600 text-xs mt-1">Run your first evaluation to see results here.</p>
            </div>
            <button onClick={() => navigate('/run')} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', boxShadow: '0 0 16px rgba(124,58,237,0.3)' }}>
              <Zap size={12} className="inline mr-1.5" />Run Evaluation
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['#','Model','Provider','Category','Tests','Pass Rate','Status','When','Action'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evals.map((ev, idx) => (
                  <tr key={ev.id} className="group hover:bg-white/[0.02] transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3.5 text-slate-700 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3.5"><span className="font-semibold text-slate-200 truncate max-w-[160px] block">{ev.model}</span></td>
                    <td className="px-4 py-3.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)', color: '#a78bfa' }}>{ev.provider || 'groq'}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 truncate max-w-[100px]">{ev.template_id ? `📋 ${ev.template_id}` : ev.dataset_filename ? `📁 ${ev.dataset_filename}` : ev.prompt_category || 'all'}</td>
                    <td className="px-4 py-3.5 text-slate-500 font-mono-crisp">{ev.num_tests}</td>
                    <td className="px-4 py-3.5">{ev.status === 'completed' ? <PassBadge rate={ev.pass_rate} /> : <span className="text-slate-700">—</span>}</td>
                    <td className="px-4 py-3.5"><StatusChip status={ev.status} /></td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{relativeTime(ev.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => navigate(`/results?model=${encodeURIComponent(ev.model)}`)} className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all" style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', color: '#22d3ee' }}>Results</button>
                        {ev.status === 'completed' && (
                          <button onClick={() => navigate(`/model-card?model=${encodeURIComponent(ev.model)}`)} className="p-1.5 rounded-md transition-all hover:bg-violet-600/20" style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', color: '#a78bfa' }}>
                            <CreditCard size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
