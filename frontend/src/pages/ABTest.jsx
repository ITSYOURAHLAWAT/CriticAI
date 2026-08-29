import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Swords, Trophy, Play, Square, ChevronDown, Zap,
  CheckCircle2, XCircle, Minus, BarChart3, Loader2,
  TrendingUp, Clock, Target, Crown, RefreshCw, List
} from 'lucide-react'
import { API_BASE, QUICK_MODELS, PROMPT_CATEGORIES, PROVIDER_COLORS } from '../config'
import { fadeUp, stagger } from '../lib/animations'

const RESULT_COLORS = {
  pass:    { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
  partial: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fbbf24' },
  fail:    { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#f87171' },
}

function WinnerBadge({ winner, side }) {
  if (winner !== side) return null
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#fbbf24' }}
    >
      <Crown size={9} />WIN
    </span>
  )
}

function ResultPill({ result }) {
  const c = RESULT_COLORS[result] || RESULT_COLORS.partial
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase font-mono-crisp"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {result}
    </span>
  )
}

function ModelSelect({ label, value, onChange, providerValue, onProviderChange, colorHex }) {
  return (
    <div
      className="flex-1 rounded-2xl p-4 transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${colorHex}44`,
        boxShadow: `0 0 24px ${colorHex}14`,
      }}
    >
      <div
        className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"
        style={{ color: colorHex }}
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black"
          style={{ background: colorHex }}
        >
          {label}
        </span>
        Model {label}
      </div>

      <div className="relative mb-2">
        <select
          value={providerValue}
          onChange={e => onProviderChange(e.target.value)}
          className="w-full text-xs rounded-xl px-3 py-2 pr-8 appearance-none font-medium focus:outline-none cursor-pointer"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: '#cbd5e1',
          }}
        >
          <option value="groq">Groq (Free)</option>
          <option value="gemini">Gemini (Free)</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full text-xs rounded-xl px-3 py-2.5 pr-8 appearance-none font-semibold focus:outline-none cursor-pointer font-mono-crisp"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: '#e2e8f0',
          }}
        >
          {QUICK_MODELS
            .filter(m => m.provider.toLowerCase() === providerValue)
            .map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>

      <p className="text-[10px] text-slate-600 mt-2 font-mono-crisp truncate">{value}</p>
    </div>
  )
}

function StatCard({ label, valueA, valueB, unitA = '', unitB = '', winnerSide, colorA, colorB }) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-2xl font-black font-mono-crisp" style={{ color: colorA }}>
            {valueA}{unitA}
          </span>
          {winnerSide === 'a' && <Crown size={12} className="inline ml-1 mb-1 text-amber-400" />}
        </div>
        <span className="text-slate-600 text-xs font-bold">vs</span>
        <div>
          <span className="text-2xl font-black font-mono-crisp" style={{ color: colorB }}>
            {valueB}{unitB}
          </span>
          {winnerSide === 'b' && <Crown size={12} className="inline ml-1 mb-1 text-amber-400" />}
        </div>
      </div>
    </div>
  )
}

function PastSessions({ onLoad }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/ab-tests?limit=20`)
      .then(r => r.json())
      .then(data => { setSessions(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={20} className="animate-spin text-violet-400" />
    </div>
  )
  if (!sessions.length) return (
    <p className="text-center text-slate-500 text-xs py-8">No past A/B tests yet.</p>
  )

  return (
    <div className="space-y-2">
      {sessions.map(s => (
        <button
          key={s.id}
          onClick={() => onLoad(s.id)}
          className="w-full text-left rounded-xl p-3 transition-all hover:bg-white/5 group"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate font-mono-crisp">
                {s.model_a} <span className="text-slate-500">vs</span> {s.model_b}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {s.prompt_category} · {s.num_tests} tests ·{' '}
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right shrink-0">
              {s.winner_name && (
                <p className="text-xs font-bold text-amber-400 flex items-center gap-1">
                  <Crown size={10} />{s.winner_name.split('-')[0]}
                </p>
              )}
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                style={{
                  background: s.status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  color: s.status === 'completed' ? '#34d399' : '#f87171',
                }}
              >
                {s.status}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

export default function ABTest() {
  const [modelA, setModelA] = useState('llama-3.3-70b-versatile')
  const [modelB, setModelB] = useState('gemma2-9b-it')
  const [providerA, setProviderA] = useState('groq')
  const [providerB, setProviderB] = useState('groq')
  const [category, setCategory] = useState('all')
  const [numTests, setNumTests] = useState(10)

  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [testResults, setTestResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [abId, setAbId] = useState(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const [showPast, setShowPast] = useState(false)
  const [loadingPast, setLoadingPast] = useState(false)

  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const logEndRef = useRef(null)

  const colorA = '#7C3AED'
  const colorB = '#06B6D4'

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (isRunning) {
      startRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsedSecs(Math.floor((Date.now() - startRef.current) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  useEffect(() => {
    const first = QUICK_MODELS.find(m => m.provider.toLowerCase() === providerA)
    if (first) setModelA(first.value)
  }, [providerA])

  useEffect(() => {
    const first = QUICK_MODELS.find(m => m.provider.toLowerCase() === providerB)
    if (first) setModelB(first.value)
  }, [providerB])

  const addLog = (emoji, msg) => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      emoji,
      msg,
      time: new Date().toLocaleTimeString(),
    }])
  }

  const startTest = async () => {
    if (modelA === modelB && providerA === providerB) {
      toast.error('Model A and Model B must be different!')
      return
    }

    setIsRunning(true)
    setLogs([])
    setTestResults([])
    setSummary(null)
    setAbId(null)
    setElapsedSecs(0)
    setProgress({ current: 0, total: numTests })

    addLog('🚀', `Starting A/B test — ${modelA} vs ${modelB}`)
    addLog('⚙️', `Category: ${category} · Tests: ${numTests}`)

    const controller = new AbortController()
    abortRef.current = controller

    const payload = {
      model_a: modelA,
      model_b: modelB,
      provider_a: providerA,
      provider_b: providerB,
      prompt_category: category,
      num_tests: Number(numTests),
    }

    try {
      const response = await fetch(`${API_BASE}/ab-test/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(err || `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          let event
          try { event = JSON.parse(line.slice(5).trim()) } catch { continue }

          const { stage, message } = event

          const emoji = {
            ab_start: '🚀', ab_test_start: '🧪',
            ab_model_a: '🟣', ab_model_b: '🔵',
            ab_judge: '⚖️', ab_test_done: '✅',
            ab_complete: '🏆', ab_error: '❌',
          }[stage] || '⚡'

          addLog(emoji, message)

          if (event.ab_id) setAbId(event.ab_id)

          if (stage === 'ab_start') {
            setProgress({ current: 0, total: event.total_tests || numTests })
          }

          if (stage === 'ab_test_done') {
            const tr = event.result
            if (tr) {
              setTestResults(prev => [...prev, tr])
            }
            setProgress(prev => ({ ...prev, current: event.test_num || prev.current }))
          }

          if (stage === 'ab_complete') {
            const sum = event.summary
            setSummary(sum)
            setIsRunning(false)
            const winnerName = sum?.winner_name || 'Tie'
            toast.success(`🏆 Winner: ${winnerName}!`, { duration: 6000 })
          }

          if (stage === 'ab_error') {
            toast.error(`A/B Test failed: ${message}`)
            setIsRunning(false)
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      const msg = err.message === 'Failed to fetch'
        ? 'Backend offline — start FastAPI on port 8000'
        : err.message || 'Unknown error'
      addLog('❌', msg)
      toast.error(msg)
      setIsRunning(false)
    }
  }

  const stopTest = () => {
    abortRef.current?.abort()
    setIsRunning(false)
    addLog('🛑', 'Test cancelled by user.')
    toast('Test stopped', { icon: '🛑' })
  }

  const loadPastSession = async (id) => {
    setLoadingPast(true)
    try {
      const res = await fetch(`${API_BASE}/ab-test/${id}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setAbId(data.id)
      setModelA(data.model_a)
      setModelB(data.model_b)
      setProviderA(data.provider_a || 'groq')
      setProviderB(data.provider_b || 'groq')
      setCategory(data.prompt_category || 'all')
      setNumTests(data.num_tests || 10)
      setTestResults(data.results || [])
      setSummary({
        model_a: data.model_a,
        model_b: data.model_b,
        provider_a: data.provider_a,
        provider_b: data.provider_b,
        category: data.prompt_category,
        total_tests: data.num_tests,
        wins_a: data.wins_a,
        wins_b: data.wins_b,
        ties: data.ties,
        avg_score_a: data.avg_score_a,
        avg_score_b: data.avg_score_b,
        overall_winner: data.overall_winner,
        winner_name: data.winner_name,
        test_results: data.results,
      })
      setShowPast(false)
      toast.success('Past session loaded!')
    } catch {
      toast.error('Failed to load session.')
    }
    setLoadingPast(false)
  }

  const progressPct = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-6 max-w-6xl mx-auto"
    >
      <motion.div variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="p-2 rounded-xl"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}
            >
              <Swords size={20} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">A/B Testing Mode</h1>
          </div>
          <p className="text-xs text-slate-500">
            Run identical prompts against two models simultaneously — compare scores, declare winners, and benchmark scientifically.
          </p>
        </div>
        <button
          onClick={() => setShowPast(s => !s)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: showPast ? 'rgba(124,58,237,0.2)' : 'var(--bg-elevated)',
            border: `1px solid ${showPast ? 'rgba(124,58,237,0.4)' : 'var(--border-subtle)'}`,
            color: showPast ? '#a78bfa' : '#94a3b8',
          }}
        >
          <List size={13} />
          Past Tests
        </button>
      </motion.div>

      {showPast && (
        <motion.div
          variants={fadeUp}
          className="rounded-2xl p-5"
          style={{ background: 'var(--bg-surface)', border: '1px solid rgba(124,58,237,0.2)' }}
        >
          <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
            <List size={13} className="text-violet-400" /> Past A/B Test Sessions
          </h3>
          {loadingPast ? (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="animate-spin text-violet-400" />
            </div>
          ) : (
            <PastSessions onLoad={loadPastSession} />
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <motion.div variants={fadeUp} className="xl:col-span-2 space-y-4">
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <h3 className="text-xs font-bold text-slate-300 mb-4 flex items-center gap-2">
              <Target size={13} className="text-violet-400" />
              Select Models to Compare
            </h3>
            <div className="flex flex-col gap-3">
              <ModelSelect
                label="A"
                value={modelA}
                onChange={setModelA}
                providerValue={providerA}
                onProviderChange={setProviderA}
                colorHex={colorA}
              />
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                <div
                  className="px-3 py-1 rounded-full text-xs font-black text-slate-500"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  VS
                </div>
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              </div>
              <ModelSelect
                label="B"
                value={modelB}
                onChange={setModelB}
                providerValue={providerB}
                onProviderChange={setProviderB}
                colorHex={colorB}
              />
            </div>
          </div>

          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <BarChart3 size={13} className="text-cyan-400" />
              Test Configuration
            </h3>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Prompt Category</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full text-xs rounded-xl px-3 py-2.5 pr-8 appearance-none focus:outline-none cursor-pointer"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#e2e8f0',
                  }}
                  disabled={isRunning}
                >
                  {PROMPT_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Number of Tests</label>
                <span
                  className="text-xs font-black font-mono-crisp px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}
                >
                  {numTests}
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={30}
                step={1}
                value={numTests}
                onChange={e => setNumTests(Number(e.target.value))}
                disabled={isRunning}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-violet-500"
              />
              <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                <span>3</span>
                <span className="text-amber-500/60">⚠ max 30 (rate limit)</span>
                <span>30</span>
              </div>
            </div>

            {!isRunning ? (
              <button
                onClick={startTest}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all text-white shadow-lg shadow-violet-600/30 active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg,#7C3AED,#06B6D4)',
                }}
              >
                <Play size={14} />
                Start A/B Test
              </button>
            ) : (
              <button
                onClick={stopTest}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
              >
                <Square size={14} />
                Stop Test
              </button>
            )}
          </div>

          {(isRunning || (progress.current > 0)) && !summary && (
            <div
              className="rounded-2xl p-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(124,58,237,0.2)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-violet-400" />
                  Running tests…
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1 font-mono-crisp">
                  <Clock size={11} />{elapsedSecs}s
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background: 'linear-gradient(90deg, #7C3AED, #06B6D4)',
                    boxShadow: '0 0 8px rgba(124,58,237,0.6)',
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 mt-1 font-mono-crisp">
                <span>Test {progress.current} / {progress.total}</span>
                <span>{progressPct}%</span>
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="px-4 py-2 text-[10px] font-bold text-slate-500 flex items-center gap-2 uppercase tracking-widest"
                style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
              >
                <Zap size={10} className="text-amber-400" /> Live Log
              </div>
              <div className="max-h-44 overflow-y-auto p-3 space-y-1 font-mono-crisp text-[11px]">
                {logs.map(l => (
                  <div key={l.id} className="flex items-start gap-2 text-slate-400">
                    <span className="text-slate-600 shrink-0">{l.time}</span>
                    <span>{l.emoji}</span>
                    <span className="break-all">{l.msg}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </motion.div>

        <motion.div variants={fadeUp} className="xl:col-span-3 space-y-4">
          {summary && (
            <>
              <div
                className="rounded-2xl p-6 text-center relative overflow-hidden"
                style={{
                  background: summary.overall_winner === 'tie'
                    ? 'rgba(148,163,184,0.06)'
                    : summary.overall_winner === 'a'
                      ? 'rgba(124,58,237,0.1)'
                      : 'rgba(6,182,212,0.1)',
                  border: `1px solid ${summary.overall_winner === 'tie' ? 'rgba(148,163,184,0.2)' : summary.overall_winner === 'a' ? 'rgba(124,58,237,0.35)' : 'rgba(6,182,212,0.35)'}`,
                }}
              >
                <div className="text-4xl mb-2">
                  {summary.overall_winner === 'tie' ? '🤝' : '🏆'}
                </div>
                <h2 className="text-xl font-black text-white mb-1">
                  {summary.overall_winner === 'tie'
                    ? "It's a Tie!"
                    : `${summary.winner_name} Wins!`}
                </h2>
                <p className="text-xs text-slate-400 font-mono-crisp">
                  {summary.wins_a} wins · {summary.ties} ties · {summary.wins_b} wins
                </p>

                <div className="flex justify-center gap-4 mt-4 font-mono-crisp">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorA }} />
                    <span className="text-xs font-semibold text-slate-300">A: {summary.model_a}</span>
                  </div>
                  <span className="text-slate-600 text-xs">vs</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorB }} />
                    <span className="text-xs font-semibold text-slate-300">B: {summary.model_b}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Wins"
                  valueA={summary.wins_a}
                  valueB={summary.wins_b}
                  winnerSide={summary.wins_a > summary.wins_b ? 'a' : summary.wins_b > summary.wins_a ? 'b' : null}
                  colorA={colorA}
                  colorB={colorB}
                />
                <StatCard
                  label="Avg Score"
                  valueA={summary.avg_score_a}
                  valueB={summary.avg_score_b}
                  winnerSide={summary.avg_score_a > summary.avg_score_b ? 'a' : summary.avg_score_b > summary.avg_score_a ? 'b' : null}
                  colorA={colorA}
                  colorB={colorB}
                />
                <StatCard
                  label="Ties"
                  valueA={summary.ties}
                  valueB={summary.total_tests}
                  unitB=" total"
                  colorA="#94a3b8"
                  colorB="#64748b"
                />
              </div>
            </>
          )}

          {!summary && testResults.length === 0 && !isRunning && (
            <div
              className="rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="p-4 rounded-2xl"
                style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}
              >
                <Swords size={30} className="text-violet-400" />
              </div>
              <div>
                <p className="text-slate-300 font-semibold text-sm">Ready to battle</p>
                <p className="text-xs text-slate-600 mt-1">
                  Select two models and press "Start A/B Test"
                </p>
              </div>
            </div>
          )}

          {testResults.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500"
                style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
              >
                <div className="col-span-1">#</div>
                <div className="col-span-3">Prompt</div>
                <div className="col-span-1 text-center">Cat</div>
                <div className="col-span-3 text-center" style={{ color: colorA }}>Model A</div>
                <div className="col-span-3 text-center" style={{ color: colorB }}>Model B</div>
                <div className="col-span-1 text-center">Winner</div>
              </div>

              <div className="divide-y" style={{ divideColor: 'var(--border-subtle)' }}>
                {testResults.map((tr) => (
                  <TestRow
                    key={tr.test_num}
                    tr={tr}
                    modelAName={modelA}
                    modelBName={modelB}
                    colorA={colorA}
                    colorB={colorB}
                  />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

function TestRow({ tr, modelAName, modelBName, colorA, colorB }) {
  const [expanded, setExpanded] = useState(false)

  const winnerBg = tr.winner === 'a'
    ? 'rgba(124,58,237,0.05)'
    : tr.winner === 'b'
      ? 'rgba(6,182,212,0.05)'
      : 'transparent'

  return (
    <>
      <div
        className="grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        style={{ background: winnerBg }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="col-span-1 flex items-center">
          <span className="text-xs font-bold text-slate-500 font-mono-crisp">{tr.test_num}</span>
        </div>
        <div className="col-span-3 flex items-center">
          <p className="text-xs text-slate-300 line-clamp-2 leading-snug">{tr.prompt}</p>
        </div>
        <div className="col-span-1 flex items-center justify-center">
          <span className="text-[9px] font-semibold text-slate-500 uppercase">{tr.category?.slice(0, 4)}</span>
        </div>
        <div className="col-span-3 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1.5">
            <WinnerBadge winner={tr.winner} side="a" />
            <span className="text-base font-black font-mono-crisp" style={{ color: colorA }}>{tr.score_a}</span>
          </div>
          <ResultPill result={tr.result_a} />
        </div>
        <div className="col-span-3 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1.5">
            <WinnerBadge winner={tr.winner} side="b" />
            <span className="text-base font-black font-mono-crisp" style={{ color: colorB }}>{tr.score_b}</span>
          </div>
          <ResultPill result={tr.result_b} />
        </div>
        <div className="col-span-1 flex items-center justify-center">
          {tr.winner === 'a' && <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorA, boxShadow: `0 0 6px ${colorA}` }} />}
          {tr.winner === 'b' && <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorB, boxShadow: `0 0 6px ${colorB}` }} />}
          {tr.winner === 'tie' && <Minus size={12} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div
          className="px-4 pb-4 grid grid-cols-2 gap-4 text-xs font-mono-crisp"
          style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
        >
          <div className="col-span-2 pt-3">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Prompt</p>
            <p className="text-slate-300 leading-relaxed">{tr.prompt}</p>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: `${colorA}0d`, border: `1px solid ${colorA}22` }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: colorA }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colorA }}>
                Model A — {tr.score_a}/100
              </span>
              {tr.is_simulated_a && (
                <span className="text-[9px] text-slate-600 ml-1">[sim]</span>
              )}
            </div>
            <p className="text-slate-400 leading-relaxed line-clamp-6">{tr.response_a}</p>
            {tr.reasoning_a && (
              <p className="text-[10px] text-slate-600 mt-2 italic border-t border-white/5 pt-2">
                Judge: {tr.reasoning_a}
              </p>
            )}
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: `${colorB}0d`, border: `1px solid ${colorB}22` }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: colorB }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colorB }}>
                Model B — {tr.score_b}/100
              </span>
              {tr.is_simulated_b && (
                <span className="text-[9px] text-slate-600 ml-1">[sim]</span>
              )}
            </div>
            <p className="text-slate-400 leading-relaxed line-clamp-6">{tr.response_b}</p>
            {tr.reasoning_b && (
              <p className="text-[10px] text-slate-600 mt-2 italic border-t border-white/5 pt-2">
                Judge: {tr.reasoning_b}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
