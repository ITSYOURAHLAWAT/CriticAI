import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Command, Cpu, Zap, ChevronRight } from 'lucide-react'

const BREADCRUMB_MAP = {
  '/':          ['Dashboard'],
  '/run':       ['Evaluate', 'Run Evaluation'],
  '/batch':     ['Evaluate', 'Batch Queue'],
  '/templates': ['Evaluate', 'Templates'],
  '/results':   ['Analyze', 'Results'],
  '/compare':   ['Analyze', 'Compare'],
  '/ab-test':   ['Analyze', 'A/B Testing'],
  '/regression':['Analyze', 'Regression'],
  '/reports':   ['Explore', 'Reports'],
  '/playground':['Explore', 'Playground'],
  '/redteam':   ['Explore', 'Red-Team'],
  '/history':   ['Manage', 'History'],
  '/model-card':['Manage', 'Model Card'],
  '/usage':     ['Manage', 'Usage & Costs'],
  '/settings':  ['Manage', 'Settings'],
}

export default function TopBar({ onSearchOpen }) {
  return (
    <header
      className="flex items-center justify-between px-5 shrink-0"
      style={{
        height: 48,
        background: 'rgba(12,12,20,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Breadcrumb */}
      <BreadCrumb />

      {/* Search trigger */}
      <button
        onClick={onSearchOpen}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <Search size={13} className="text-slate-500" />
        <span className="text-xs text-slate-500">Search or jump to...</span>
        <span className="ml-2 flex items-center gap-0.5 text-[10px] text-slate-600 font-mono">
          <Command size={10} />K
        </span>
      </button>

      {/* Right side pills */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold"
          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}>
          <Zap size={10} /> Groq
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold"
          style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', color: '#22d3ee' }}>
          <Cpu size={10} /> Gemini
        </span>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ml-1"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
          A
        </div>
      </div>
    </header>
  )
}

function BreadCrumb() {
  const location = useLocation()
  const parts = BREADCRUMB_MAP[location.pathname] || ['Page']
  return (
    <nav className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-600 font-medium">CriticAI</span>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          <ChevronRight size={12} className="text-slate-700" />
          <span className={i === parts.length - 1 ? 'text-slate-300 font-semibold' : 'text-slate-600'}>
            {p}
          </span>
        </React.Fragment>
      ))}
    </nav>
  )
}
