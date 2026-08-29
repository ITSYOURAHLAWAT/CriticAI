import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Zap, BarChart2, GitCompare, FileText, Shield,
  Settings, Brain, History, FlaskConical, CreditCard, Swords,
  LayoutTemplate, Gauge, TrendingUp, ListOrdered,
} from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

const NAV_GROUPS = [
  {
    label: 'EVALUATE',
    items: [
      { to: '/run',       icon: Zap,           label: 'Run Evaluation' },
      { to: '/batch',     icon: ListOrdered,   label: 'Batch Queue',   badge: 'New' },
      { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
      { to: '/playground',icon: FlaskConical,  label: 'Playground' },
    ],
  },
  {
    label: 'ANALYZE',
    items: [
      { to: '/results',   icon: BarChart2,  label: 'Results' },
      { to: '/compare',   icon: GitCompare, label: 'Compare' },
      { to: '/ab-test',   icon: Swords,     label: 'A/B Testing', badge: 'New' },
      { to: '/regression',icon: TrendingUp, label: 'Regression', alertKey: 'regression' },
    ],
  },
  {
    label: 'EXPLORE',
    items: [
      { to: '/reports',    icon: FileText,  label: 'Reports' },
      { to: '/redteam',    icon: Shield,    label: 'Red-Team', red: true },
      { to: '/model-card', icon: CreditCard,label: 'Model Card' },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { to: '/',        icon: LayoutDashboard, label: 'Dashboard', end: true },
      { to: '/history', icon: History,         label: 'History' },
      { to: '/usage',   icon: Gauge,           label: 'Usage & Costs', alertKey: 'usage' },
      { to: '/settings',icon: Settings,        label: 'Settings' },
    ],
  },
]

export default function Sidebar({ apiOnline }) {
  const [alerts, setAlerts] = useState({ usage: false, regression: false })

  useEffect(() => {
    const check = async () => {
      try {
        const [warnRes, alertRes] = await Promise.all([
          axios.get(`${API_BASE}/usage/warnings`),
          axios.get(`${API_BASE}/regression/alerts`),
        ])
        setAlerts({
          usage: (warnRes.data || []).length > 0,
          regression: (alertRes.data || []).length > 0,
        })
      } catch {
        setAlerts({ usage: false, regression: false })
      }
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside
      className="flex flex-col h-screen shrink-0 z-40"
      style={{
        width: 220,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 py-3.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
            boxShadow: '0 0 14px rgba(124,58,237,0.45)',
          }}
        >
          <Brain size={17} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-sm gradient-text leading-tight">CriticAI</div>
          <div className="text-[10px] text-slate-600">LLM Evaluator</div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="px-2 mb-1 text-[9px] font-bold tracking-widest text-slate-700 uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, red, badge, alertKey, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 group
                    ${isActive
                      ? red ? 'text-red-400' : 'text-violet-300'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active indicator */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full"
                          style={{
                            background: red ? '#EF4444' : '#7C3AED',
                            boxShadow: red ? '0 0 6px #ef4444' : '0 0 6px #7C3AED',
                          }}
                        />
                      )}
                      {/* Active bg */}
                      {isActive && (
                        <span
                          className="absolute inset-0 rounded-lg"
                          style={{ background: red ? 'rgba(239,68,68,0.08)' : 'rgba(124,58,237,0.1)' }}
                        />
                      )}
                      <Icon
                        size={14}
                        className={`relative z-10 shrink-0 ${
                          isActive
                            ? red ? 'text-red-400' : 'text-violet-400'
                            : 'text-slate-600 group-hover:text-slate-400'
                        }`}
                      />
                      <span className="relative z-10 flex-1 truncate">{label}</span>
                      {/* Alert dot */}
                      {alertKey && alerts[alertKey] && (
                        <span
                          className="relative z-10 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0"
                          style={{ boxShadow: '0 0 6px #ef4444' }}
                        />
                      )}
                      {/* Badge */}
                      {badge && !alerts[alertKey] && (
                        <span
                          className="relative z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' }}
                        >
                          {badge}
                        </span>
                      )}
                      {/* Red-Team special badge */}
                      {red && (
                        <span
                          className="relative z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                        >
                          Hot
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* API status footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: apiOnline === null ? '#64748b' : apiOnline ? '#22c55e' : '#ef4444',
              boxShadow: apiOnline ? '0 0 6px #22c55e' : 'none',
              animation: apiOnline ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-slate-400 truncate">
              {apiOnline === null ? 'Checking...' : apiOnline ? 'API Online' : 'API Offline'}
            </div>
            <div className="text-[9px] text-slate-500 font-mono-crisp truncate">
              {API_BASE.includes('onrender.com') ? 'render cloud' : API_BASE.replace(/^https?:\/\//, '')}
            </div>
          </div>
        </div>
        <div className="text-center mt-2 text-[9px] text-slate-600">v1.0.0</div>
      </div>
    </aside>
  )
}
