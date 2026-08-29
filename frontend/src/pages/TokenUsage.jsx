import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { API_BASE } from '../config'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  Gauge, Clock, Activity, Cpu, Server, Copy, Check, AlertTriangle, ShieldCheck, Sparkles, RefreshCw, Zap
} from 'lucide-react'

// Custom animated counter hook
function useAnimatedCounter(targetValue, duration = 1500) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let start = 0
    const end = parseFloat(targetValue) || 0
    if (end === 0) {
      setCount(0)
      return
    }
    const startTime = performance.now()

    const updateCounter = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out quad
      const current = start + (end - start) * (1 - (1 - progress) * (1 - progress))
      setCount(current)

      if (progress < 1) {
        requestAnimationFrame(updateCounter)
      } else {
        setCount(end)
      }
    }

    requestAnimationFrame(updateCounter)
  }, [targetValue, duration])

  return count
}

export default function TokenUsage() {
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [chartTab, setChartTab] = useState('requests') // 'requests' | 'tokens'
  const [copied, setCopied] = useState(false)

  const fetchData = async () => {
    try {
      const [statsRes, historyRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/usage/stats`),
        axios.get(`${API_BASE}/usage/history?days=7`),
        axios.get(`${API_BASE}/usage/log?limit=50`)
      ])
      setStats(statsRes.data || null)
      setHistory(historyRes.data || [])
      setLogs(logsRes.data || [])
    } catch (err) {
      console.error('Error fetching usage data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Savings animation counter
  const savedGpt4oTarget = stats?.savings?.vs_gpt4o || 0
  const animatedSavedGpt4o = useAnimatedCounter(savedGpt4oTarget, 1500)

  // Overall status computation
  const overallStatus = useMemo(() => {
    if (!stats?.providers) return { color: 'emerald', message: '🟢 All API providers healthy', level: 'healthy' }
    const groqStat = stats.providers.groq?.status || 'healthy'
    const geminiStat = stats.providers.gemini?.status || 'healthy'

    if (groqStat === 'critical' || geminiStat === 'critical') {
      const name = groqStat === 'critical' ? 'Groq' : 'Gemini'
      return { color: 'red', message: `🔴 ${name} daily limit reached — using fallback`, level: 'critical' }
    }
    if (groqStat === 'warning' || geminiStat === 'warning') {
      const name = groqStat === 'warning' ? 'Groq' : 'Gemini'
      const pct = stats.providers[name.toLowerCase()]?.today?.tokens_pct_used || 80
      return { color: 'yellow', message: `🟡 ${name} approaching daily limit (${pct}% used)`, level: 'warning' }
    }
    return { color: 'emerald', message: '🟢 All API providers healthy', level: 'healthy' }
  }, [stats])

  // Chart data formatting
  const chartData = useMemo(() => {
    const dayMap = {}
    // Pre-fill last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
      dayMap[dateStr] = { date: dateStr, dayName, groq: 0, gemini: 0, ollama: 0 }
    }

    history.forEach((row) => {
      const day = row.day
      const provider = (row.provider || '').toLowerCase()
      if (dayMap[day] && ['groq', 'gemini', 'ollama'].includes(provider)) {
        if (chartTab === 'requests') {
          dayMap[day][provider] += Number(row.requests || 0)
        } else {
          dayMap[day][provider] += Number(row.tokens || 0)
        }
      }
    })

    return Object.values(dayMap)
  }, [history, chartTab])

  // Primary Provider calculation
  const primaryProvider = useMemo(() => {
    if (!stats?.providers) return { name: 'Groq', pct: 0 }
    const groqReqs = stats.providers.groq?.session?.requests || 0
    const geminiReqs = stats.providers.gemini?.session?.requests || 0
    const ollamaReqs = stats.providers.ollama?.session?.requests || 0
    const total = groqReqs + geminiReqs + ollamaReqs
    if (total === 0) return { name: 'Groq', pct: 0 }

    if (groqReqs >= geminiReqs && groqReqs >= ollamaReqs) {
      return { name: 'Groq', pct: Math.round((groqReqs / total) * 100) }
    } else if (geminiReqs >= ollamaReqs) {
      return { name: 'Gemini', pct: Math.round((geminiReqs / total) * 100) }
    } else {
      return { name: 'Ollama', pct: Math.round((ollamaReqs / total) * 100) }
    }
  }, [stats])

  const copyShareQuote = () => {
    const text = `I saved ~$${savedGpt4oTarget.toFixed(2)} on LLM API costs using CriticAI's free API stack 🚀\n#LLM #AI #CriticAI`
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Share quote copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const resetTime = stats?.providers?.groq?.today?.reset_in || '24h 00m'

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-12 bg-white/5 rounded-2xl w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-48 bg-white/5 rounded-2xl" />
          <div className="h-48 bg-white/5 rounded-2xl" />
          <div className="h-48 bg-white/5 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <Gauge size={24} className="text-violet-400" /> Token Usage & Cost Tracker
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Track daily API usage vs free tier limits and calculate cost savings vs paid LLMs.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 rounded-xl glass border border-white/10 text-slate-300 hover:text-white hover:border-violet-500/40 transition-all flex items-center gap-2 text-xs font-semibold"
        >
          <RefreshCw size={14} className="text-violet-400" /> Refresh
        </button>
      </div>

      {/* ── SECTION 1 — Live Status Bar ── */}
      <div
        className={`rounded-2xl p-4 flex items-center justify-between border transition-all ${
          overallStatus.level === 'critical'
            ? 'bg-red-500/10 border-red-500/30 text-red-200'
            : overallStatus.level === 'warning'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
        }`}
      >
        <div className="flex items-center gap-3">
          {overallStatus.level === 'healthy' ? (
            <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={20} className="text-amber-400 shrink-0 animate-pulse" />
          )}
          <span className="font-bold text-sm">{overallStatus.message}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
          <Clock size={14} className="text-cyan-400" />
          <span>Resets in: <strong className="text-white font-mono">{resetTime}</strong></span>
        </div>
      </div>

      {/* ── SECTION 2 — Provider Cards Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['groq', 'gemini', 'ollama'].map((pKey) => {
          const isOllama = pKey === 'ollama'
          const pData = stats?.providers?.[pKey] || {}
          const today = pData.today || {}
          const limits = pData.limits || {}
          const status = pData.status || 'healthy'

          const reqsPct = today.requests_pct_used || 0
          const toksPct = today.tokens_pct_used || 0

          const reqsCap = limits.daily_requests || 14400
          const toksCap = limits.daily_tokens || 500000

          const reqsColor = reqsPct > 90 ? 'bg-red-500' : reqsPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
          const toksColor = toksPct > 90 ? 'bg-red-500' : toksPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'

          return (
            <div
              key={pKey}
              className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                isOllama
                  ? 'bg-cyan-500/10 border-cyan-500/20 shadow-lg shadow-cyan-500/5'
                  : 'glass border-white/10 hover:border-violet-500/30'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {pKey === 'groq' ? '⚡' : pKey === 'gemini' ? '✦' : '🖥️'}
                    </span>
                    <h3 className="font-bold text-white uppercase text-sm tracking-wider">{pKey}</h3>
                  </div>

                  {isOllama ? (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Local
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border capitalize ${
                        status === 'critical'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse'
                          : status === 'warning'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {status}
                    </span>
                  )}
                </div>

                {/* Progress bars or local unlimited notice */}
                {isOllama ? (
                  <div className="space-y-3 py-4 text-center">
                    <span className="text-3xl">♾️</span>
                    <h4 className="font-bold text-cyan-300 text-sm">Unlimited — Local inference</h4>
                    <p className="text-xs text-slate-400">No API limits apply to Ollama models running on your machine.</p>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    {/* Requests progress */}
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Today's Requests</span>
                        <span className="font-semibold text-slate-200">
                          {today.requests?.toLocaleString() || 0} / {reqsCap.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/5">
                        <div
                          className={`h-full transition-all duration-500 ${reqsColor}`}
                          style={{ width: `${Math.min(reqsPct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-500 text-right mt-0.5">{reqsPct}% used</div>
                    </div>

                    {/* Tokens progress */}
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Today's Tokens</span>
                        <span className="font-semibold text-slate-200">
                          {today.tokens_total ? `${(today.tokens_total / 1000).toFixed(1)}k` : '0'} / {(toksCap / 1000).toFixed(0)}k
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/5">
                        <div
                          className={`h-full transition-all duration-500 ${toksColor}`}
                          style={{ width: `${Math.min(toksPct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-500 text-right mt-0.5">{toksPct}% used</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-4 mt-4 border-t border-white/5 flex justify-between text-[11px] text-slate-400">
                <span>Session: <strong className="text-slate-200">{pData.session?.requests || 0} calls</strong></span>
                <span>RPM Limit: <strong className="text-slate-200">{limits.rpm || 999}/min</strong></span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── SECTION 3 — 💰 Savings Calculator ── */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-cyan-600/10 border border-violet-500/30 space-y-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles size={18} className="text-violet-400" /> Money Saved by Using Free APIs
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Estimated savings calculated against proprietary paid API rates as of 2024.
            </p>
          </div>

          <div className="bg-black/40 px-4 py-3 rounded-2xl border border-violet-500/30 text-center md:text-right shrink-0">
            <span className="text-[11px] text-slate-400 block font-medium">Estimated Saved This Session</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              ~${animatedSavedGpt4o.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500 block">vs GPT-4o pricing</span>
          </div>
        </div>

        {/* 3 Comparison Rows */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-300 block font-semibold">vs GPT-4o</span>
              <span className="text-[10px] text-slate-500">$0.005 / 1k tokens</span>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              ~${(stats?.savings?.vs_gpt4o || 0).toFixed(2)} 💚
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-300 block font-semibold">vs GPT-4</span>
              <span className="text-[10px] text-slate-500">$0.030 / 1k tokens</span>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              ~${(stats?.savings?.vs_gpt4 || 0).toFixed(2)} 💚
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-300 block font-semibold">vs GPT-3.5 Turbo</span>
              <span className="text-[10px] text-slate-500">$0.002 / 1k tokens</span>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              ~${(stats?.savings?.vs_gpt35 || 0).toFixed(2)} 💚
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center italic">
          You've processed <strong className="text-slate-200">{(stats?.savings?.tokens_processed || 0).toLocaleString()}</strong> total tokens across <strong className="text-slate-200">{stats?.totals?.all_time_requests || 0}</strong> API calls for <strong className="text-emerald-400">$0.00</strong>
        </p>

        {/* Shareable Quote Card */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-300 font-mono italic">
            "I saved ~${(stats?.savings?.vs_gpt4o || 0).toFixed(2)} on LLM API costs using CriticAI's free API stack 🚀 #LLM #AI #CriticAI"
          </div>
          <button
            onClick={copyShareQuote}
            className="px-3.5 py-1.5 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/40 hover:bg-violet-600 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 shrink-0"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy Quote'}
          </button>
        </div>
      </div>

      {/* ── SECTION 4 — 7-Day Usage Chart ── */}
      <div className="rounded-2xl glass p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-white text-sm">API Usage — Last 7 Days</h3>
          <div className="flex gap-1 p-1 rounded-xl bg-black/40 border border-white/5">
            {['requests', 'tokens'].map((tab) => (
              <button
                key={tab}
                onClick={() => setChartTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                  chartTab === tab ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="dayName" stroke="#64748B" fontSize={11} />
              <YAxis stroke="#64748B" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0F0C1E', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="groq" name="Groq" fill="#7C3AED" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gemini" name="Gemini" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ollama" name="Ollama" fill="#06B6D4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── SECTION 5 — Session Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl glass p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Clock size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Session Duration</span>
            <span className="font-bold text-white text-base">
              {stats?.session_duration_minutes ? `${Math.floor(stats.session_duration_minutes / 60)}h ${Math.floor(stats.session_duration_minutes % 60)}m` : '0m'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl glass p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Activity size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Total API Calls</span>
            <span className="font-bold text-white text-base">
              {stats?.totals?.session_requests?.toLocaleString() || 0} calls
            </span>
          </div>
        </div>

        <div className="rounded-2xl glass p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Cpu size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Total Tokens Processed</span>
            <span className="font-bold text-white text-base">
              {stats?.totals?.session_tokens?.toLocaleString() || 0} tokens
            </span>
          </div>
        </div>

        <div className="rounded-2xl glass p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Server size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Primary Provider</span>
            <span className="font-bold text-white text-base">
              {primaryProvider.name} ({primaryProvider.pct}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── SECTION 6 — Recent API Call Log ── */}
      <div className="rounded-2xl glass p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-white text-sm">Recent API Call Log</h3>
          <span className="text-xs text-slate-400">Showing last {logs.length} calls</span>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 space-y-2">
            <Zap size={32} className="mx-auto text-slate-600" />
            <p className="font-semibold text-xs">No API calls recorded yet</p>
            <p className="text-[11px]">Run an evaluation or prompt test to start tracking token usage.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                  <th className="pb-3 px-3">Time</th>
                  <th className="pb-3 px-3">Provider</th>
                  <th className="pb-3 px-3">Model</th>
                  <th className="pb-3 px-3">Type</th>
                  <th className="pb-3 px-3 text-right">Tokens In</th>
                  <th className="pb-3 px-3 text-right">Tokens Out</th>
                  <th className="pb-3 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => {
                  const p = (log.provider || '').toLowerCase()
                  const borderColor =
                    p === 'groq'
                      ? 'border-l-violet-500'
                      : p === 'gemini'
                      ? 'border-l-blue-500'
                      : p === 'ollama'
                      ? 'border-l-cyan-500'
                      : 'border-l-slate-600'

                  const typePill =
                    log.request_type === 'evaluation'
                      ? 'bg-violet-500/20 text-violet-300'
                      : log.request_type === 'playground'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : log.request_type === 'summary'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'

                  return (
                    <tr key={log.id} className={`hover:bg-white/5 transition-colors border-l-2 ${borderColor}`}>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white uppercase">{log.provider}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300 truncate max-w-[150px]">{log.model}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${typePill}`}>
                          {log.request_type || 'chat'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {log.tokens_input?.toLocaleString() || 0}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {log.tokens_output?.toLocaleString() || 0}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200">
                        {log.tokens_total?.toLocaleString() || 0}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
