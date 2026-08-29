import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'
import toast from 'react-hot-toast'
import { API_BASE } from '../config'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  CheckCircle2, XCircle, ChevronDown, ChevronUp, AlertCircle,
  RefreshCw, FileSpreadsheet, FileCode, FileText, Download,
  Brain, ShieldAlert, CreditCard,
} from 'lucide-react'
import { exportToPdf } from '../utils/exportToPdf'
import { fadeUp, stagger } from '../lib/animations'
import { ScoreGauge } from '../components/ui/ScoreGauge'
import { ProgressBar } from '../components/ui/ProgressBar'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedModel, setSelectedModel] = useState('')
  const [manualModel, setManualModel] = useState('')
  const [resultsData, setResultsData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const [dbModels, setDbModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [regressionData, setRegressionData] = useState(null)

  // AI Summary States
  const [aiSummary, setAiSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [showTips, setShowTips] = useState(false)

  const fetchSummary = async (modelName) => {
    if (!modelName) return
    setLoadingSummary(true)
    setSummaryError('')
    try {
      const res = await axios.get(`${API_BASE}/summary/model/${encodeURIComponent(modelName)}`)
      setAiSummary(res.data)
    } catch (err) {
      console.error('Error fetching summary:', err)
      setSummaryError(err.response?.data?.detail || 'Failed to load AI evaluation analysis.')
      setAiSummary(null)
    } finally {
      setLoadingSummary(false)
    }
  }

  const handleRegenerateSummary = async () => {
    if (!resultsData?.id) return
    setRegenerating(true)
    try {
      const res = await axios.post(`${API_BASE}/summary/regenerate/${resultsData.id}`)
      setAiSummary(res.data)
      toast.success('🤖 AI Summary regenerated successfully!')
    } catch (e) {
      toast.error('Failed to regenerate summary.')
    } finally {
      setRegenerating(false)
    }
  }

  const fetchDbModels = async () => {
    setLoadingModels(true)
    try {
      const res = await axios.get(`${API_BASE}/evaluations?limit=200`)
      const unique = [...new Set((res.data || []).map(e => e.model).filter(Boolean))]
      setDbModels(unique)

      const queryParams = new URLSearchParams(window.location.search)
      const queryModel = queryParams.get('model')
      if (queryModel) {
        setSelectedModel(queryModel)
        fetchResults(queryModel)
      } else if (unique.length > 0) {
        setSelectedModel(unique[0])
        fetchResults(unique[0])
      }
    } catch (err) {
      console.error('Error fetching model list:', err)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    fetchDbModels()
  }, [location.search])

  const fetchResults = async (modelName) => {
    if (!modelName) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.get(`${API_BASE}/results/${encodeURIComponent(modelName)}`)
      setResultsData(res.data)
      fetchSummary(modelName)
      axios.get(`${API_BASE}/regression/${encodeURIComponent(modelName)}`)
        .then(r => setRegressionData(r.data))
        .catch(() => setRegressionData(null))
    } catch (err) {
      setError(err.response?.data?.detail || 'No results stored yet for this model')
      setResultsData(null)
      setRegressionData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDropdownChange = (e) => {
    const val = e.target.value
    setSelectedModel(val)
    if (val) {
      fetchResults(val)
    }
  }

  const handleManualLoad = () => {
    if (!manualModel.trim()) return
    setSelectedModel(manualModel.trim())
    fetchResults(manualModel.trim())
  }

  const handleExportCsv = () => {
    if (!selectedModel) return
    window.open(`${API_BASE}/export/csv/${encodeURIComponent(selectedModel)}`, '_blank')
    toast.success(`⬇️ Downloading CSV for ${selectedModel}`)
  }

  const handleExportJson = () => {
    if (!resultsData) return
    const blob = new Blob([JSON.stringify(resultsData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `criticai_${selectedModel.replace(/[/:]/g, '_')}_results.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`⬇️ Exported JSON for ${selectedModel}`)
  }

  const handleExportPdf = () => {
    if (!resultsData || !selectedModel) return
    setExportingPdf(true)
    try {
      exportToPdf(resultsData, selectedModel)
      toast.success('📄 PDF report opened — use "Save as PDF" in the print dialog')
    } catch (e) {
      toast.error('Failed to generate PDF. Please allow pop-ups.')
    } finally {
      setTimeout(() => setExportingPdf(false), 1000)
    }
  }

  const passRate = resultsData?.pass_rate ??
    (resultsData?.total_tests
      ? Math.round(((resultsData?.passed_count || 0) / resultsData.total_tests) * 100)
      : 0)

  const healthScore =
    typeof resultsData?.health_score === 'object'
      ? Math.round(resultsData.health_score?.overall ?? 0)
      : Math.round(resultsData?.health_score ?? 0)

  const categoryBreakdown = resultsData?.category_scores || [
    { category: 'Factual',     score: 85 },
    { category: 'Reasoning',   score: 72 },
    { category: 'Coding',      score: 90 },
    { category: 'Safety',      score: 65 },
    { category: 'Instruction', score: 88 },
  ]

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="p-6 max-w-6xl mx-auto space-y-6"
    >
      {/* Header + Model Selector */}
      <motion.div variants={fadeUp} className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Evaluation Results</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Deep metric breakdowns, category charts, and detailed test cases.
          </p>
        </div>

        {/* Model selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-60">
            <select
              value={selectedModel}
              onChange={handleDropdownChange}
              className="w-full appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-violet-500 cursor-pointer font-mono-crisp"
              disabled={loadingModels}
            >
              <option value="">
                {loadingModels ? 'Loading models...' : dbModels.length === 0 ? 'No models in DB' : '-- Pick model from DB --'}
              </option>
              {dbModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>

          <div className="flex gap-2 items-center flex-1 sm:flex-none">
            <input
              type="text"
              value={manualModel}
              onChange={(e) => setManualModel(e.target.value)}
              placeholder="Or type name..."
              className="w-full sm:w-44 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500 placeholder-slate-600 font-mono-crisp"
            />
            <button
              onClick={handleManualLoad}
              disabled={!manualModel.trim() || loading}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
            >
              Load
            </button>
            <button
              onClick={() => fetchResults(selectedModel)}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white transition-all shrink-0"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="p-12 text-center rounded-2xl space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-mono-crisp">Loading results for {selectedModel}...</p>
        </div>
      ) : error ? (
        <motion.div variants={fadeUp} className="p-12 text-center rounded-2xl space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <AlertCircle size={36} className="text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-200">{error}</h3>
          <p className="text-xs text-slate-500">Run an evaluation for this model first to view detailed reports.</p>
          <button
            onClick={() => navigate('/run')}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg shadow-violet-600/30"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
          >
            Run Evaluation →
          </button>
        </motion.div>
      ) : resultsData ? (
        <>
          {/* Top Score Gauge + Category Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score Card */}
            <motion.div variants={fadeUp} className="rounded-2xl p-6 flex flex-col items-center justify-center space-y-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Overall Pass Rate</span>
              <ScoreGauge score={passRate} size={150} />
              <div className="flex gap-4 text-xs font-mono-crisp text-slate-400">
                <span>Tests: <strong className="text-white">{resultsData.total_tests}</strong></span>
                <span>Passed: <strong className="text-emerald-400">{resultsData.passed_count}</strong></span>
                <span>Failed: <strong className="text-red-400">{resultsData.failed_count}</strong></span>
              </div>
            </motion.div>

            {/* Category Breakdown */}
            <motion.div variants={fadeUp} className="md:col-span-2 rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category Breakdown</span>
                <span className="text-xs font-mono-crisp text-cyan-400 font-bold">Health: {healthScore}/100</span>
              </div>
              <div className="space-y-3">
                {categoryBreakdown.map((cat) => (
                  <ProgressBar
                    key={cat.category}
                    label={cat.category}
                    value={cat.score}
                    color={cat.score >= 80 ? '#10b981' : cat.score >= 60 ? '#f59e0b' : '#ef4444'}
                    height={6}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* AI Analysis Verdict */}
          {aiSummary && (
            <motion.div variants={fadeUp} className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-violet-400" />
                  <h3 className="text-sm font-bold text-slate-100">AI Evaluation Verdict</h3>
                </div>
                <button
                  onClick={handleRegenerateSummary}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} />
                  Regenerate
                </button>
              </div>

              <div className="p-4 rounded-xl space-y-2" style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black font-mono-crisp text-violet-400">{aiSummary.overall_grade || 'A'}</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{aiSummary.executive_verdict || 'Model evaluation complete'}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">{aiSummary.recommendation}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Action Bar */}
          <motion.div variants={fadeUp} className="flex gap-2 justify-end">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <FileSpreadsheet size={13} /> Export CSV
            </button>
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <FileCode size={13} /> Export JSON
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white shadow-lg shadow-violet-600/30 transition-all"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
            >
              <FileText size={13} /> {exportingPdf ? 'Generating...' : 'Export PDF'}
            </button>
          </motion.div>
        </>
      ) : null}
    </motion.div>
  )
}
