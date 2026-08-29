import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Play, Brain, AlertTriangle, Shield, Terminal, XCircle, Upload,
  FileText, Sparkles, CheckCircle2, Loader2, Clock, LayoutTemplate,
  X, Search, ChevronDown, Check, Zap
} from 'lucide-react'
import { API_BASE, QUICK_MODELS, PROMPT_CATEGORIES, PROVIDER_COLORS } from '../config'
import { fadeUp, stagger } from '../lib/animations'

const STAGES = [
  { key: 'test_generator', label: 'Generate Tests', icon: '🧪', color: '#7C3AED' },
  { key: 'red_team',       label: 'Red-Team',       icon: '🔴', color: '#EF4444' },
  { key: 'evaluator',      label: 'Score Results',  icon: '📊', color: '#06B6D4' },
  { key: 'benchmark',      label: 'Benchmark',      icon: '🏆', color: '#F59E0B' },
  { key: 'reporter',       label: 'Generate Report',icon: '📝', color: '#10B981' },
]

const STAGE_MAP = {
  test_generator: 0, test_generator_done: 0,
  red_team: 1, red_team_done: 1,
  evaluator: 2, evaluator_done: 2,
  benchmark: 3, benchmark_done: 3,
  detector: 3, detector_done: 3,
  reporter: 4, reporter_done: 4,
}

const LOG_EMOJI = {
  test_generator: '🧪', test_generator_done: '✅',
  red_team: '🔴', red_team_done: '🔴',
  evaluator: '📊', evaluator_done: '✅',
  benchmark: '🏆', benchmark_done: '✅',
  detector: '🔍', detector_done: '🔍',
  reporter: '📝', reporter_done: '✅',
  summary_ready: '🤖',
  complete: '🎉', error: '❌',
}

export default function RunEvaluation({ addEval }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [model, setModel] = useState('llama-3.3-70b-versatile')
  const [category, setCategory] = useState('all')
  const [numTests, setNumTests] = useState(10)
  const [includeRedteam, setIncludeRedteam] = useState(true)

  const [evalMode, setEvalMode] = useState('template')
  const [customPromptsText, setCustomPromptsText] = useState('')
  const [fileName, setFileName] = useState('')

  // Template state
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templatesList, setTemplatesList] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  const [datasetSessionId, setDatasetSessionId] = useState(null)
  const [uploadingDataset, setUploadingDataset] = useState(false)
  const [datasetError, setDatasetError] = useState(null)
  const [datasetWarnings, setDatasetWarnings] = useState([])
  const [datasetTotalPrompts, setDatasetTotalPrompts] = useState(0)
  const [datasetDetectedColumns, setDatasetDetectedColumns] = useState(null)
  const [datasetPreview, setDatasetPreview] = useState([])
  const [promptColHint, setPromptColHint] = useState('')
  const [csvHeaders, setCsvHeaders] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)

  const [isRunning, setIsRunning] = useState(false)
  const [currentStage, setCurrentStage] = useState(-1)
  const [completedStages, setCompletedStages] = useState(new Set())
  const [logs, setLogs] = useState([])
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [isCancelled, setIsCancelled] = useState(false)

  const logEndRef = useRef(null)
  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsedSecs(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  const applyTemplate = (template) => {
    setActiveTemplate(template)
    setCategory(template.config?.prompt_category || 'all')
    setNumTests(template.config?.num_tests || 10)
    setIncludeRedteam(Boolean(template.config?.include_redteam))
    setEvalMode('custom')
    if (template.prompts && template.prompts.length > 0) {
      setCustomPromptsText(template.prompts.join('\n'))
    }
    setShowTemplateModal(false)
    toast.success(`Template loaded: ${template.name}`)
  }

  useEffect(() => {
    if (location.state?.selectedTemplate) {
      applyTemplate(location.state.selectedTemplate)
    }
  }, [location.state])

  const fetchPickerTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const res = await fetch(`${API_BASE}/templates`)
      const data = await res.json()
      setTemplatesList(data || [])
    } catch {
      toast.error('Could not load templates list')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const addLog = (emoji, message) => {
    const time = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, { time, emoji, message, id: Date.now() + Math.random() }])
  }

  const uploadFileToServer = async (file, colHint = null) => {
    setUploadingDataset(true)
    setDatasetError(null)
    setDatasetWarnings([])
    
    const formData = new FormData()
    formData.append('file', file)
    if (colHint) {
      formData.append('prompt_col_hint', colHint)
    }

    try {
      const response = await fetch(`${API_BASE}/dataset/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.errors?.join(', ') || 'Upload failed')
      }

      setDatasetSessionId(data.session_id)
      setDatasetTotalPrompts(data.total_prompts)
      setDatasetDetectedColumns(data.detected_columns)
      setDatasetPreview(data.preview)
      setDatasetWarnings(data.warnings || [])
      setFileName(file.name)
      toast.success(`Successfully uploaded and validated ${data.total_prompts} prompts!`)
    } catch (err) {
      setDatasetError(err.message || 'Unknown upload error')
      toast.error(err.message || 'Failed to upload dataset')
    } finally {
      setUploadingDataset(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSelectedFile(file)
    setPromptColHint('')
    setCsvHeaders([])
    
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const text = evt.target.result
        const firstLine = text.split('\n')[0]
        const headers = firstLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
        setCsvHeaders(headers.filter(Boolean))
      }
      reader.readAsText(file)
    }

    uploadFileToServer(file)
  }

  const handleColumnHintChange = (hint) => {
    setPromptColHint(hint)
    if (selectedFile) {
      uploadFileToServer(selectedFile, hint)
    }
  }

  const handleCancel = () => {
    setIsCancelled(true)
    if (abortRef.current) abortRef.current.abort()
    addLog('🛑', 'Evaluation cancelled by user.')
    clearInterval(timerRef.current)
    setTimeout(() => setIsRunning(false), 1200)
  }

  const handleLaunch = async () => {
    if (!model.trim()) {
      toast.error('Please enter or select a model name')
      return
    }
    const isCustom = evalMode === 'custom'
    const customList =
      isCustom && !datasetSessionId
        ? customPromptsText.split('\n').map((p) => p.trim()).filter((p) => p.length > 0)
        : null

    if (isCustom && !datasetSessionId && (!customList || customList.length === 0)) {
      toast.error('Please enter prompts or upload a dataset file first')
      return
    }

    setIsRunning(true)
    setCurrentStage(0)
    setCompletedStages(new Set())
    setLogs([])
    setElapsedSecs(0)
    setIsCancelled(false)

    const finalNumTests = isCustom
      ? (datasetSessionId ? datasetTotalPrompts : customList.length)
      : Number(numTests)

    const finalCategory = isCustom
      ? (fileName ? `custom: ${fileName}` : 'Custom Benchmark')
      : category

    addLog('🚀', `Launching evaluation for model: ${model}`)
    addLog('⚙️', `Mode: ${isCustom ? `Custom (${finalNumTests} prompts)` : `Standard — ${category}`} | Red-Team: ${includeRedteam ? 'ON' : 'OFF'}`)

    const controller = new AbortController()
    abortRef.current = controller

    const payload = {
      model,
      prompt_category: category,
      include_redteam: Boolean(includeRedteam),
    }

    if (activeTemplate) {
      payload.template_id = activeTemplate.id
    }

    if (isCustom) {
      if (datasetSessionId) {
        payload.dataset_session_id = datasetSessionId
        payload.num_tests = datasetTotalPrompts
      } else {
        payload.custom_prompts = customList
        payload.num_tests = customList.length
      }
    } else {
      payload.num_tests = Number(numTests)
    }

    try {
      const response = await fetch(`${API_BASE}/evaluate/stream`, {
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
          const jsonStr = line.slice(5).trim()
          let event
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          const { stage, message } = event
          const emoji = LOG_EMOJI[stage] || '⚡'
          addLog(emoji, message)

          if (stage === 'summary_ready') {
            toast((t) => (
              <div className="flex flex-col gap-2.5 p-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-400">
                    <span className="text-base">🤖</span>
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">AI Summary Verdict Ready!</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Overall Grade: <span className="font-bold text-violet-400 font-mono-crisp">{event.summary?.overall_grade || 'A'}</span></p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      toast.dismiss(t.id)
                      navigate(`/results?model=${encodeURIComponent(model)}`)
                    }}
                    className="px-2.5 py-1 rounded bg-violet-600 text-white font-bold text-[10px] hover:bg-violet-500 transition-colors shadow-sm"
                  >
                    View Report
                  </button>
                  <button
                    onClick={() => toast.dismiss(t.id)}
                    className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-slate-400 font-bold text-[10px] hover:text-slate-200 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ), {
              duration: 6000,
              style: {
                background: '#12121E',
                border: '1px solid rgba(124,58,237,0.3)',
                borderRadius: '16px',
                color: '#fff',
              }
            })
          } else if (stage === 'complete') {
            setCurrentStage(STAGES.length)
            setCompletedStages(new Set([0, 1, 2, 3, 4]))
            const result = event.result || {}
            const report = result.report || {}
            const evalRecord = {
              id: Date.now(),
              model,
              category: finalCategory,
              numTests: finalNumTests,
              includeRedteam,
              status: 'completed',
              timestamp: new Date().toISOString(),
              report,
              summary: report.summary,
            }
            addEval(evalRecord)
            setDatasetSessionId(null)
            setSelectedFile(null)
            setFileName('')
            
            toast.success(`✅ Evaluation complete for ${model}!`)
            setTimeout(() => {
              setIsRunning(false)
              navigate('/results')
            }, 1800)
          } else if (stage === 'error') {
            addLog('❌', `Pipeline error: ${message}`)
            toast.error(`Evaluation failed: ${message}`)
            setIsRunning(false)
          } else {
            const stageIdx = STAGE_MAP[stage]
            if (stageIdx !== undefined) {
              setCurrentStage(stageIdx)
              if (stage.endsWith('_done')) {
                setCompletedStages((prev) => new Set([...prev, stageIdx]))
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      const msg =
        err.message === 'Failed to fetch'
          ? 'Backend offline — start FastAPI on port 8000'
          : err.message || 'Unknown error'
      addLog('❌', msg)
      toast.error(msg)
      addEval({
        id: Date.now(),
        model,
        category,
        numTests,
        includeRedteam,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: msg,
      })
      setIsRunning(false)
    }
  }

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="p-6 max-w-4xl mx-auto space-y-6"
    >
      {/* Title */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-black text-white">Configure Evaluation Pipeline</h1>
        <p className="text-slate-500 text-xs mt-0.5">Run automated category suites or upload your custom benchmark prompt dataset.</p>
      </motion.div>

      {!isRunning ? (
        <motion.div
          variants={fadeUp}
          className="rounded-2xl p-7 space-y-6 relative"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          {/* Header Row with Load Template Button */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Evaluation Config</span>
            <button
              type="button"
              onClick={() => {
                setShowTemplateModal(true)
                fetchPickerTemplates()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 font-bold text-xs transition-all shadow-sm"
            >
              <LayoutTemplate size={13} /> 📋 Load Template
            </button>
          </div>

          {/* Active Template Banner */}
          {activeTemplate && (
            <div className="rounded-xl p-3.5 bg-violet-500/10 border border-violet-500/20 flex items-center justify-between text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-base">{activeTemplate.icon || '📋'}</span>
                <div>
                  <span className="font-bold text-violet-300">Template Loaded: {activeTemplate.name}</span>
                  <span className="text-slate-400 ml-2 font-mono-crisp">({activeTemplate.prompts?.length || 0} prompts)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTemplate(null)
                  setEvalMode('template')
                  setCustomPromptsText('')
                }}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                title="Clear Template"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="flex gap-2 p-1 rounded-xl bg-black/40 border border-white/5">
            {[
              { id: 'template', icon: <Sparkles size={13} />, label: 'Standard Categories', color: 'bg-violet-600' },
              { id: 'custom',   icon: <Upload size={13} />,   label: 'Custom Dataset',        color: 'bg-cyan-600' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEvalMode(tab.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  evalMode === tab.id ? `${tab.color} text-white shadow-lg` : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Model Name */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Model Name</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. llama-3.3-70b-versatile, gemini-1.5-flash"
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono-crisp text-xs"
            />
            
            {/* Quick 3-col grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {QUICK_MODELS.map((m) => {
                const pc = PROVIDER_COLORS[m.provider] || {}
                const isActive = model === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setModel(m.value)}
                    className="flex flex-col items-start p-2.5 rounded-xl border text-left transition-all group"
                    style={{
                      background: isActive ? 'rgba(124,58,237,0.15)' : 'var(--bg-elevated)',
                      borderColor: isActive ? '#7C3AED' : 'var(--border-subtle)',
                    }}
                  >
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded mb-1" style={{ background: pc.bg, color: pc.text }}>
                      {m.provider}
                    </span>
                    <span className="text-xs font-bold text-slate-200 truncate w-full font-mono-crisp">{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category / Custom config */}
          {evalMode === 'template' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Category</label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full appearance-none px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-violet-500 cursor-pointer"
                  >
                    {PROMPT_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Number of Tests</label>
                  <span className="text-xs font-black font-mono-crisp text-violet-400">{numTests}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="5"
                  value={numTests}
                  onChange={(e) => setNumTests(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-600 font-mono-crisp mt-1">
                  <span>5</span>
                  <span>10</span>
                  <span>15</span>
                  <span>20</span>
                  <span>30</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File upload or text */}
              <div className="border border-dashed border-white/10 rounded-2xl p-6 text-center hover:border-cyan-500/40 transition-colors cursor-pointer relative" style={{ background: 'var(--bg-elevated)' }}>
                <input
                  type="file"
                  accept=".csv,.json,.jsonl"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload size={24} className="mx-auto text-cyan-400 mb-2" />
                <p className="text-xs font-bold text-slate-200">
                  {fileName ? `Uploaded: ${fileName}` : 'Drop CSV or JSON dataset here, or browse'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Supports auto-detection of prompt columns</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Or paste raw prompts (one per line)</label>
                <textarea
                  rows={4}
                  value={customPromptsText}
                  onChange={(e) => setCustomPromptsText(e.target.value)}
                  placeholder="What is 2+2?&#10;Write a python quicksort&#10;Explain quantum mechanics"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono-crisp"
                />
              </div>
            </div>
          )}

          {/* Red-Team Toggle */}
          <div
            onClick={() => setIncludeRedteam(r => !r)}
            className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border"
            style={{
              background: includeRedteam ? 'rgba(239,68,68,0.06)' : 'var(--bg-elevated)',
              borderColor: includeRedteam ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: includeRedteam ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)' }}>
                <Shield size={16} className={includeRedteam ? 'text-red-400' : 'text-slate-500'} />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200 block">Red-Team Adversarial Jailbreak Tests</span>
                <span className="text-[10px] text-slate-500">Inject 3 adversarial prompt injections to test guardrails</span>
              </div>
            </div>
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${includeRedteam ? 'bg-red-500' : 'bg-white/10'}`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${includeRedteam ? 'left-5' : 'left-1'}`}
              />
            </div>
          </div>

          {/* Launch Button */}
          <button
            onClick={handleLaunch}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-violet-600/30 active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
          >
            <Zap size={14} className="inline mr-2" />
            Launch Evaluation Pipeline
          </button>
        </motion.div>
      ) : (
        /* Running Pipeline View */
        <motion.div
          variants={fadeUp}
          className="rounded-2xl p-7 space-y-6"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <Brain size={18} className="animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-mono-crisp">{model}</h3>
                <span className="text-[10px] text-slate-500 font-mono-crisp">Elapsed: {fmtTime(elapsedSecs)}</span>
              </div>
            </div>
            <button
              onClick={handleCancel}
              disabled={isCancelled}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-all"
            >
              Cancel Run
            </button>
          </div>

          {/* Stage pills */}
          <div className="grid grid-cols-5 gap-2">
            {STAGES.map((s, idx) => {
              const isDone = completedStages.has(idx)
              const isCurr = currentStage === idx
              return (
                <div
                  key={s.key}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    isDone
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : isCurr
                      ? 'border-violet-500/60 bg-violet-500/20 text-violet-200 animate-pulse'
                      : 'border-white/5 bg-black/20 text-slate-600'
                  }`}
                >
                  <span className="text-base block mb-1">{s.icon}</span>
                  <span className="text-[10px] font-bold block truncate">{s.label}</span>
                </div>
              )
            })}
          </div>

          {/* Terminal log */}
          <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: 'var(--bg-base)' }}>
            <div className="px-4 py-2 bg-black/40 border-b border-white/5 flex items-center justify-between text-[10px] font-mono-crisp text-slate-500 uppercase">
              <span>Pipeline Stream Output</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> LIVE</span>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto space-y-1.5 font-mono-crisp text-xs">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-2">
                  <span className="text-slate-600 shrink-0">{l.time}</span>
                  <span>{l.emoji}</span>
                  <span className="text-slate-300 break-all">{l.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
