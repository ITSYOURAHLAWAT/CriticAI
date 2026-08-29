import React from 'react'
import { X, Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react'

export default function RightPanel({ evalHistory, onClose }) {
  const recent = evalHistory.slice(0, 8)
  const passRate = evalHistory.length > 0
    ? Math.round(evalHistory.filter(e => e.status === 'completed').length / evalHistory.length * 100)
    : 0

  return (
    <aside
      className="flex flex-col h-screen shrink-0 animate-slide-right"
      style={{
        width: '280px',
        background: '#0D0D14',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-violet-400" />
          <span className="text-sm font-semibold text-slate-200">Activity</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Total Runs', value: evalHistory.length, color: '#7C3AED' },
          { label: 'Success Rate', value: `${passRate}%`, color: '#22c55e' },
        ].map(s => (
          <div key={s.label} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Evals */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Evaluations</div>
        {recent.length === 0 ? (
          <div className="text-center py-8">
            <Clock size={24} className="text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-600">No evaluations yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((e, i) => (
              <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-300 truncate">{e.model}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{e.category} · {e.numTests} tests</div>
                  </div>
                  {e.status === 'completed'
                    ? <CheckCircle size={12} className="text-cyan-400 shrink-0 mt-0.5" />
                    : <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                  }
                </div>
                <div className="text-xs text-slate-700 mt-1.5">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs text-slate-700">Powered by LangGraph + FastAPI</p>
      </div>
    </aside>
  )
}
