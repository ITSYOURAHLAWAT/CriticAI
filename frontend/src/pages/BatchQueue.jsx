import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { API_BASE } from '../config'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  ListOrdered, Play, CheckCircle2, XCircle, Clock, AlertTriangle, ShieldCheck,
  Brain, Trash2, GripVertical, Zap, RefreshCw, Download, GitCompare, FileText, ChevronDown, ChevronUp, StopCircle
} from 'lucide-react'

const AVAILABLE_MODELS = [
  { model: 'llama-3.3-70b-versatile', provider: 'groq', desc: 'Meta Llama 3.3 70B (Fast & Powerful)' },
  { model: 'llama-3.1-70b-versatile', provider: 'groq', desc: 'Meta Llama 3.1 70B' },
  { model: 'mixtral-8x7b-32768', provider: 'groq', desc: 'Mistral Mixtral 8x7B' },
  { model: 'gemma2-9b-it', provider: 'groq', desc: 'Google Gemma 2 9B' },
  { model: 'gemini-1.5-flash', provider: 'gemini', desc: 'Google Gemini 1.5 Flash' },
  { model: 'gemini-1.5-flash-8b', provider: 'gemini', desc: 'Google Gemini 1.5 Flash 8B' },
  { model: 'llama3:latest', provider: 'ollama', desc: 'Ollama Llama 3 (Local)' },
  { model: 'mistral:latest', provider: 'ollama', desc: 'Ollama Mistral (Local)' }
]

const PROMPT_CATEGORIES = ['all', 'coding', 'reasoning', 'safety', 'hallucination']

export default function BatchQueue() {
  const navigate = useNavigate()

  // Phase State: 'setup' | 'running' | 'complete'
  const [phase, setPhase] = useState('setup')

  // Setup Form & Queue
  const [queuedJobs, setQueuedJobs] = useState([
    { model: 'llama-3.3-70b-versatile', provider: 'groq', prompt_category: 'all', num_tests: 10, include_redteam: false },
    { model: 'gemini-1.5-flash', provider: 'gemini', prompt_category: 'coding', num_tests: 10, include_redteam: false }
  ])
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].model)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [numTests, setNumTests] = useState(10)
  const [includeRedteam, setIncludeRedteam] = useState(false)
  const [formError, setFormError] = useState('')

  // Drag and drop index
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  // Shared Settings
  const [continueOnFailure, setContinueOnFailure] = useState(true)
  const [delayBetween, setDelayBetween] = useState(3)

  // Running & Execution States
  const [sessionId, setSessionId] = useState(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [currentJobIndex, setCurrentJobIndex] = useState(-1)
  const [runningJobs, setRunningJobs] = useState([])
  const [finalResults, setFinalResults] = useState(null)

  // History & Expand states
  const [batchHistory, setBatchHistory] = useState([])
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)

  const abortRef = useRef(null)

  // Timer state for current running job
  const [jobElapsed, setJobElapsed] = useState(0)
  const timerRef = useRef(null)

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/batch/history?limit=10`)
      setBatchHistory(res.data || [])
    } catch (e) {
      console.error('Error fetching batch history:', e)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  // Timer interval for running job
  useEffect(() => {
    if (phase === 'running' && currentJobIndex >= 0) {
      setJobElapsed(0)
      timerRef.current = setInterval(() => {
        setJobElapsed(prev => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase, currentJobIndex])

  // Queue Builder Handlers
  const handleAddJob = () => {
    setFormError('')
    if (queuedJobs.length >= 10) {
      setFormError('Queue full (max 10 models per batch)')
      return
    }
    const exists = queuedJobs.some(j => j.model === selectedModel)
    if (exists) {
      setFormError(`'${selectedModel}' is already in the queue. Each model must be unique.`)
      return
    }

    const modelObj = AVAILABLE_MODELS.find(m => m.model === selectedModel)
    const provider = modelObj ? modelObj.provider : 'groq'

    setQueuedJobs(prev => [
      ...prev,
      {
        model: selectedModel,
        provider,
        prompt_category: selectedCategory,
        num_tests: Number(numTests),
        include_redteam: includeRedteam
      }
    ])
  }

  const handleRemoveJob = (index) => {
    setQueuedJobs(prev => prev.filter((_, i) => i !== index))
  }

  const handleDragSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return
    const items = [...queuedJobs]
    const draggedItem = items.splice(dragItem.current, 1)[0]
    items.splice(dragOverItem.current, 0, draggedItem)
    dragItem.current = null
    dragOverItem.current = null
    setQueuedJobs(items)
  }

  // Presets
  const applyPreset = (presetName) => {
    setFormError('')
    if (presetName === 'top3') {
      setQueuedJobs([
        { model: 'llama-3.3-70b-versatile', provider: 'groq', prompt_category: 'all', num_tests: 10, include_redteam: false },
        { model: 'mixtral-8x7b-32768', provider: 'groq', prompt_category: 'all', num_tests: 10, include_redteam: false },
        { model: 'gemma2-9b-it', provider: 'groq', prompt_category: 'all', num_tests: 10, include_redteam: false }
      ])
      toast.success('Loaded Top 3 Free Models preset!')
    } else if (presetName === 'coding') {
      setQueuedJobs([
        { model: 'llama-3.3-70b-versatile', provider: 'groq', prompt_category: 'coding', num_tests: 15, include_redteam: false },
        { model: 'mixtral-8x7b-32768', provider: 'groq', prompt_category: 'coding', num_tests: 15, include_redteam: false },
        { model: 'gemini-1.5-flash', provider: 'gemini', prompt_category: 'coding', num_tests: 15, include_redteam: false }
      ])
      toast.success('Loaded Coding Benchmark preset!')
    } else if (presetName === 'safety') {
      setQueuedJobs([
        { model: 'llama-3.3-70b-versatile', provider: 'groq', prompt_category: 'safety', num_tests: 20, include_redteam: true },
        { model: 'gemma2-9b-it', provider: 'groq', prompt_category: 'safety', num_tests: 20, include_redteam: true },
        { model: 'gemini-1.5-flash', provider: 'gemini', prompt_category: 'safety', num_tests: 20, include_redteam: true }
      ])
      toast.success('Loaded Safety Gauntlet preset!')
    }
  }

  // Start Batch Execution
  const handleStartBatch = async () => {
    if (queuedJobs.length < 2) {
      toast.error('Add at least 2 models to run a batch evaluation.')
      return
    }

    try {
      // 1. Create batch session
      const createRes = await axios.post(`${API_BASE}/batch/create`, {
        jobs: queuedJobs,
        delay_between: delayBetween
      })

      const newSessionId = createRes.data.session_id
      setSessionId(newSessionId)

      // Initialize running jobs state
      const initJobs = queuedJobs.map((j, idx) => ({
        job_id: createRes.data.jobs?.[idx]?.job_id || `job-${idx}`,
        model: j.model,
        provider: j.provider,
        prompt_category: j.prompt_category,
        num_tests: j.num_tests,
        include_redteam: j.include_redteam,
        status: 'queued',
        position: idx + 1,
        pass_rate: null,
        health_score: null,
        error_message: null
      }))
      setRunningJobs(initJobs)
      setCompletedCount(0)
      setFailedCount(0)
      setCurrentJobIndex(-1)
      setPhase('running')

      // 2. Connect to SSE Endpoint
      abortRef.current = new AbortController()
      const response = await fetch(`${API_BASE}/batch/${newSessionId}/start`, {
        method: 'POST',
        signal: abortRef.current.signal
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))

              if (event.type === 'job_started') {
                setCurrentJobIndex(event.position - 1)
                setRunningJobs(prev => prev.map((j, idx) =>
                  idx === event.position - 1 ? { ...j, status: 'running' } : j
                ))
              }

              if (event.type === 'job_completed') {
                setCompletedCount(event.completed)
                setRunningJobs(prev => prev.map((j, idx) =>
                  idx === event.position - 1 ? {
                    ...j,
                    status: 'completed',
                    pass_rate: event.pass_rate,
                    health_score: event.health_score,
                    eval_id: event.eval_id
                  } : j
                ))
              }

              if (event.type === 'job_failed') {
                setFailedCount(prev => prev + 1)
                setRunningJobs(prev => prev.map((j, idx) =>
                  idx === event.position - 1 ? { ...j, status: 'failed', error_message: event.error } : j
                ))
              }

              if (event.type === 'batch_complete') {
                setPhase('complete')
                setFinalResults(event)
                fetchHistory()
                toast.success(
                  event.winner
                    ? `🏆 Batch complete! Winner: ${event.winner}`
                    : 'Batch finished'
                )
              }
            } catch (e) {
              console.error('SSE parse error:', e)
            }
          }
        }
      }
    } catch (err) {
      console.error('Batch start error:', err)
      toast.error(err.response?.data?.detail || 'Failed to start batch evaluation.')
      setPhase('setup')
    }
  }

  // Cancel Batch
  const handleCancelBatch = async () => {
    if (!sessionId) return
    try {
      await axios.post(`${API_BASE}/batch/${sessionId}/cancel`)
      if (abortRef.current) abortRef.current.abort()
      toast.error('Batch evaluation cancelled by user.')
      setRunningJobs(prev => prev.map(j => (j.status === 'queued' ? { ...j, status: 'skipped' } : j)))
      setPhase('complete')
      fetchHistory()
    } catch (e) {
      console.error('Error cancelling batch:', e)
    }
  }

  // Download Results JSON Blob
  const handleDownloadResults = () => {
    if (!finalResults) return
    const blob = new Blob([JSON.stringify(finalResults, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch_${sessionId || 'results'}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Downloaded batch results JSON!')
  }

  // Calculate estimated time
  const totalTestsCount = queuedJobs.reduce((acc, j) => acc + j.num_tests, 0)
  const estimatedTimeMins = Math.ceil((totalTestsCount * 1.5 + queuedJobs.length * delayBetween) / 60)

  // Chart data for Complete phase
  const chartData = useMemo(() => {
    if (!finalResults?.results) return []
    return finalResults.results.map(r => ({
      name: r.model.length > 15 ? r.model.slice(0, 15) + '...' : r.model,
      fullName: r.model,
      passRate: r.pass_rate || 0,
      healthScore: r.health_score || 0
    }))
  }, [finalResults])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Title */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <ListOrdered size={24} className="text-violet-400" /> Batch Evaluation Queue
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Evaluate multiple LLM models sequentially without manual intervention. Ideal for overnight benchmark suites.
          </p>
        </div>
        {phase !== 'setup' && (
          <button
            onClick={() => setPhase('setup')}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-violet-500/40 text-slate-300 hover:text-white text-xs font-semibold transition-all flex items-center gap-2"
          >
            <RefreshCw size={14} /> New Batch Setup
          </button>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PHASE 1 — SETUP VIEW                                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Side (flex-1) — Queue Builder */}
          <div className="lg:col-span-2 space-y-6">
            {/* Add Model Form Card */}
            <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
              <div>
                <h3 className="font-bold text-white text-sm">Build Your Queue</h3>
                <p className="text-xs text-slate-400 mt-0.5">Add up to 10 unique models to evaluate in sequence.</p>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold">
                  ⚠️ {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Model Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Select Model</label>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.model} value={m.model} className="bg-slate-900 text-white">
                        {m.model} ({m.provider})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Prompt Category</label>
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white capitalize focus:outline-none focus:border-violet-500"
                  >
                    {PROMPT_CATEGORIES.map(c => (
                      <option key={c} value={c} className="bg-slate-900 text-white capitalize">{c}</option>
                    ))}
                  </select>
                </div>

                {/* Test Count */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Tests Number (5-30)</label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={numTests}
                    onChange={e => setNumTests(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                {/* Red-Team Toggle & Add Button */}
                <div className="flex items-center justify-between pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeRedteam}
                      onChange={e => setIncludeRedteam(e.target.checked)}
                      className="rounded accent-violet-600"
                    />
                    <span>Red-Team Security</span>
                  </label>

                  <button
                    onClick={handleAddJob}
                    disabled={queuedJobs.length >= 10}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Add to Queue +
                  </button>
                </div>
              </div>
            </div>

            {/* Queue List Area */}
            <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-white text-sm">
                  Queued Models ({queuedJobs.length}/10)
                </h3>
                <span className="text-xs text-slate-400">Drag ⋮⋮ to reorder sequence</span>
              </div>

              {queuedJobs.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-white/10 rounded-xl space-y-2">
                  <ListOrdered size={32} className="mx-auto text-slate-600" />
                  <p className="text-xs text-slate-400 font-semibold">No models in queue yet</p>
                  <p className="text-[11px] text-slate-500">Select models above or choose a preset on the right.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queuedJobs.map((job, idx) => (
                    <div
                      key={job.model}
                      draggable
                      onDragStart={() => (dragItem.current = idx)}
                      onDragEnter={() => (dragOverItem.current = idx)}
                      onDragEnd={handleDragSort}
                      onDragOver={e => e.preventDefault()}
                      className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-3 hover:border-violet-500/40 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical size={16} className="text-slate-500 cursor_grab group-hover:text-slate-300 shrink-0" />
                        <span className="text-xs font-bold text-violet-400 font-mono">#{idx + 1}</span>
                        <div>
                          <span className="font-bold text-white text-xs block font-mono">{job.model}</span>
                          <span className="text-[10px] text-slate-400 capitalize">
                            {job.provider} • {job.prompt_category} category • {job.num_tests} tests {job.include_redteam ? '• 🛡️ Red-Team' : ''}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveJob(idx)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Remove from queue"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary Bar */}
              <div className="pt-2 flex justify-between items-center text-xs text-slate-400 border-t border-white/5">
                <span>Total: <strong className="text-white">{queuedJobs.length} models</strong></span>
                <span>Estimated Time: <strong className="text-cyan-400">~{estimatedTimeMins} mins</strong></span>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStartBatch}
                disabled={queuedJobs.length < 2}
                className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all shadow-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
                  boxShadow: '0 0 20px rgba(124,58,237,0.3)'
                }}
              >
                <Play size={16} /> Start Batch Evaluation ({queuedJobs.length} models)
              </button>
            </div>
          </div>

          {/* Right Side (w-80) — Settings & Presets */}
          <div className="space-y-6">
            {/* Presets Card */}
            <div className="glass rounded-2xl p-5 border border-white/10 space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">Quick Presets</h4>
              <div className="space-y-2">
                <button
                  onClick={() => applyPreset('top3')}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/10 hover:border-violet-500/40 text-left transition-all group"
                >
                  <span className="font-bold text-white text-xs block group-hover:text-violet-300">🤖 Top 3 Free Models</span>
                  <span className="text-[10px] text-slate-400 block">Llama 3.3 70B, Mixtral 8x7B, Gemma 2 9B</span>
                </button>

                <button
                  onClick={() => applyPreset('coding')}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/10 hover:border-violet-500/40 text-left transition-all group"
                >
                  <span className="font-bold text-white text-xs block group-hover:text-violet-300">💻 Coding Benchmark</span>
                  <span className="text-[10px] text-slate-400 block">Llama 3.3 70B, Mixtral, Gemini 1.5 Flash</span>
                </button>

                <button
                  onClick={() => applyPreset('safety')}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/10 hover:border-violet-500/40 text-left transition-all group"
                >
                  <span className="font-bold text-white text-xs block group-hover:text-violet-300">🛡️ Safety Gauntlet</span>
                  <span className="text-[10px] text-slate-400 block">Safety Category + Red-Team ON</span>
                </button>
              </div>
            </div>

            {/* Batch Settings Card */}
            <div className="glass rounded-2xl p-5 border border-white/10 space-y-4">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">Batch Settings</h4>

              {/* Continue on Failure Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-300 block">Continue on Failure</span>
                  <span className="text-[10px] text-slate-500 block">Skip failed model & proceed</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={continueOnFailure}
                    onChange={e => setContinueOnFailure(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
                </label>
              </div>

              {/* Rate limit delay slider */}
              <div className="space-y-1 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Inter-model Delay</span>
                  <span className="font-bold text-cyan-400 font-mono">{delayBetween}s</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={delayBetween}
                  onChange={e => setDelayBetween(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Respects provider free-tier RPM limits</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PHASE 2 — RUNNING VIEW                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {phase === 'running' && (
        <div className="space-y-6">
          {/* Top Progress Header */}
          <div className="glass rounded-2xl p-6 border border-white/10 space-y-4 bg-gradient-to-r from-violet-950/40 via-purple-950/20 to-slate-900/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Zap size={22} className="text-violet-400 animate-pulse" /> Batch Running — {completedCount}/{runningJobs.length} Complete
                </h2>
                <div className="flex items-center gap-4 text-xs text-slate-300 mt-2 font-mono">
                  <span>✅ <strong className="text-emerald-400">{completedCount}</strong> done</span>
                  <span>❌ <strong className="text-red-400">{failedCount}</strong> failed</span>
                  <span>⏳ <strong className="text-slate-400">{runningJobs.length - completedCount - failedCount}</strong> remaining</span>
                </div>
              </div>

              <button
                onClick={handleCancelBatch}
                className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 hover:bg-red-600 text-red-300 hover:text-white font-bold text-xs transition-all flex items-center gap-2"
              >
                <StopCircle size={16} /> Cancel Batch
              </button>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 rounded-full bg-black/50 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-500"
                style={{ width: `${(completedCount / runningJobs.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Vertical Queue Cards */}
          <div className="space-y-3">
            {runningJobs.map((job, idx) => {
              const isRunning = job.status === 'running'
              const isCompleted = job.status === 'completed'
              const isFailed = job.status === 'failed'
              const isSkipped = job.status === 'skipped'

              return (
                <div
                  key={job.job_id}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                    isRunning
                      ? 'bg-violet-600/15 border-violet-500/60 shadow-lg shadow-violet-500/10 animate-pulse'
                      : isCompleted
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : isFailed
                      ? 'bg-red-500/10 border-red-500/30'
                      : isSkipped
                      ? 'bg-white/5 border-white/10 opacity-50'
                      : 'bg-black/20 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-400 text-sm">#{idx + 1}</span>
                    {isRunning && <Brain size={20} className="text-violet-400 animate-spin" />}
                    {isCompleted && <CheckCircle2 size={20} className="text-emerald-400" />}
                    {isFailed && <XCircle size={20} className="text-red-400" />}
                    {!isRunning && !isCompleted && !isFailed && <Clock size={20} className="text-slate-500" />}

                    <div>
                      <h4 className="font-bold text-white text-sm font-mono">{job.model}</h4>
                      <p className="text-xs text-slate-400 capitalize">
                        {job.provider} • {job.prompt_category} category • {job.num_tests} tests
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    {isRunning && (
                      <span className="text-xs font-bold text-violet-300 font-mono">
                        Running... ({jobElapsed}s)
                      </span>
                    )}
                    {isCompleted && (
                      <div>
                        <span className="text-sm font-bold text-emerald-400 font-mono block">
                          {job.pass_rate}% Pass Rate
                        </span>
                        <span className="text-[10px] text-slate-400">Health: {job.health_score}%</span>
                      </div>
                    )}
                    {isFailed && (
                      <span className="text-xs font-bold text-red-400 block">
                        Failed: {job.error_message || 'Error'}
                      </span>
                    )}
                    {isSkipped && (
                      <span className="text-xs text-slate-500 block">Skipped</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PHASE 3 — COMPLETE VIEW                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {phase === 'complete' && finalResults && (
        <div className="space-y-8">
          {/* Winner Banner */}
          <div className="rounded-2xl p-6 bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-cyan-600/20 border border-violet-500/30 space-y-2 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-4xl block md:inline mr-3">🏆</span>
              <div className="inline-block">
                <h2 className="text-xl font-bold text-white">Batch Evaluation Complete!</h2>
                <p className="text-xs text-slate-300 mt-1">
                  Evaluated {finalResults.completed}/{finalResults.total_jobs} models successfully.
                </p>
              </div>
            </div>

            {finalResults.winner && (
              <div className="bg-black/40 px-5 py-3 rounded-2xl border border-violet-500/40 text-center shrink-0">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Winner</span>
                <span className="text-lg font-bold text-emerald-400 font-mono block">{finalResults.winner}</span>
              </div>
            )}
          </div>

          {/* Side-by-Side Results Table */}
          <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h3 className="font-bold text-white text-sm">Batch Results — Side by Side</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                    <th className="pb-3 px-3">Rank</th>
                    <th className="pb-3 px-3">Model</th>
                    <th className="pb-3 px-3">Provider</th>
                    <th className="pb-3 px-3">Pass Rate</th>
                    <th className="pb-3 px-3">Health Score</th>
                    <th className="pb-3 px-3">Status</th>
                    <th className="pb-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {runningJobs
                    .slice()
                    .sort((a, b) => (b.pass_rate || 0) - (a.pass_rate || 0))
                    .map((job, idx) => {
                      const isWinner = job.model === finalResults.winner
                      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`

                      return (
                        <tr
                          key={job.job_id}
                          className={`hover:bg-white/5 transition-colors ${
                            isWinner ? 'bg-violet-600/10 border-l-4 border-l-violet-500 font-semibold' : ''
                          }`}
                        >
                          <td className="py-3.5 px-3 font-mono text-sm">{rankBadge}</td>
                          <td className="py-3.5 px-3 font-bold font-mono text-white flex items-center gap-2">
                            {job.model}
                            {isWinner && (
                              <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full">
                                🏆 BEST
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 uppercase text-slate-400">{job.provider}</td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`font-mono font-bold text-sm ${
                                (job.pass_rate || 0) >= 80
                                  ? 'text-emerald-400'
                                  : (job.pass_rate || 0) >= 60
                                  ? 'text-amber-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {job.pass_rate !== null ? `${job.pass_rate}%` : 'N/A'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-cyan-400">
                            {job.health_score !== null ? `${job.health_score}%` : 'N/A'}
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                                job.status === 'completed'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : job.status === 'failed'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-slate-500/20 text-slate-400'
                              }`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            {job.eval_id && (
                              <button
                                onClick={() => navigate(`/results?eval_id=${job.eval_id}`)}
                                className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/40 text-[11px] text-slate-300 hover:text-white transition-all"
                              >
                                View Results →
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar Chart Comparison */}
          <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h3 className="font-bold text-white text-sm">Pass Rate & Health Score Comparison</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F0C1E', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="passRate" name="Pass Rate (%)" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="healthScore" name="Health Score (%)" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
            <button
              onClick={() => setPhase('setup')}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} /> Run New Batch
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleDownloadResults}
                className="px-4 py-2.5 rounded-xl glass border border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-white font-bold text-xs transition-all flex items-center gap-2"
              >
                <Download size={14} /> Download Results JSON
              </button>

              <button
                onClick={() => navigate('/compare')}
                className="px-4 py-2.5 rounded-xl glass border border-white/10 hover:border-violet-500/40 text-slate-300 hover:text-white font-bold text-xs transition-all flex items-center gap-2"
              >
                <GitCompare size={14} /> View in Compare
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PREVIOUS BATCHES HISTORY                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <h3 className="font-bold text-white text-sm">Previous Batch Sessions</h3>

        {batchHistory.length === 0 ? (
          <p className="text-xs text-slate-500">No previous batch sessions recorded.</p>
        ) : (
          <div className="space-y-3">
            {batchHistory.map(b => {
              const isExpanded = expandedHistoryId === b.id

              return (
                <div key={b.id} className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                  <div
                    onClick={() => setExpandedHistoryId(isExpanded ? null : b.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-white font-mono">{b.total_jobs} models</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                          b.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : b.status === 'cancelled'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {b.status}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 font-mono">
                        {b.completed_jobs}/{b.total_jobs} passed
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-white/10 bg-black/50 space-y-2">
                      <div className="space-y-1 text-xs">
                        {b.jobs?.map((j, i) => (
                          <div key={i} className="flex justify-between text-slate-300 font-mono py-1 border-b border-white/5">
                            <span>#{i + 1} {j.model}</span>
                            <span className={j.pass_rate >= 70 ? 'text-emerald-400 font-bold' : 'text-red-400'}>
                              {j.pass_rate !== null && j.pass_rate !== undefined ? `${j.pass_rate}%` : 'failed'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
