import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { API_BASE } from '../config'
import { FileText, Download, Copy, ExternalLink, RefreshCw } from 'lucide-react'

export default function Reports({ evalHistory }) {
  const modelsList = [...new Set(evalHistory.map(e => e.model))]
  const [selectedModel, setSelectedModel] = useState(modelsList[0] || 'gpt-4o')
  const [reportHtml, setReportHtml] = useState('')
  const [loading, setLoading] = useState(false)

  // AI Summary States
  const [aiSummary, setAiSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const fetchSummary = async (model) => {
    if (!model) return
    setLoadingSummary(true)
    try {
      const res = await axios.get(`${API_BASE}/summary/model/${encodeURIComponent(model)}`)
      setAiSummary(res.data)
    } catch {
      setAiSummary(null)
    } finally {
      setLoadingSummary(false)
    }
  }

  const fetchReport = async (model) => {
    if (!model) return
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/report/${encodeURIComponent(model)}`, { responseType: 'text' })
      setReportHtml(res.data)
    } catch {
      setReportHtml(`
        <div style="color: #ef4444; padding: 40px; text-align: center; font-family: sans-serif;">
          <h2>No Report Found</h2>
          <p>No generated HTML report available for model <strong>${model}</strong> yet.</p>
          <p style="color: #94a3b8; font-size: 13px;">Run an evaluation first to generate an official report.</p>
        </div>
      `)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedModel) {
      fetchReport(selectedModel)
      fetchSummary(selectedModel)
    }
  }, [selectedModel])

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${API_BASE}/report/${encodeURIComponent(selectedModel)}`)
    toast.success('Report URL copied to clipboard!')
  }

  const handleDownloadPdf = () => {
    window.print()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-20px)] flex flex-col space-y-4 animate-fade-in">
      {/* Top Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Evaluation Reports</h1>
          <p className="text-slate-400 text-sm">Official generated HTML reports with full security & health scores.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-violet-500 transition-all"
          >
            <Copy size={14} /> Copy Link
          </button>
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/30 border border-violet-500 text-xs font-semibold text-violet-300 hover:bg-violet-600 hover:text-white transition-all"
          >
            <Download size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left Model Sidebar */}
        <div className="w-64 rounded-2xl glass p-4 shrink-0 flex flex-col space-y-2 overflow-y-auto">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">Evaluated Models</span>
          {modelsList.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">No evaluations run yet</div>
          ) : (
            modelsList.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedModel(m)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all ${
                  selectedModel === m
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText size={14} />
                  <span className="truncate">{m}</span>
                </div>
                {selectedModel === m && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
              </button>
            ))
          )}
        </div>

        {/* Right Preview Card */}
        <div className="flex-1 rounded-2xl glass overflow-hidden flex flex-col min-h-0 border border-white/10">
          <div className="px-5 py-3 border-b border-white/10 bg-black/40 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-300">
              Report View: <span className="text-violet-400">{selectedModel}</span>
            </span>
            <button
              onClick={() => fetchReport(selectedModel)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Reload
            </button>
          </div>

          {/* AI Executive Summary Segment */}
          {loadingSummary ? (
            <div className="bg-white/5 border-b border-white/10 p-4 animate-pulse flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-ping" />
              <div className="h-3 bg-white/10 rounded w-48" />
            </div>
          ) : aiSummary ? (
            <div className="bg-violet-950/20 border-b border-white/10">
              <div className="p-4 flex flex-col space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-violet-400">🤖 AI Executive Summary</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border select-none ${
                      aiSummary.overall_grade === 'A' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                      aiSummary.overall_grade === 'B' ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' :
                      aiSummary.overall_grade === 'C' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' :
                      'bg-red-500/15 border-red-500/30 text-red-400'
                    }`}>
                      Grade: {aiSummary.overall_grade || '—'}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-[10px] text-violet-400 hover:text-violet-300 underline font-semibold transition-colors"
                  >
                    {showDetails ? 'Hide Analysis Details' : 'Show Analysis Details'}
                  </button>
                </div>

                <p className="text-xs text-slate-300 italic font-medium leading-relaxed">
                  "{aiSummary.overall_verdict}"
                </p>

                {showDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-white/5 animate-slide-down">
                    {/* Strengths */}
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 space-y-1.5">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Strengths</span>
                      <ul className="space-y-1 text-[11px] text-slate-300">
                        {aiSummary.strengths?.slice(0, 3).map((str, idx) => (
                          <li key={idx} className="truncate">• {str}</li>
                        ))}
                        {(!aiSummary.strengths || aiSummary.strengths.length === 0) && (
                          <li className="text-slate-500 italic">No specific strengths.</li>
                        )}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 space-y-1.5">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Weaknesses</span>
                      <ul className="space-y-1 text-[11px] text-slate-300">
                        {aiSummary.weaknesses?.slice(0, 3).map((str, idx) => (
                          <li key={idx} className="truncate">• {str}</li>
                        ))}
                        {(!aiSummary.weaknesses || aiSummary.weaknesses.length === 0) && (
                          <li className="text-slate-500 italic">No specific weaknesses.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex-1 bg-white overflow-y-auto">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-2">
                <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
                <p className="text-xs">Loading report...</p>
              </div>
            ) : (
              <iframe
                title="Report Frame"
                srcDoc={reportHtml}
                className="w-full h-full border-none"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
