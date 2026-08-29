import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import {
  Trophy, GitCompare, AlertCircle, RefreshCw, Sparkles,
  TrendingUp, Shield, CheckCircle2, XCircle, Clock, Zap,
} from 'lucide-react'

const MODEL_COLORS = ['#7C3AED', '#06B6D4', '#F59E0B']
const MODEL_GLOW   = ['rgba(124,58,237,0.35)', 'rgba(6,182,212,0.35)', 'rgba(245,158,11,0.35)']

const METRICS = [
  { key: 'relevance',             label: 'Relevance',       icon: '🎯' },
  { key: 'coherence',             label: 'Coherence',       icon: '🔗' },
  { key: 'instruction_following', label: 'Instruction',     icon: '📋' },
  { key: 'safety',                label: 'Safety',          icon: '🛡️' },
  { key: 'creativity',            label: 'Creativity',      icon: '✨' },
]

function getScore(data, key) {
  if (!data || data.status !== 'available') return 0
  if (key === 'health_score') return Math.round(Number(data.health_score) || 0)
  if (key === 'pass_rate')    return Math.round(Number(data.pass_rate)    || 0)
  return Math.round(Number(data.avg_scores?.[key]) || 0)
}

function ScoreBar({ value, color, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

function WinnerChip({ model, color }) {
  return (
    <span
      className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
      style={{ background: color + '33', color, border: `1px solid ${color}66` }}
    >
      BEST
    </span>
  )
}

export default function Compare({ evalHistory }) {
  const modelsList = [...new Set(evalHistory.map((e) => e.model))]
  const defaults = modelsList.slice(0, 2)

  const [selectedModels, setSelectedModels] = useState(defaults.length >= 1 ? defaults : [])
  const [customInput, setCustomInput] = useState('')
  const [comparisonData, setComparisonData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const toggleModel = (m) => {
    if (selectedModels.includes(m)) {
      if (selectedModels.length > 1) setSelectedModels(selectedModels.filter((x) => x !== m))
    } else {
      if (selectedModels.length < 3) setSelectedModels([...selectedModels, m])
    }
  }

  const addCustomModel = () => {
    const m = customInput.trim()
    if (!m || selectedModels.includes(m) || selectedModels.length >= 3) return
    setSelectedModels([...selectedModels, m])
    setCustomInput('')
  }

  const fetchComparison = useCallback(async () => {
    if (selectedModels.length === 0) return
    setLoading(true)
    try {
      const res = await axios.get(
        `${API_BASE}/compare?models=${encodeURIComponent(selectedModels.join(','))}`
      )
      setComparisonData(res.data.comparison)
      setLastUpdated(new Date())
    } catch {
      setComparisonData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedModels])

  useEffect(() => { fetchComparison() }, [fetchComparison])

  // ── Derived data ──────────────────────────────────────────────────────────
  const availableModels = selectedModels.filter(
    (m) => comparisonData?.[m]?.status === 'available'
  )

  // Radar chart data
  const radarData = METRICS.map(({ key, label }) => {
    const row = { metric: label }
    selectedModels.forEach((m) => { row[m] = getScore(comparisonData?.[m], key) })
    return row
  })

  // Bar chart (health score + pass rate)
  const barData = selectedModels.map((m, i) => ({
    model: m.length > 18 ? m.slice(0, 16) + '…' : m,
    fullModel: m,
    'Health Score': getScore(comparisonData?.[m], 'health_score'),
    'Pass Rate':    getScore(comparisonData?.[m], 'pass_rate'),
    color: MODEL_COLORS[i % MODEL_COLORS.length],
  }))

  // Per-metric winner
  const metricWinners = {}
  METRICS.forEach(({ key }) => {
    let best = -1, winner = null
    selectedModels.forEach((m) => {
      const s = getScore(comparisonData?.[m], key)
      if (s > best) { best = s; winner = m }
    })
    metricWinners[key] = winner
  })

  // Overall winner by health score
  let overallWinner = null, topScore = -1
  selectedModels.forEach((m) => {
    const s = getScore(comparisonData?.[m], 'health_score')
    if (s > topScore) { topScore = s; overallWinner = m }
  })
  const overallWinnerIdx = selectedModels.indexOf(overallWinner)

  const hasAnyData = availableModels.length > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <GitCompare size={24} className="text-violet-400" /> Model Comparison Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Side-by-side radar analysis, metric breakdown, and winner detection across up to 3 models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-slate-600 flex items-center gap-1">
              <Clock size={10} /> {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchComparison}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-violet-500 transition-all flex items-center gap-2 text-xs font-semibold disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="rounded-2xl p-5 glass space-y-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Models to Compare (up to 3)</span>

        {/* Pills from eval history */}
        {modelsList.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {modelsList.map((m, i) => {
              const selected = selectedModels.includes(m)
              const idx = selectedModels.indexOf(m)
              const color = MODEL_COLORS[idx % MODEL_COLORS.length]
              return (
                <button
                  key={m}
                  onClick={() => toggleModel(m)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
                  style={selected
                    ? { background: color + '22', borderColor: color, color }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }
                  }
                >
                  {selected ? '✓ ' : '+ '}{m}
                </button>
              )
            })}
          </div>
        )}

        {/* Manual model input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomModel()}
            placeholder="Type a model name and press Enter (e.g. llama-3.3-70b-versatile)"
            className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
          />
          <button
            onClick={addCustomModel}
            disabled={!customInput.trim() || selectedModels.length >= 3}
            className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 disabled:opacity-40 transition-all"
          >
            Add
          </button>
        </div>

        {/* Selected models as color-coded tags */}
        {selectedModels.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {selectedModels.map((m, i) => (
              <div
                key={m}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: MODEL_COLORS[i] + '20', border: `1px solid ${MODEL_COLORS[i]}50`, color: MODEL_COLORS[i] }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: MODEL_COLORS[i] }} />
                {m}
                <button
                  onClick={() => toggleModel(m)}
                  className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No data state */}
      {!loading && !hasAnyData && (
        <div className="rounded-2xl p-12 glass flex flex-col items-center gap-4 text-center">
          <AlertCircle size={40} className="text-slate-600" />
          <div>
            <p className="text-slate-300 font-semibold">No evaluation data found</p>
            <p className="text-slate-500 text-sm mt-1">
              Run evaluations on the models above first, then come back to compare them.
            </p>
          </div>
        </div>
      )}

      {hasAnyData && (
        <>
          {/* Overall Winner Banner */}
          {overallWinner && topScore > 0 && (
            <div
              className="rounded-2xl p-5 flex items-center justify-between border"
              style={{
                background: `linear-gradient(135deg, ${MODEL_GLOW[overallWinnerIdx]}, rgba(0,0,0,0.4))`,
                borderColor: MODEL_COLORS[overallWinnerIdx] + '60',
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="p-3 rounded-xl"
                  style={{ background: MODEL_COLORS[overallWinnerIdx] + '30', border: `1px solid ${MODEL_COLORS[overallWinnerIdx]}60` }}
                >
                  <Trophy size={26} style={{ color: MODEL_COLORS[overallWinnerIdx] }} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">🏆 Best Overall Model</span>
                  <h3 className="text-lg font-bold text-white mt-0.5">{overallWinner}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Highest composite health score across all evaluation metrics</p>
                </div>
              </div>
              <div
                className="text-3xl font-black"
                style={{ color: MODEL_COLORS[overallWinnerIdx] }}
              >
                {topScore}<span className="text-lg font-semibold text-slate-500">/100</span>
              </div>
            </div>
          )}

          {/* Model Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {selectedModels.map((m, idx) => {
              const data = comparisonData?.[m]
              const noData = !data || data.status !== 'available'
              const color = MODEL_COLORS[idx % MODEL_COLORS.length]
              const isWinner = overallWinner === m
              return (
                <div
                  key={m}
                  className="rounded-2xl p-5 glass space-y-4 relative overflow-hidden"
                  style={{ borderTop: `3px solid ${color}` }}
                >
                  {/* Subtle background glow */}
                  <div
                    className="absolute inset-0 opacity-5 pointer-events-none"
                    style={{ background: `radial-gradient(circle at top left, ${color}, transparent 60%)` }}
                  />

                  <div className="flex justify-between items-start relative">
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest" style={{ color }}>Model {idx + 1}</span>
                      <h3 className="text-sm font-bold text-slate-200 mt-0.5 max-w-[160px] truncate">{m}</h3>
                      {data?.timestamp && (
                        <p className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                          <Clock size={8} /> {new Date(data.timestamp).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {isWinner && <Trophy size={20} className="text-amber-400 shrink-0" />}
                  </div>

                  {noData ? (
                    <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                      <AlertCircle size={22} className="mx-auto text-slate-700" />
                      <p>No evaluation data yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3 relative">
                      {/* Big health score */}
                      <div className="flex items-end justify-between pb-2 border-b border-white/5">
                        <span className="text-xs text-slate-500">Health Score</span>
                        <span className="text-2xl font-black" style={{ color }}>
                          {getScore(data, 'health_score')}<span className="text-sm font-normal text-slate-500">/100</span>
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/30 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-slate-500 mb-0.5">Pass Rate</p>
                          <p className="text-base font-bold" style={{ color }}>
                            {getScore(data, 'pass_rate')}%
                          </p>
                        </div>
                        <div className="bg-black/30 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-slate-500 mb-0.5">Tests Run</p>
                          <p className="text-base font-bold text-slate-300">
                            {data.total_tests || '—'}
                          </p>
                        </div>
                      </div>

                      {/* Per-metric bars */}
                      <div className="space-y-2 pt-1">
                        {METRICS.map(({ key, label, icon }) => (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                {icon} {label}
                              </span>
                              {metricWinners[key] === m && <WinnerChip model={m} color={color} />}
                            </div>
                            <ScoreBar value={getScore(data, key)} color={color} />
                          </div>
                        ))}
                      </div>

                      {/* Passed / Failed */}
                      <div className="flex gap-2 pt-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                          <CheckCircle2 size={11} />
                          {data.passed_count || 0} passed
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                          <XCircle size={11} />
                          {(data.total_tests || 0) - (data.passed_count || 0)} failed
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Radar Chart */}
            <div className="rounded-2xl p-6 glass space-y-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-violet-400" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Capability Radar</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    />
                    {selectedModels.map((m, i) => (
                      <Radar
                        key={m}
                        name={m.length > 20 ? m.slice(0, 18) + '…' : m}
                        dataKey={m}
                        stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                        fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                        fillOpacity={0.12}
                        strokeWidth={2}
                        dot={{ r: 3, fill: MODEL_COLORS[i % MODEL_COLORS.length] }}
                      />
                    ))}
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                      formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart — Health & Pass Rate */}
            <div className="rounded-2xl p-6 glass space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-cyan-400" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Health Score vs Pass Rate</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="model" stroke="#475569" fontSize={10} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={10} domain={[0, 100]} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#0F0F17',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      formatter={(v, name) => [`${v}%`, name]}
                      labelFormatter={(l, p) => p?.[0]?.payload?.fullModel || l}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <Bar dataKey="Health Score" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} fillOpacity={0.9} />
                      ))}
                    </Bar>
                    <Bar dataKey="Pass Rate" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} fillOpacity={0.4} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Head-to-Head Metric Table */}
          <div className="rounded-2xl p-6 glass space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Head-to-Head Metric Breakdown</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left text-[11px] text-slate-500 font-semibold pb-3 pr-4">Metric</th>
                    {selectedModels.map((m, i) => (
                      <th
                        key={m}
                        className="text-center text-[11px] font-bold pb-3 px-4"
                        style={{ color: MODEL_COLORS[i % MODEL_COLORS.length] }}
                      >
                        {m.length > 22 ? m.slice(0, 20) + '…' : m}
                      </th>
                    ))}
                    <th className="text-center text-[11px] text-amber-400 font-bold pb-3 pl-4">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'health_score', label: '🏅 Health Score' },
                    { key: 'pass_rate',    label: '✅ Pass Rate (%)' },
                    ...METRICS.map(({ key, label, icon }) => ({ key, label: `${icon} ${label}` })),
                  ].map(({ key, label }) => {
                    let winner = null, best = -1
                    selectedModels.forEach((m) => {
                      const s = getScore(comparisonData?.[m], key)
                      if (s > best) { best = s; winner = m }
                    })
                    return (
                      <tr key={key} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                        <td className="py-3 pr-4 text-xs text-slate-400 font-medium">{label}</td>
                        {selectedModels.map((m, i) => {
                          const score = getScore(comparisonData?.[m], key)
                          const isWin = winner === m && score > 0
                          return (
                            <td key={m} className="py-3 px-4 text-center">
                              <span
                                className="text-sm font-bold"
                                style={{ color: isWin ? MODEL_COLORS[i % MODEL_COLORS.length] : '#64748b' }}
                              >
                                {comparisonData?.[m]?.status === 'available' ? score : '—'}
                              </span>
                            </td>
                          )
                        })}
                        <td className="py-3 pl-4 text-center">
                          {winner && best > 0 ? (
                            <span
                              className="text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{
                                background: MODEL_COLORS[selectedModels.indexOf(winner) % MODEL_COLORS.length] + '25',
                                color: MODEL_COLORS[selectedModels.indexOf(winner) % MODEL_COLORS.length],
                              }}
                            >
                              {winner.length > 16 ? winner.slice(0, 14) + '…' : winner}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
