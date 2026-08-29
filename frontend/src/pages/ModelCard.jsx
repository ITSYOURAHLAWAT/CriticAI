import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  CreditCard, Download, Copy, RefreshCw, CheckCircle2,
  AlertTriangle, Shield, Inbox, Check, FileText, Server,
  TrendingUp, Activity, ExternalLink
} from 'lucide-react'
import { API_BASE, PROVIDER_COLORS } from '../config'

// Helper for relative time
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

// Letter grade badge color helper
function getGradeStyle(grade) {
  const g = (grade || 'F').toUpperCase()
  if (g === 'A') return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' }
  if (g === 'B') return { bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.3)', text: '#22d3ee' }
  if (g === 'C') return { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', text: '#fbbf24' }
  if (g === 'D') return { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)', text: '#fb923c' }
  return { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', text: '#f87171' }
}

export default function ModelCard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [evaluations, setEvaluations] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedModel, setSelectedModel] = useState(null)
  
  const [cardMarkdown, setCardMarkdown] = useState('')
  const [evalId, setEvalId] = useState('')
  const [loadingCard, setLoadingCard] = useState(false)
  const [rawMode, setRawMode] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Fetch unique models from evaluations list
  useEffect(() => {
    const fetchEvals = async () => {
      setLoadingList(true)
      try {
        const res = await axios.get(`${API_BASE}/evaluations?limit=200`)
        setEvaluations(res.data || [])
      } catch (err) {
        toast.error('Failed to load evaluations list')
      } finally {
        setLoadingList(false)
      }
    }
    fetchEvals()
  }, [])

  // Derive unique models with their latest evaluation details
  const modelList = useMemo(() => {
    const map = {}
    evaluations.forEach(ev => {
      if (!map[ev.model]) {
        map[ev.model] = ev
      }
    })
    return Object.values(map)
  }, [evaluations])

  // Select model from query param or first item
  useEffect(() => {
    const modelParam = searchParams.get('model')
    if (modelParam) {
      setSelectedModel(modelParam)
    } else if (modelList.length > 0 && !selectedModel) {
      setSelectedModel(modelList[0].model)
    }
  }, [modelList, searchParams])

  // Fetch Model Card when selectedModel changes
  useEffect(() => {
    if (!selectedModel) return
    
    const fetchCard = async () => {
      setLoadingCard(true)
      try {
        const res = await axios.get(`${API_BASE}/model-card/model/${encodeURIComponent(selectedModel)}`)
        setCardMarkdown(res.data)
        // Extract evaluation ID from headers
        const headerEvalId = res.headers['x-eval-id']
        if (headerEvalId) {
          setEvalId(headerEvalId)
        } else {
          // Fallback search in evaluations
          const matchingEval = modelList.find(m => m.model === selectedModel)
          if (matchingEval) {
            setEvalId(matchingEval.id)
          }
        }
      } catch (err) {
        setCardMarkdown('')
        toast.error(`Could not load model card for ${selectedModel}`)
      } finally {
        setLoadingCard(false)
      }
    }
    fetchCard()
  }, [selectedModel, modelList])

  const handleSelectModel = (modelName) => {
    setSelectedModel(modelName)
    setSearchParams({ model: modelName })
  }

  const handleDownload = () => {
    if (!cardMarkdown) return
    const blob = new Blob([cardMarkdown], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedModel}_card.md`
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Model Card downloaded successfully!')
  }

  const handleCopy = () => {
    if (!cardMarkdown) return
    navigator.clipboard.writeText(cardMarkdown)
      .then(() => toast.success('Model Card copied to clipboard! 📋'))
      .catch(() => toast.error('Failed to copy text'))
  }

  const handleRegenerate = async () => {
    if (!evalId) {
      toast.error('No evaluation ID found to regenerate.')
      return
    }
    setRegenerating(true)
    try {
      const res = await axios.post(`${API_BASE}/model-card/regenerate/${evalId}`)
      setCardMarkdown(res.data)
      toast.success('Model Card regenerated successfully!')
    } catch (err) {
      toast.error('Failed to regenerate model card')
    } finally {
      setRegenerating(false)
    }
  }

  // Parse card Markdown segments manually
  const parsedData = useMemo(() => {
    if (!cardMarkdown) return null

    const sections = {}
    let currentHeader = 'intro'
    let buffer = []

    const lines = cardMarkdown.split('\n')
    lines.forEach(line => {
      if (line.startsWith('## ')) {
        // Save previous section
        sections[currentHeader] = buffer.join('\n').strip ? buffer.join('\n').trim() : buffer.join('\n')
        buffer = []
        // Clean header name
        currentHeader = line.replace('##', '').replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim().toLowerCase()
      } else {
        buffer.push(line)
      }
    })
    // Save last section
    sections[currentHeader] = buffer.join('\n').strip ? buffer.join('\n').trim() : buffer.join('\n')

    // Parse Evaluation Summary Table
    const summaryTable = []
    const summarySection = sections['evaluation summary'] || ''
    const summaryLines = summarySection.split('\n')
    summaryLines.forEach(line => {
      if (line.includes('|') && !line.includes('---') && !line.includes('Metric')) {
        const parts = line.split('|').map(p => p.trim()).filter(Boolean)
        if (parts.length >= 2) {
          summaryTable.push({
            metric: parts[0].replace(/\*\*/g, ''),
            value: parts[1]
          })
        }
      }
    })

    // Parse Performance Categories & Real CSS Progress Bars
    const categoriesList = []
    const performanceSection = sections['performance by category'] || ''
    
    // Parse table rows
    const perfLines = performanceSection.split('\n')
    let readingCodeBlock = false
    perfLines.forEach(line => {
      if (line.startsWith('```')) {
        readingCodeBlock = !readingCodeBlock
        return
      }
      // If table row
      if (!readingCodeBlock && line.includes('|') && !line.includes('---') && !line.includes('Category')) {
        const parts = line.split('|').map(p => p.trim()).filter(Boolean)
        if (parts.length >= 2) {
          const scoreVal = parseFloat(parts[1]) || 0
          categoriesList.push({
            name: parts[0],
            score: scoreVal,
            grade: parts[2] || 'F'
          })
        }
      }
    })

    // Parse Strengths list
    const strengths = []
    const strengthsSection = sections['strengths'] || ''
    strengthsSection.split('\n').forEach(line => {
      const match = line.match(/^[-*]\s+(.*)$/)
      if (match) strengths.push(match[1])
    })

    // Parse Weaknesses list
    const weaknesses = []
    const weaknessesSection = sections['weaknesses & limitations'] || ''
    weaknessesSection.split('\n').forEach(line => {
      const match = line.match(/^[-*]\s+(.*)$/)
      if (match) weaknesses.push(match[1])
    })

    // Parse Red-team section
    const redteamBlock = sections['red-team & safety analysis'] || ''

    // Parse Suitable / Not Recommended lists
    const suitableFor = []
    const notSuitableFor = []
    const recSection = sections['recommended use cases'] || ''
    let recSubMode = null
    recSection.split('\n').forEach(line => {
      if (line.includes('Suitable For')) {
        recSubMode = 'suitable'
      } else if (line.includes('Not Recommended For')) {
        recSubMode = 'not'
      } else {
        const match = line.match(/^[-*]\s+(.*)$/)
        if (match) {
          if (recSubMode === 'suitable') suitableFor.push(match[1])
          if (recSubMode === 'not') notSuitableFor.push(match[1])
        }
      }
    })

    // Parse Recommendations
    const tips = []
    const tipsSection = sections['improvement recommendations'] || ''
    tipsSection.split('\n').forEach(line => {
      const match = line.match(/^\d+\.\s+(.*)$/)
      if (match) tips.push(match[1])
    })

    // Parse Citation Code Block
    let citation = ''
    const citationSection = sections['citation'] || ''
    const citMatch = citationSection.match(/```bibtex([\s\S]*?)```/)
    if (citMatch) {
      citation = citMatch[1].trim()
    } else {
      citation = citationSection.replace(/```/g, '').trim()
    }

    return {
      overallGrade: summaryTable.find(r => r.metric.includes('Grade'))?.value || 'F',
      overallVerdict: sections['overall verdict'] || 'No verdict available.',
      summaryTable,
      categoriesList,
      strengths,
      weaknesses,
      redteamBlock,
      suitableFor,
      notSuitableFor,
      tips,
      citation
    }
  }, [cardMarkdown])

  // Custom Raw Markdown code-coloring spans
  const highlightedMarkdown = useMemo(() => {
    if (!cardMarkdown) return []
    return cardMarkdown.split('\n').map((line, idx) => {
      let className = 'text-slate-200'
      if (line.startsWith('#')) {
        className = 'text-violet-400 font-bold'
      } else if (line.startsWith('|')) {
        className = 'text-slate-400 font-mono'
      } else if (line.startsWith('-') || line.startsWith('*')) {
        className = 'text-slate-300'
      } else if (line.startsWith('>')) {
        className = 'text-cyan-300 italic'
      } else if (line.startsWith('```')) {
        className = 'text-slate-500 font-semibold'
      }
      return <div key={idx} className={`${className} min-h-[1.2rem] whitespace-pre-wrap`}>{line}</div>
    })
  }, [cardMarkdown])

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden text-slate-200">
      
      {/* LEFT PANEL: SELECT MODEL */}
      <div className="w-72 border-r border-white/5 bg-black/30 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/5 bg-black/10 flex items-center gap-2">
          <Server size={16} className="text-violet-400" />
          <h2 className="text-sm font-bold tracking-wide text-slate-100">Select Model</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loadingList ? (
            [1, 2, 3, 4].map(i => (
              <div key={i} className="p-4 rounded-xl border border-white/5 animate-pulse bg-white/5 space-y-2">
                <div className="h-3 bg-white/10 rounded w-2/3" />
                <div className="h-2 bg-white/5 rounded w-1/3" />
              </div>
            ))
          ) : modelList.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Inbox size={28} className="mx-auto text-slate-600" />
              <p className="text-xs">No evaluations found.</p>
              <p className="text-[10px] text-slate-600">Run evaluations to generate model cards.</p>
            </div>
          ) : (
            modelList.map(item => {
              const isActive = selectedModel === item.model
              const p = (item.provider || 'other').toLowerCase()
              const pc = PROVIDER_COLORS[p] || PROVIDER_COLORS.other
              const gs = getGradeStyle(item.pass_rate >= 90 ? 'A' : item.pass_rate >= 80 ? 'B' : item.pass_rate >= 70 ? 'C' : item.pass_rate >= 60 ? 'D' : 'F')
              
              return (
                <button
                  key={item.model}
                  onClick={() => handleSelectModel(item.model)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${
                    isActive
                      ? 'bg-violet-500/10 border-violet-500/30'
                      : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-start w-full gap-2">
                    <span className="font-bold text-xs text-slate-100 truncate flex-1 leading-tight">{item.model}</span>
                    <span
                      className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 border"
                      style={{ background: gs.bg, borderColor: gs.border, color: gs.text }}
                    >
                      {item.pass_rate >= 90 ? 'A' : item.pass_rate >= 80 ? 'B' : item.pass_rate >= 70 ? 'C' : item.pass_rate >= 60 ? 'D' : 'F'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between w-full">
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded"
                      style={{ background: pc.bg, border: `1px solid ${pc.border}`, color: pc.text }}
                    >
                      {item.provider}
                    </span>
                    <span className="text-[10px] text-slate-500">{relativeTime(item.created_at)}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: DISPLAY MODEL CARD */}
      <div className="flex-1 flex flex-col bg-black/10 overflow-hidden relative">
        
        {!selectedModel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="p-6 rounded-3xl bg-violet-600/10 border border-violet-500/20 text-violet-400 shadow-lg shadow-violet-500/5 animate-pulse">
              <CreditCard size={42} />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-slate-200 font-bold text-base">Select a model to view its card</h3>
              <p className="text-slate-500 text-xs leading-relaxed">
                CriticAI automatically compiles a HuggingFace-style Model Card summary after every completed pipeline.
              </p>
            </div>
          </div>
        ) : loadingCard ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-pulse">
            <div className="flex justify-between items-center pb-4 border-b border-white/5">
              <div className="h-5 bg-white/10 rounded w-1/3" />
              <div className="h-8 bg-white/5 rounded w-40" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-44 bg-white/5 rounded-2xl" />
              <div className="h-44 bg-white/5 rounded-2xl" />
            </div>
            <div className="h-28 bg-white/5 rounded-2xl" />
            <div className="h-40 bg-white/5 rounded-2xl" />
          </div>
        ) : !cardMarkdown ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
            <AlertTriangle size={36} className="text-red-400" />
            <p className="text-slate-300 font-semibold">Failed to load Model Card</p>
            <p className="text-slate-500 text-xs">Verify uvicorn is running on port 8000.</p>
          </div>
        ) : (
          <>
            {/* STICKY ACTION HEADER */}
            <div className="sticky top-0 z-10 px-6 py-4 bg-black/35 backdrop-blur-md border-b border-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-base font-bold text-slate-100 truncate">{selectedModel}</h1>
                {parsedData && (
                  <span
                    className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border"
                    style={getGradeStyle(parsedData.overallGrade)}
                  >
                    Grade: {parsedData.overallGrade}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setRawMode(!rawMode)}
                  className={`px-3 py-1.8 text-xs font-semibold rounded-xl border transition-all ${
                    rawMode
                      ? 'bg-violet-600 border-violet-500 text-white shadow-md'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {rawMode ? 'Rendered View' : 'Raw Markdown'}
                </button>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.8 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all flex items-center gap-1.5"
                  title="Copy Code"
                >
                  <Copy size={13} /> Copy
                </button>
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.8 text-xs font-semibold rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500 hover:text-white transition-all flex items-center gap-1.5"
                  title="Download File"
                >
                  <Download size={13} /> Download
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="px-3 py-1.8 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                  title="Regenerate"
                >
                  <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
                  {regenerating ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            </div>

            {/* CARD SCROLL CONTAINER */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {rawMode ? (
                /* VIEW MODE: RAW MARKDOWN SOURCE */
                <div className="rounded-2xl border border-white/10 bg-black/60 p-6 font-mono text-xs leading-relaxed overflow-x-auto shadow-inner select-text">
                  {highlightedMarkdown}
                </div>
              ) : (
                /* VIEW MODE: BEAUTIFULLY RENDERED APP RENDERERS */
                parsedData && (
                  <div className="space-y-6 max-w-4xl select-none animate-fade-in">
                    
                    {/* Verdict Card */}
                    <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-violet-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Verdict & Review</h3>
                      </div>
                      <p className="text-sm font-medium text-slate-200 leading-relaxed italic border-l-2 border-violet-500/50 pl-4 bg-violet-500/[0.02] py-2 rounded-r-lg">
                        "{parsedData.overallVerdict.replace(/>/g, '').trim()}"
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Metric Summary Table */}
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Activity size={16} className="text-violet-400" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Evaluation Metrics</h3>
                        </div>
                        <div className="rounded-xl border border-white/5 overflow-hidden bg-black/30">
                          <table className="w-full text-left border-collapse text-xs">
                            <tbody className="divide-y divide-white/5">
                              {parsedData.summaryTable.map((row, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'}>
                                  <td className="py-2.5 px-4 font-semibold text-slate-400">{row.metric}</td>
                                  <td className="py-2.5 px-4 font-bold text-slate-100">{row.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Performance Category Progress Bars */}
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Activity size={16} className="text-cyan-400" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Category Scores</h3>
                        </div>
                        <div className="space-y-3.5">
                          {parsedData.categoriesList.length === 0 ? (
                            <p className="text-slate-500 text-xs italic">No category performance scores available.</p>
                          ) : (
                            parsedData.categoriesList.map(cat => {
                              const score = cat.score
                              const isGreen = score >= 80
                              const isYellow = score >= 60
                              const colorClass = isGreen ? 'bg-emerald-500 shadow-emerald-500/20' : isYellow ? 'bg-yellow-500 shadow-yellow-500/20' : 'bg-red-500 shadow-red-500/20'
                              const textClass = isGreen ? 'text-emerald-400' : isYellow ? 'text-yellow-400' : 'text-red-400'
                              
                              return (
                                <div key={cat.name} className="flex items-center gap-3">
                                  <span className="w-20 text-[11px] font-semibold text-slate-400 truncate capitalize">{cat.name}</span>
                                  <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden shadow-inner">
                                    <div
                                      className={`h-full rounded-full transition-all duration-1000 ${colorClass}`}
                                      style={{ width: `${score}%` }}
                                    />
                                  </div>
                                  <span className={`w-12 text-right font-mono font-bold text-xs ${textClass}`}>{score}%</span>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Strengths & Weaknesses side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Strengths Box */}
                      <div className="p-5 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/20 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <CheckCircle2 size={16} />
                          <h3 className="text-xs font-bold uppercase tracking-wider">Identified Strengths</h3>
                        </div>
                        <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                          {parsedData.strengths.map((str, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-emerald-500 font-bold shrink-0 mt-0.5">•</span>
                              <span dangerouslySetInnerHTML={{ __html: str }} />
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Weaknesses Box */}
                      <div className="p-5 rounded-2xl bg-amber-500/[0.03] border border-amber-500/20 space-y-3">
                        <div className="flex items-center gap-2 text-amber-400">
                          <AlertTriangle size={16} />
                          <h3 className="text-xs font-bold uppercase tracking-wider">Limitations & Risks</h3>
                        </div>
                        <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                          {parsedData.weaknesses.map((weak, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                              <span dangerouslySetInnerHTML={{ __html: weak }} />
                            </li>
                          ))}
                        </ul>
                      </div>

                    </div>

                    {/* Red-Teaming Safety Section */}
                    {parsedData.redteamBlock && (
                      <div className="p-5 rounded-2xl bg-red-500/[0.03] border border-red-500/20 space-y-3">
                        <div className="flex items-center gap-2 text-red-400">
                          <Shield size={16} />
                          <h3 className="text-xs font-bold uppercase tracking-wider">Safety & Vulnerability Assessment</h3>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {parsedData.redteamBlock.replace(/>/g, '').trim()}
                        </p>
                      </div>
                    )}

                    {/* Suitable / Not Suitable */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Suitable tags */}
                      <div className="p-5 rounded-2xl bg-cyan-500/[0.03] border border-cyan-500/20 space-y-3.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Suitable For</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {parsedData.suitableFor.map((item, idx) => (
                            <span key={idx} className="text-[10px] font-semibold bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 px-2.5 py-1 rounded-lg">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Not suitable tags */}
                      <div className="p-5 rounded-2xl bg-red-500/[0.03] border border-red-500/20 space-y-3.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Not Recommended For</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {parsedData.notSuitableFor.map((item, idx) => (
                            <span key={idx} className="text-[10px] font-semibold bg-red-500/10 border border-red-500/20 text-red-300 px-2.5 py-1 rounded-lg">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Improvement Tips */}
                    <div className="p-5 rounded-2xl bg-violet-500/[0.03] border border-violet-500/20 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-violet-400">Improvement Recommendations</h4>
                      <div className="space-y-3">
                        {parsedData.tips.map((tip, idx) => (
                          <div key={idx} className="flex gap-3 items-start">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-mono text-[10px] shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Citation */}
                    {parsedData.citation && (
                      <div className="p-5 rounded-2xl bg-black/40 border border-white/5 space-y-3 relative group">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Citation</h4>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(parsedData.citation)
                              toast.success('Citation copied to clipboard!')
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            Copy BibTeX
                          </button>
                        </div>
                        <pre className="p-4 rounded-xl bg-black/60 border border-white/5 text-[11px] font-mono text-emerald-400 overflow-x-auto shadow-inner select-text">
                          {parsedData.citation}
                        </pre>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="pt-4 pb-6 text-center text-[10px] text-slate-600 italic">
                      Generated by CriticAI — Powered by LangGraph + FastAPI + Groq
                    </div>

                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
