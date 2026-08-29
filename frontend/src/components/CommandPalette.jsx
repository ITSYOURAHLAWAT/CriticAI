import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, LayoutDashboard, Zap, ListOrdered, LayoutTemplate,
  FlaskConical, BarChart2, GitCompare, Swords, FileText, CreditCard,
  Shield, History, TrendingUp, Gauge, Settings, ArrowRight,
} from 'lucide-react'

const ROUTES = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',       group: 'Navigation' },
  { to: '/run',       icon: Zap,             label: 'Run Evaluation',  group: 'Navigation' },
  { to: '/batch',     icon: ListOrdered,     label: 'Batch Queue',     group: 'Navigation' },
  { to: '/templates', icon: LayoutTemplate,  label: 'Templates',       group: 'Navigation' },
  { to: '/results',   icon: BarChart2,       label: 'Results',         group: 'Navigation' },
  { to: '/compare',   icon: GitCompare,      label: 'Compare',         group: 'Navigation' },
  { to: '/ab-test',   icon: Swords,          label: 'A/B Testing',     group: 'Navigation' },
  { to: '/reports',   icon: FileText,        label: 'Reports',         group: 'Navigation' },
  { to: '/playground',icon: FlaskConical,    label: 'Playground',      group: 'Navigation' },
  { to: '/redteam',   icon: Shield,          label: 'Red-Team',        group: 'Navigation' },
  { to: '/history',   icon: History,         label: 'History',         group: 'Navigation' },
  { to: '/regression',icon: TrendingUp,      label: 'Regression',      group: 'Navigation' },
  { to: '/model-card',icon: CreditCard,      label: 'Model Card',      group: 'Navigation' },
  { to: '/usage',     icon: Gauge,           label: 'Usage & Costs',   group: 'Navigation' },
  { to: '/settings',  icon: Settings,        label: 'Settings',        group: 'Navigation' },
]

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const filtered = query.trim()
    ? ROUTES.filter(r => r.label.toLowerCase().includes(query.toLowerCase()))
    : ROUTES

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [isOpen])

  const go = useCallback((to) => {
    navigate(to)
    onClose()
  }, [navigate, onClose])

  useEffect(() => {
    const handler = (e) => {
      if (!isOpen) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && filtered[selected]) go(filtered[selected].to)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, filtered, selected, go, onClose])

  useEffect(() => { setSelected(0) }, [query])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <Search size={16} className="text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search pages, actions..."
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
              <button onClick={onClose} className="p-1 rounded text-slate-600 hover:text-slate-400 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Results */}
            <div className="overflow-y-auto max-h-80 py-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-600">No results for "{query}"</p>
              ) : (
                filtered.map((item, i) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.to}
                      onClick={() => go(item.to)}
                      onMouseEnter={() => setSelected(i)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group"
                      style={{
                        background: selected === i ? 'rgba(124,58,237,0.12)' : 'transparent',
                        borderLeft: selected === i ? '2px solid #7C3AED' : '2px solid transparent',
                      }}
                    >
                      <div className="p-1.5 rounded-lg"
                        style={{ background: selected === i ? 'rgba(124,58,237,0.2)' : 'var(--bg-overlay)' }}>
                        <Icon size={13} className={selected === i ? 'text-violet-400' : 'text-slate-500'} />
                      </div>
                      <span className={`text-sm font-medium ${selected === i ? 'text-slate-100' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                      {selected === i && (
                        <ArrowRight size={12} className="ml-auto text-slate-600" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2.5 text-[10px] text-slate-700" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span><kbd className="px-1 py-0.5 rounded bg-white/5 font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/5 font-mono">↵</kbd> open</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/5 font-mono">esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
