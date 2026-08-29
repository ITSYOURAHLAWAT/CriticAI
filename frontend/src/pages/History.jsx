import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'
import { API_BASE } from '../config'
import {
  History as HistoryIcon, Search, ChevronLeft, ChevronRight,
  BarChart2, FileText, Trash2, RefreshCw, AlertCircle, Inbox,
  CheckCircle2, XCircle, Clock, Zap, Filter, CreditCard,
} from 'lucide-react'
import { fadeUp, stagger } from '../lib/animations'

const PROVIDER_COLORS = {
  groq:   { bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.25)', text: '#a78bfa' },
  gemini: { bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.25)',  text: '#22d3ee' },
  ollama: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24' },
  other:  { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.25)', text: '#94a3b8' },
}

const PAGE_SIZE = 20

function relativeTime(isoStr) {
  if (!isoStr) return '—'
  const diff = Date.now() - new Date(isoStr + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7)  return `${d} days ago`
  return new Date(isoStr + 'Z').toLocaleDateString()
}

function StatusDot({ status }) {
  if (status === 'completed') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
      <CheckCircle2 size={13} /> Completed
    </span>
  )
  if (status === 'failed') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
      <XCircle size={13} /> Failed
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      Running
    </span>
  )
}

function PassBadge({ rate }) {
  const n = Math.round(rate || 0)
  const color = n >= 80 ? '#22d3ee' : n >= 60 ? '#fbbf24' : '#f87171'
  return (
    <span className="text-sm font-black font-mono-crisp" style={{ color }}>{n}%</span>
  )
}

function ProviderBadge({ provider }) {
  const p = (provider || 'other').toLowerCase()
  const c = PROVIDER_COLORS[p] || PROVIDER_COLORS.other
  return (
    <span
      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {provider || 'groq'}
    </span>
  )
}

function ShimmerCard() {
  return (
    <div className="rounded-2xl p-5 flex gap-4 items-center shimmer" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="w-1 self-stretch rounded-full bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/10 rounded w-48" />
        <div className="h-3 bg-white/5 rounded w-72" />
        <div className="h-3 bg-white/5 rounded w-40" />
      </div>
      <div className="h-8 w-20 bg-white/10 rounded-xl" />
    </div>
  )
}

export default function History() {
  const navigate = useNavigate()
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [filter, setFilter]           = useState('all')       // all | completed | running | failed
  const [search, setSearch]           = useState('')
  const [sort, setSort]               = useState('newest')    // newest | oldest | best
  const [page, setPage]               = useState(1)
  const [deleting, setDeleting]       = useState(null)

  const fetchEvals = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get(`${API_BASE}/evaluations?limit=200`)
      setEvaluations(res.data || [])
    } catch (e) {
      setError('Could not reach backend. Is the API running on port 8000?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEvals() }, [])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this evaluation? This cannot be undone.')) return
    setDeleting(id)
    try {
      await axios.delete(`${API_BASE}/evaluations/${id}`)
      setEvaluations(prev => prev.filter(ev => ev.id !== id))
    } catch {
      alert('Failed to delete evaluation.')
    } finally {
      setDeleting(null)
    }
  }

  // ── Filter + search + sort ──
  const filtered = useMemo(() => {
    let list = evaluations
    if (filter !== 'all') list = list.filter(e => e.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => e.model?.toLowerCase().includes(q) || e.prompt_category?.toLowerCase().includes(q))
    }
    if (sort === 'oldest') list = [...list].sort((a, b) => a.created_at?.localeCompare(b.created_at))
    else if (sort === 'best') list = [...list].sort((a, b) => (b.pass_rate || 0) - (a.pass_rate || 0))
    return list
  }, [evaluations, filter, search, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => setPage(1), [filter, search, sort])

  const statusLine = (status) => {
    if (status === 'completed') return '#10b981'
    if (status === 'failed')    return '#ef4444'
    return '#f59e0b'
  }

  const FILTERS = [
    { key: 'all',       label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'running',   label: 'Running' },
    { key: 'failed',    label: 'Failed' },
  ]

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <HistoryIcon size={22} className="text-violet-400" /> Evaluation History
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            {evaluations.length} total evaluation{evaluations.length !== 1 ? 's' : ''} stored in database
          </p>
        </div>
        <button
          onClick={fetchEvals}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-slate-400 hover:text-white transition-all text-xs font-semibold"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </motion.div>

      {/* Controls */}
      <motion.div variants={fadeUp} className="rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border"
              style={filter === f.key
                ? { background: 'rgba(124,58,237,0.2)', borderColor: 'rgba(124,58,237,0.5)', color: '#c4b5fd' }
                : { background: 'transparent', borderColor: 'var(--border-subtle)', color: '#64748b' }
              }
            >
              {f.label}
              {f.key !== 'all' && (
                <span className="ml-1.5 text-[9px] bg-white/10 px-1.5 py-0.5 rounded-full">
                  {evaluations.filter(e => e.status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-1 flex-wrap sm:justify-end">
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search model…"
              className="pl-7 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-all w-44"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-300 focus:outline-none focus:border-violet-500 transition-all"
          >
            <option value="newest">Latest First</option>
            <option value="oldest">Oldest First</option>
            <option value="best">Best Score</option>
          </select>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div variants={fadeUp} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-red-300 text-xs">{error}</p>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <ShimmerCard key={i} />)}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div variants={fadeUp} className="rounded-2xl p-14 flex flex-col items-center gap-4 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="p-4 rounded-2xl" style={{ background: 'rgba(124,58,237,0.08)' }}>
            <Inbox size={32} className="text-violet-700" />
          </div>
          <div>
            <p className="text-slate-300 font-semibold text-sm">
              {search || filter !== 'all' ? 'No matching evaluations' : 'No evaluations yet'}
            </p>
            <p className="text-slate-600 text-xs mt-1">
              {search || filter !== 'all'
                ? 'Try adjusting your filters or search term.'
                : 'Run your first evaluation to see history here.'}
            </p>
          </div>
          {!search && filter === 'all' && (
            <button
              onClick={() => navigate('/run')}
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-violet-600/30"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
            >
              <Zap size={13} className="inline mr-1.5" />Run Evaluation
            </button>
          )}
        </motion.div>
      )}

      {/* List */}
      {!loading && !error && paginated.length > 0 && (
        <motion.div variants={stagger} className="space-y-3">
          {paginated.map((ev) => (
            <motion.div
              variants={fadeUp}
              key={ev.id}
              className="rounded-2xl p-5 flex gap-4 items-center hover:border-violet-500/30 transition-all cursor-default group"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              {/* Status line */}
              <div
                className="w-1 self-stretch rounded-full shrink-0"
                style={{
                  background: statusLine(ev.status),
                  boxShadow: `0 0 8px ${statusLine(ev.status)}60`,
                }}
              />

              {/* Main info */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-bold text-slate-100 text-sm truncate max-w-xs">{ev.model}</span>
                  <ProviderBadge provider={ev.provider} />
                  {ev.template_id && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md text-violet-300 flex items-center gap-1" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}>
                      📋 {ev.template_id}
                    </span>
                  )}
                  {ev.include_redteam === 1 && (
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-red-400" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>Red-Team</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                  {ev.dataset_filename ? (
                    <span className="text-cyan-400 font-semibold px-2 py-0.5 rounded flex items-center gap-1 text-[10px]" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                      📁 custom: {ev.dataset_filename}
                    </span>
                  ) : (
                    <span>📁 {ev.prompt_category || 'all'}</span>
                  )}
                  <span>🧪 {ev.num_tests} tests</span>
                  <span>🕐 {relativeTime(ev.created_at)}</span>
                  {ev.completed_at && (
                    <span className="text-slate-600">✓ {relativeTime(ev.completed_at)}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <StatusDot status={ev.status} />
                  {ev.status === 'completed' && (
                    <span className="text-xs text-slate-500">
                      Pass Rate: <PassBadge rate={ev.pass_rate} />
                    </span>
                  )}
                  {ev.status === 'completed' && ev.health_score > 0 && (
                    <span className="text-xs text-slate-500">
                      Health: <span className="font-bold font-mono-crisp text-violet-300">{Math.round(ev.health_score)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => navigate(`/results?model=${encodeURIComponent(ev.model)}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', color: '#22d3ee' }}
                  title="View Results"
                >
                  <BarChart2 size={12} /> Results
                </button>
                <button
                  onClick={() => navigate('/reports')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}
                  title="View Report"
                >
                  <FileText size={12} /> Report
                </button>
                {ev.status === 'completed' && (
                  <button
                    onClick={() => navigate(`/model-card?model=${encodeURIComponent(ev.model)}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.25)', color: '#f472b6' }}
                    title="Model Card"
                  >
                    <CreditCard size={12} /> Card
                  </button>
                )}
                <button
                  onClick={(e) => handleDelete(ev.id, e)}
                  disabled={deleting === ev.id}
                  className="p-2 rounded-xl text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Delete"
                >
                  <Trash2 size={12} className={deleting === ev.id ? 'animate-spin' : ''} />
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <motion.div variants={fadeUp} className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <span className="flex items-center px-3.5 py-1.5 rounded-xl text-xs font-bold text-violet-300" style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
