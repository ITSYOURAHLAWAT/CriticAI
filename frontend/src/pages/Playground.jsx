import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import toast from 'react-hot-toast'
import { API_BASE } from '../config'
import {
  FlaskConical, Send, Zap, Trash2, Shield, Brain,
  ChevronDown, ChevronUp, X, Sparkles, HelpCircle, RefreshCw
} from 'lucide-react'
import { fadeUp, stagger } from '../lib/animations'

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
  return `${d}d ago`
}

const PROVIDER_COLORS = {
  groq:   { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', label: 'Groq' },
  gemini: { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-400',   label: 'Gemini' },
  ollama: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'Ollama' },
  other:  { bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  text: 'text-slate-400',  label: 'Simulation' },
}

const GRADE_COLORS = {
  A: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  B: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  C: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  D: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  F: 'text-red-400 border-red-500/30 bg-red-500/10',
}

const RESULT_COLORS = {
  pass:    'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  partial: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  fail:    'text-red-400 border-red-500/30 bg-red-500/10',
}

const MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile', provider: 'groq' },
  { value: 'mixtral-8x7b-32768',      label: 'mixtral-8x7b-32768',      provider: 'groq' },
  { value: 'gemma2-9b-it',           label: 'gemma2-9b-it',           provider: 'groq' },
  { value: 'gemini-1.5-flash',       label: 'gemini-1.5-flash',       provider: 'gemini' },
  { value: 'gemini-1.5-flash-8b',    label: 'gemini-1.5-flash-8b',    provider: 'gemini' },
  { value: 'llama3.1',               label: 'llama3.1 (local)',       provider: 'ollama' },
  { value: 'mistral',                label: 'mistral (local)',        provider: 'ollama' },
  { value: 'phi3',                   label: 'phi3 (local)',           provider: 'ollama' },
]

const QUICK_PROMPTS = [
  'Explain recursion',
  'Write Python bubble sort',
  'What is quantum entanglement?',
  'Write a haiku about AI',
  'Debug this: print(1/0)'
]

export default function Playground() {
  const [model, setModel] = useState('llama-3.3-70b-versatile')
  const [temperature, setTemperature] = useState(0.7)
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.')
  const [category, setCategory] = useState('general')

  const [prompt, setPrompt] = useState('')
  const [sentPrompt, setSentPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamTime, setStreamTime] = useState(0)
  const [streamStatus, setStreamStatus] = useState('idle')

  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [showStrengths, setShowStrengths] = useState(true)
  const [showWeaknesses, setShowWeaknesses] = useState(true)

  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const chatBottomRef = useRef(null)
  const textareaRef = useRef(null)

  const selectedModelObj = MODELS.find(m => m.value === model)
  const provider = selectedModelObj ? selectedModelObj.provider : 'other'
  const pStyle = PROVIDER_COLORS[provider] || PROVIDER_COLORS.other

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [prompt])

  const fetchHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await axios.get(`${API_BASE}/playground/history`)
      setHistory(res.data || [])
    } catch {
      toast.error('Failed to load playground history')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  useEffect(() => {
    if (streamStatus === 'generating') {
      const interval = setInterval(() => {
        setStreamTime(prev => Number((prev + 0.1).toFixed(1)))
      }, 100)
      return () => clearInterval(interval)
    }
  }, [streamStatus])

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [response])

  const sendPrompt = async () => {
    if (!prompt.trim()) return
    abortRef.current = new AbortController()

    setSentPrompt(prompt)
    setPrompt('')
    setResponse('')
    setEvaluation(null)
    setStreamTime(0)
    setStreamStatus('generating')
    setIsStreaming(true)

    try {
      const res = await fetch(`${API_BASE}/playground/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          model,
          provider,
          temperature,
          system_prompt: systemPrompt
        }),
        signal: abortRef.current.signal
      })

      if (!res.body) throw new Error('No readable response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'token') {
                fullText += event.content
                setResponse(fullText)
              }
              if (event.type === 'done') {
                setResponse(event.full_response || fullText)
                setStreamStatus('complete')
                setIsStreaming(false)
              }
              if (event.type === 'error') {
                toast.error(event.message)
                setStreamStatus('error')
                setIsStreaming(false)
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        toast('Streaming aborted')
        setStreamStatus('complete')
      } else {
        toast.error('Connection failed or timed out')
        setStreamStatus('error')
      }
      setIsStreaming(false)
    }
  }

  const stopStreaming = () => {
    if (abortRef.current) abortRef.current.abort()
    setIsStreaming(false)
  }

  const runEvaluation = async () => {
    if (!sentPrompt || !response || isStreaming) return
    setIsEvaluating(true)
    try {
      const res = await axios.post(`${API_BASE}/playground/evaluate`, {
        prompt: sentPrompt,
        response,
        model,
        category
      })
      setEvaluation(res.data)
      toast.success('Evaluation complete!')
      fetchHistory()
    } catch (e) {
      toast.error('Evaluation failed')
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleDeleteHistory = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this history session?')) return
    try {
      await axios.delete(`${API_BASE}/playground/history/${id}`)
      setHistory(prev => prev.filter(h => h.id !== id))
      toast.success('Session deleted')
    } catch {
      toast.error('Failed to delete history')
    }
  }

  const handleClearAllHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all history?')) return
    try {
      await axios.delete(`${API_BASE}/playground/history`)
      setHistory([])
      toast.success('History cleared')
    } catch {
      toast.error('Failed to clear history')
    }
  }

  const loadHistoryItem = (item) => {
    if (isStreaming) return
    setSentPrompt(item.prompt)
    setResponse(item.response)
    setModel(item.model)
    setCategory(item.category || 'general')
    setStreamStatus('complete')
    setStreamTime(0)
    setEvaluation({
      score: item.score,
      result: item.result,
      reasoning: item.reasoning,
      strengths: item.strengths,
      weaknesses: item.weaknesses,
      grade: item.grade
    })
  }

  const handleClearChat = () => {
    setSentPrompt('')
    setResponse('')
    setEvaluation(null)
    setStreamStatus('idle')
    setStreamTime(0)
  }

  const estimatedTokens = Math.round(response.length / 4)

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="flex h-[calc(100vh-48px)] overflow-hidden text-slate-300"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* ─── LEFT COLUMN: CONFIG (w-64) ─── */}
      <motion.div variants={fadeUp} className="w-64 border-r border-white/5 overflow-y-auto p-4 space-y-6 flex flex-col shrink-0" style={{ background: 'var(--bg-surface)' }}>
        <h2 className="text-xs font-black text-slate-100 flex items-center gap-1.5 border-b border-white/5 pb-3">
          <span>⚙️</span> Configuration
        </h2>

        {/* Card 1: Model Settings */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-violet-500 cursor-pointer font-mono-crisp"
            >
              <optgroup label="Groq (Free Cloud)">
                {MODELS.filter(m => m.provider === 'groq').map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="Gemini (Free Cloud)">
                {MODELS.filter(m => m.provider === 'gemini').map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="Ollama (Local)">
                {MODELS.filter(m => m.provider === 'ollama').map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Provider</span>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${pStyle.bg} ${pStyle.border} ${pStyle.text}`}>
              {pStyle.label}
            </span>
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Temperature</span>
              <span className="text-white font-mono-crisp">{temperature}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.1"
              value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[9px] text-slate-600 font-medium">
              <span>Focused (0.0)</span>
              <span>Balanced (0.5)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Prompt</label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant."
              className="w-full px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/10 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono-crisp"
            />
          </div>
        </div>

        {/* Card 2: Quick Prompts */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Quick Prompts</label>
          <div className="flex flex-col gap-1.5">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                disabled={isStreaming}
                className="text-left px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-400 hover:text-white hover:border-violet-500 hover:bg-violet-600/5 transition-all truncate"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Card 3: Evaluation Category */}
        <div className="space-y-1.5 mt-auto border-t border-white/5 pt-4">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evaluation Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-violet-500 cursor-pointer"
          >
            <option value="general">General</option>
            <option value="coding">Coding</option>
            <option value="reasoning">Reasoning</option>
            <option value="safety">Safety</option>
            <option value="factuality">Factuality</option>
            <option value="creativity">Creativity</option>
          </select>
        </div>
      </motion.div>

      {/* ─── CENTER COLUMN: CHAT INTERFACE (flex-1) ─── */}
      <div className="flex-1 flex flex-col overflow-hidden relative scanlines" style={{ background: 'var(--bg-base)' }}>
        {/* Top Header */}
        <div className="h-12 border-b border-white/5 flex items-center justify-between px-6 shrink-0" style={{ background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-slate-200 font-mono-crisp">{model}</span>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${pStyle.bg} ${pStyle.border} ${pStyle.text}`}>
              {pStyle.label}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {response && (
              <span className="text-xs text-slate-500 font-mono-crisp">
                ~{estimatedTokens} tokens
              </span>
            )}
            {(sentPrompt || response) && (
              <button
                onClick={handleClearChat}
                disabled={isStreaming}
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-red-400 transition-colors"
                title="Clear Chat"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Chat display scroll zone */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {streamStatus === 'idle' && !sentPrompt && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto">
              <div className="p-5 rounded-3xl bg-violet-600/10 border border-violet-500/20 text-violet-400 relative">
                <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full" />
                <FlaskConical size={32} className="relative z-10 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-200">Prompt Playground</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Send a prompt to see real-time streaming response. Then evaluate the response with one click.
                </p>
              </div>
            </div>
          )}

          {/* Prompt Section */}
          {sentPrompt && (
            <motion.div variants={fadeUp} className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-1.5">
              <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Your Prompt</div>
              <p className="text-sm text-slate-200 font-mono-crisp whitespace-pre-wrap">{sentPrompt}</p>
            </motion.div>
          )}

          {/* Response Section */}
          {(response || streamStatus === 'generating') && (
            <motion.div variants={fadeUp} className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 space-y-3 relative overflow-hidden">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-violet-400 border-b border-violet-500/10 pb-2">
                <span className="flex items-center gap-1.5">
                  {streamStatus === 'generating' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
                  )}
                  {streamStatus === 'generating' ? 'Generating...' : 'Response'}
                </span>
                <span className="font-mono-crisp text-slate-500">
                  {streamStatus === 'generating' ? `${streamTime}s` : 'Complete'}
                </span>
              </div>

              <p
                className={`text-sm text-slate-200 leading-relaxed font-mono-crisp whitespace-pre-wrap ${
                  streamStatus === 'generating' ? "after:content-['▌'] after:animate-pulse after:ml-0.5 after:text-violet-400" : ''
                }`}
              >
                {response}
              </p>

              {streamStatus === 'complete' && (
                <div className="text-[10px] text-slate-500 border-t border-violet-500/10 pt-2 flex justify-between items-center font-mono-crisp">
                  <span>~{estimatedTokens} tokens  •  {streamTime}s</span>
                  <span className="font-bold">{model}</span>
                </div>
              )}
            </motion.div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Bottom Input Section */}
        <div className="p-4 border-t border-white/5 shrink-0" style={{ background: 'var(--bg-surface)' }}>
          <div className="max-w-3xl mx-auto space-y-3">
            <textarea
              ref={textareaRef}
              rows={1}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendPrompt()
                }
              }}
              placeholder="Type your prompt here... (Press Enter to Send)"
              className="w-full px-4 py-3 rounded-2xl bg-black/40 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-all resize-none font-mono-crisp"
              style={{ minHeight: '44px' }}
            />

            <div className="flex gap-3">
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-600/10"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" /> Stop Streaming
                </button>
              ) : (
                <button
                  onClick={sendPrompt}
                  disabled={!prompt.trim() || isStreaming}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-opacity disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
                >
                  <Send size={12} /> Send Prompt
                </button>
              )}

              <button
                onClick={runEvaluation}
                disabled={!response || isStreaming || isEvaluating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              >
                {isEvaluating ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" /> Evaluating...
                  </>
                ) : (
                  <>
                    <Zap size={12} /> Evaluate Response
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── RIGHT COLUMN: EVAL RESULTS + HISTORY (w-72) ─── */}
      <motion.div variants={fadeUp} className="w-72 border-l border-white/5 flex flex-col overflow-hidden shrink-0" style={{ background: 'var(--bg-surface)' }}>
        
        {/* Top: Eval results */}
        <div className="flex-1 overflow-y-auto p-4 border-b border-white/5 space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Shield size={13} className="text-cyan-400" /> Evaluation Result
          </h2>

          {!isEvaluating && !evaluation && (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 border border-white/5 rounded-2xl bg-white/[0.01] space-y-3">
              <Shield size={24} className="text-slate-700" />
              <div className="text-xs text-slate-500">
                <p className="font-semibold">Evaluate a response</p>
                <p className="text-[10px] mt-0.5">Click "Evaluate Response" after sending a prompt.</p>
              </div>
            </div>
          )}

          {isEvaluating && (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 border border-white/5 rounded-2xl bg-white/[0.01] space-y-3">
              <Brain size={24} className="text-violet-500 animate-spin" />
              <div className="text-xs text-slate-400">
                <p className="font-semibold">Evaluating response...</p>
                <p className="text-[10px] mt-0.5 text-slate-500">Using LLM-as-judge pattern</p>
              </div>
            </div>
          )}

          {!isEvaluating && evaluation && (
            <div className="p-4 rounded-2xl border border-white/10 space-y-4 animate-fade-in" style={{ background: 'var(--bg-elevated)' }}>
              {/* Grade */}
              <div className="flex flex-col items-center justify-center text-center py-2">
                <span className={`text-6xl font-black font-mono-crisp ${GRADE_COLORS[evaluation.grade] || 'text-slate-400'}`}>
                  {evaluation.grade || '—'}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1 font-mono-crisp">Score: {evaluation.score}/100</span>
              </div>

              {/* Status Badge */}
              <div className="flex justify-center">
                <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase border ${RESULT_COLORS[evaluation.result] || 'border-white/10'}`}>
                  {evaluation.result || 'fail'}
                </span>
              </div>

              {/* Reasoning */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Reasoning</label>
                <p className="text-xs text-violet-300 leading-relaxed bg-white/[0.02] border border-white/5 p-2.5 rounded-xl font-mono-crisp">
                  {evaluation.reasoning}
                </p>
              </div>

              {/* Strengths */}
              {evaluation.strengths?.length > 0 && (
                <div className="space-y-1">
                  <button
                    onClick={() => setShowStrengths(!showStrengths)}
                    className="w-full flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-wider"
                  >
                    <span>✅ Strengths</span>
                    {showStrengths ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showStrengths && (
                    <ul className="text-[11px] text-emerald-400 space-y-1 pl-4 list-disc bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                      {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* Weaknesses */}
              {evaluation.weaknesses?.length > 0 && (
                <div className="space-y-1">
                  <button
                    onClick={() => setShowWeaknesses(!showWeaknesses)}
                    className="w-full flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-wider"
                  >
                    <span>⚠️ Weaknesses</span>
                    {showWeaknesses ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showWeaknesses && (
                    <ul className="text-[11px] text-amber-400 space-y-1 pl-4 list-disc bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
                      {evaluation.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom: History list */}
        <div className="h-64 flex flex-col overflow-hidden p-4">
          <div className="flex justify-between items-center shrink-0 pb-2 border-b border-white/5">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Recent Sessions
            </h2>
            {history.length > 0 && (
              <button
                onClick={handleClearAllHistory}
                className="text-[10px] text-red-400 hover:text-red-300 font-semibold"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2">
            {loadingHistory && history.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-6">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-center text-xs text-slate-600 py-6">No recent evaluations</div>
            ) : (
              history.map(h => (
                <div
                  key={h.id}
                  onClick={() => loadHistoryItem(h)}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 hover:border-violet-500/30 transition-all cursor-pointer flex justify-between items-start gap-2 group"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] text-slate-300 font-medium truncate font-mono-crisp">{h.prompt_preview}</p>
                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono-crisp">
                      <span className="truncate max-w-[60px]">{h.model}</span>
                      <span>•</span>
                      <span>{relativeTime(h.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 font-mono-crisp">
                    <span className="text-[10px] font-bold text-violet-400">{h.score}%</span>
                    <button
                      onClick={(e) => handleDeleteHistory(h.id, e)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
