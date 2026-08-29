import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'
import { API_BASE } from '../config'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import {
  TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Activity, History, ArrowUpRight, ArrowDownRight, Minus, Zap, ChevronRight, Filter
} from 'lucide-react'
import { fadeUp, stagger } from '../lib/animations'

export default function Regression() {
  const [modelsRegression, setModelsRegression] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const preselectedModel = searchParams.get('model')

  const fetchRegressionData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/regression`)
      const data = res.data || []
      setModelsRegression(data)

      if (data.length > 0) {
        if (preselectedModel) {
          const found = data.find(m => m.model === preselectedModel)
          setSelectedModel(found || data[0])
        } else {
          const critical = data.find(m => m.trend_analysis?.health === 'critical')
          setSelectedModel(critical || data[0])
        }
      }
    } catch (err) {
      console.error('Error fetching regression data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRegressionData()
  }, [preselectedModel])

  const selectedModelData = useMemo(() => {
    if (!selectedModel) return null
    return modelsRegression.find(m => m.model === selectedModel.model) || selectedModel
  }, [selectedModel, modelsRegression])

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 bg-white/5 rounded-2xl w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-32 bg-white/5 rounded-2xl" />
          <div className="h-32 bg-white/5 rounded-2xl" />
          <div className="h-32 bg-white/5 rounded-2xl" />
          <div className="h-32 bg-white/5 rounded-2xl" />
        </div>
        <div className="h-96 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  const hasModelsWithHistory = modelsRegression.length > 0

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="p-6 max-w-7xl mx-auto space-y-6"
    >
      {/* Page Header */}
      <motion.div variants={fadeUp} className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <TrendingUp size={24} className="text-violet-400" /> Evaluation Regression & Model Drift Tracker
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Track performance trajectory over time across multiple evaluations and detect model quality degradation.
          </p>
        </div>
        <button
          onClick={() => navigate('/run')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-lg shadow-violet-500/20"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
        >
          <Zap size={14} /> Run New Evaluation
        </button>
      </motion.div>

      {!hasModelsWithHistory ? (
        <motion.div variants={fadeUp} className="rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4 my-12 border border-white/10" style={{ background: 'var(--bg-surface)' }}>
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400">
            <TrendingUp size={32} />
          </div>
          <h3 className="text-xl font-bold text-white">No Regression Data Yet</h3>
          <p className="text-slate-400 text-xs">
            Evaluate the same model at least twice to enable automated trend analysis and model drift detection.
          </p>
          <button
            onClick={() => navigate('/run')}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-xs hover:opacity-90 transition-all"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
          >
            Run Evaluation →
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* LEFT PANEL — Model List (w-72) */}
          <motion.div variants={fadeUp} className="w-full md:w-72 shrink-0 rounded-2xl p-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Model Overview</span>
              <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-slate-500 font-mono-crisp">{modelsRegression.length} models</span>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {modelsRegression.map((m) => {
                const isSelected = selectedModelData?.model === m.model
                const health = m.trend_analysis?.health || 'neutral'
                const trend = m.trend_analysis?.trend || 'stable'
                const emoji = m.trend_analysis?.emoji || '➡️'
                const latestScore = m.time_series?.[m.time_series.length - 1]?.pass_rate || 0
                const avgScore = m.trend_analysis?.avg_score || 0
                const change = m.trend_analysis?.change_from_previous || 0

                const borderClass =
                  health === 'critical'
                    ? 'border-red-500/40 shadow-lg shadow-red-500/10'
                    : health === 'warning'
                    ? 'border-amber-500/30'
                    : health === 'good'
                    ? 'border-emerald-500/20'
                    : 'border-white/5'

                const badgeBg =
                  health === 'critical'
                    ? 'bg-red-500/20 text-red-300 border-red-500/30'
                    : health === 'warning'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : health === 'good'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-500/20 text-slate-300 border-slate-500/30'

                return (
                  <div
                    key={m.model}
                    onClick={() => setSelectedModel(m)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${borderClass} ${
                      isSelected ? 'bg-violet-600/15 border-violet-500/50 shadow-md' : 'bg-black/20 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate">
                        <span className="font-bold text-white text-xs block truncate font-mono-crisp">{m.model}</span>
                        <span className="text-[10px] text-slate-500 capitalize font-mono-crisp">{m.provider} • {m.eval_count} evals</span>
                      </div>
                      <span className="text-base shrink-0">{emoji}</span>
                    </div>

                    {/* Score Bar */}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono-crisp">
                        <span>Latest: <strong className="text-white">{latestScore}%</strong></span>
                        <span>Avg: <strong className="text-slate-300">{avgScore}%</strong></span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
                        <div
                          className={`h-full transition-all duration-500 ${
                            health === 'critical' ? 'bg-red-500' : health === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(latestScore, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Trend Badge */}
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border capitalize ${badgeBg}`}>
                        {trend}
                      </span>
                      <span
                        className={`text-[10px] font-mono-crisp font-bold ${
                          change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-slate-400'
                        }`}
                      >
                        {change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '±0%'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>

          {/* RIGHT PANEL — Detailed Regression Analysis (flex-1) */}
          <motion.div variants={fadeUp} className="flex-1 w-full space-y-6">
            {!selectedModelData ? (
              <div className="rounded-2xl p-12 text-center text-slate-500 space-y-2" style={{ background: 'var(--bg-surface)' }}>
                <TrendingUp size={36} className="mx-auto text-slate-600" />
                <p className="font-semibold text-xs text-slate-400">Select a model from the left panel</p>
              </div>
            ) : (
              <>
                {/* Top Model Header Card */}
                <div className="rounded-2xl p-6 border border-white/10 space-y-4 relative overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-white font-mono-crisp">{selectedModelData.model}</h2>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/25 uppercase font-mono-crisp">
                          {selectedModelData.provider}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 italic mt-1">
                        {selectedModelData.trend_analysis?.insight}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 capitalize ${
                          selectedModelData.trend_analysis?.health === 'critical'
                            ? 'bg-red-500/15 text-red-300 border-red-500/35'
                            : selectedModelData.trend_analysis?.health === 'warning'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        }`}
                      >
                        <span className="text-sm">{selectedModelData.trend_analysis?.emoji}</span>
                        <span>{selectedModelData.trend_analysis?.trend}</span>
                      </div>
                    </div>
                  </div>

                  {selectedModelData.trend_analysis?.alert && (
                    <div className="rounded-xl p-3.5 bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-xs text-red-200">
                      <AlertTriangle size={16} className="text-red-400 shrink-0 animate-pulse" />
                      <div>
                        <span className="font-bold block">🚨 REGRESSION ALERT</span>
                        <span className="text-[11px] text-red-300/80">{selectedModelData.trend_analysis?.alert_message}. This may indicate model degradation.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4 Stat Cards Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                      <History size={16} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Total Evals</span>
                      <span className="font-black text-white text-lg font-mono-crisp">
                        {selectedModelData.eval_count}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                      <Activity size={16} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Avg Score</span>
                      <span className="font-black text-white text-lg font-mono-crisp">
                        {selectedModelData.trend_analysis?.avg_score}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <TrendingUp size={16} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Best Ever</span>
                      <span className="font-black text-emerald-400 text-lg font-mono-crisp">
                        {selectedModelData.trend_analysis?.best_ever}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                      <TrendingDown size={16} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Worst Ever</span>
                      <span className="font-black text-red-400 text-lg font-mono-crisp">
                        {selectedModelData.trend_analysis?.worst_ever}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Main Line / Area Chart */}
                <div className="rounded-2xl p-6 border border-white/10 space-y-4" style={{ background: 'var(--bg-surface)' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-white text-sm">Pass Rate Over Time</h3>
                      <p className="text-xs text-slate-500 font-mono-crisp">Showing trajectory across {selectedModelData.eval_count} evaluations</p>
                    </div>
                    <div className="text-xs text-slate-400 font-mono-crisp">
                      Std Dev: <span className="text-slate-200">±{selectedModelData.trend_analysis?.std_dev}%</span>
                    </div>
                  </div>

                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={selectedModelData.time_series}
                        margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="passRateGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.0}/>
                          </linearGradient>
                          <linearGradient id="healthScoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="#475569" fontSize={10} font-family="JetBrains Mono" />
                        <YAxis domain={[0, 100]} stroke="#475569" fontSize={10} unit="%" font-family="JetBrains Mono" />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload
                              return (
                                <div className="p-3 rounded-xl bg-[#12121E] border border-white/10 shadow-xl space-y-1.5 text-xs font-mono-crisp">
                                  <div className="font-bold text-white">{data.full_date}</div>
                                  <div className="text-violet-400 font-semibold">Pass Rate: {data.pass_rate}%</div>
                                  <div className="text-cyan-400">Health Score: {data.health_score}%</div>
                                  <div className="text-slate-400">Category: {data.prompt_category}</div>
                                  <div className="text-slate-400">
                                    Change: {data.change > 0 ? `+${data.change}%` : `${data.change}%`}
                                  </div>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <ReferenceLine y={70} stroke="#EAB308" strokeDasharray="3 3" label={{ value: 'Threshold 70%', fill: '#EAB308', fontSize: 9 }} />
                        
                        <Area
                          type="monotone"
                          dataKey="pass_rate"
                          name="Pass Rate (%)"
                          stroke="#7C3AED"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#passRateGrad)"
                          dot={{ r: 4, fill: '#7C3AED', stroke: '#fff', strokeWidth: 1.5 }}
                          activeDot={{ r: 6, fill: '#7C3AED', stroke: '#fff', strokeWidth: 2 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="health_score"
                          name="Health Score (%)"
                          stroke="#06B6D4"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          fillOpacity={1}
                          fill="url(#healthScoreGrad)"
                          dot={{ r: 3, fill: '#06B6D4' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Evaluation History Table */}
                <div className="rounded-2xl p-6 space-y-4 border border-white/10" style={{ background: 'var(--bg-surface)' }}>
                  <h3 className="font-bold text-white text-sm">Evaluation History Details</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-500 uppercase text-[9px] font-semibold">
                          <th className="pb-3 px-3">#</th>
                          <th className="pb-3 px-3">Date</th>
                          <th className="pb-3 px-3">Pass Rate</th>
                          <th className="pb-3 px-3">Health Score</th>
                          <th className="pb-3 px-3">Change</th>
                          <th className="pb-3 px-3">Category</th>
                          <th className="pb-3 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {selectedModelData.time_series?.map((item) => {
                          const borderHighlight = item.is_best
                            ? 'border-l-2 border-l-emerald-500 bg-emerald-500/5'
                            : item.is_worst
                            ? 'border-l-2 border-l-red-500 bg-red-500/5'
                            : ''

                          return (
                            <tr key={item.eval_id} className={`hover:bg-white/5 transition-colors ${borderHighlight}`}>
                              <td className="py-3 px-3 font-mono-crisp text-slate-500 flex items-center gap-1">
                                {item.is_best && <span title="Best Ever Score">🏆</span>}
                                {item.is_worst && <span title="Worst Score">⚠️</span>}
                                #{item.eval_number}
                              </td>
                              <td className="py-3 px-3 text-slate-300 font-mono-crisp">{item.full_date}</td>
                              <td className="py-3 px-3 font-bold font-mono-crisp text-white">{item.pass_rate}%</td>
                              <td className="py-3 px-3 font-mono-crisp text-cyan-400">{item.health_score}%</td>
                              <td className="py-3 px-3 font-mono-crisp">
                                {item.change_type === 'baseline' ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] bg-slate-500/20 text-slate-400">baseline</span>
                                ) : item.change > 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-400 font-bold flex items-center gap-0.5 w-fit">
                                    <ArrowUpRight size={11} /> +{item.change}%
                                  </span>
                                ) : item.change < 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] bg-red-500/15 text-red-400 font-bold flex items-center gap-0.5 w-fit">
                                    <ArrowDownRight size={11} /> {item.change}%
                                  </span>
                                ) : (
                                  <span className="text-slate-500">±0%</span>
                                )}
                              </td>
                              <td className="py-3 px-3 font-mono-crisp">
                                <span className="px-2 py-0.5 rounded text-[9px] bg-violet-500/15 text-violet-300 capitalize">
                                  {item.prompt_category}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() => navigate(`/results?eval_id=${item.eval_id}`)}
                                  className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/40 text-[10px] text-slate-300 hover:text-white transition-all font-semibold"
                                >
                                  View Results →
                                </button>
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
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
