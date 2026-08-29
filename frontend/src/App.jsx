import React, { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import CommandPalette from './components/CommandPalette'
import RightPanel from './components/RightPanel'
import Dashboard from './pages/Dashboard'
import RunEvaluation from './pages/RunEvaluation'
import Results from './pages/Results'
import Compare from './pages/Compare'
import Reports from './pages/Reports'
import RedTeam from './pages/RedTeam'
import Settings from './pages/Settings'
import History from './pages/History'
import Playground from './pages/Playground'
import ModelCard from './pages/ModelCard'
import ABTest from './pages/ABTest'
import Templates from './pages/Templates'
import TokenUsage from './pages/TokenUsage'
import Regression from './pages/Regression'
import BatchQueue from './pages/BatchQueue'
import { API_BASE, HISTORY_KEY } from './config'
import axios from 'axios'
import toast from 'react-hot-toast'

function AppShell() {
  const [apiOnline, setApiOnline] = useState(null)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [evalHistory, setEvalHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
  })
  const navigate = useNavigate()
  const seenWarnings = React.useRef(new Set())

  // Health poll every 30s (15s timeout for Render free tier cold starts)
  const checkHealth = useCallback(async () => {
    try {
      await axios.get(`${API_BASE}/health`, { timeout: 15000 })
      setApiOnline(true)
    } catch {
      setApiOnline(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const id = setInterval(checkHealth, 30000)
    return () => clearInterval(id)
  }, [checkHealth])

  // Poll usage warnings every 60s
  const checkWarnings = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/usage/warnings`)
      const warnings = res.data || []
      warnings.forEach((w) => {
        const key = `${w.provider}-${w.level}`
        if (!seenWarnings.current.has(key)) {
          seenWarnings.current.add(key)
          if (w.level === 'critical') {
            toast.error(
              (t) => (
                <div className="flex flex-col gap-1.5 text-xs">
                  <span className="font-bold">{w.message}</span>
                  <span className="text-slate-300">{w.suggestion}</span>
                  <button
                    onClick={() => { toast.dismiss(t.id); navigate('/usage') }}
                    className="mt-1 px-3 py-1 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500 transition-colors w-fit text-[11px]"
                  >
                    View Usage &rarr;
                  </button>
                </div>
              ),
              { duration: Infinity }
            )
          } else {
            toast(
              (t) => (
                <div className="flex flex-col gap-1.5 text-xs">
                  <span className="font-bold text-amber-300">&#9888;&#65039; {w.message}</span>
                  <span className="text-slate-300">{w.suggestion}</span>
                  <button
                    onClick={() => { toast.dismiss(t.id); navigate('/usage') }}
                    className="mt-1 px-3 py-1 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-500 transition-colors w-fit text-[11px]"
                  >
                    View Usage &rarr;
                  </button>
                </div>
              ),
              { duration: 8000 }
            )
          }
        }
      })
    } catch {}
  }, [navigate])

  useEffect(() => {
    checkWarnings()
    const wId = setInterval(checkWarnings, 60000)
    return () => clearInterval(wId)
  }, [checkWarnings])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        navigate('/run')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  const addEval = (entry) => {
    const updated = [entry, ...evalHistory].slice(0, 50)
    setEvalHistory(updated)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Sidebar apiOnline={apiOnline} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar onSearchOpen={() => setCmdOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard evalHistory={evalHistory} />} />
            <Route path="/run" element={<RunEvaluation addEval={addEval} />} />
            <Route path="/batch" element={<BatchQueue />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/results" element={<Results evalHistory={evalHistory} />} />
            <Route path="/compare" element={<Compare evalHistory={evalHistory} />} />
            <Route path="/reports" element={<Reports evalHistory={evalHistory} />} />
            <Route path="/model-card" element={<ModelCard />} />
            <Route path="/ab-test" element={<ABTest />} />
            <Route path="/redteam" element={<RedTeam evalHistory={evalHistory} />} />
            <Route path="/history" element={<History />} />
            <Route path="/regression" element={<Regression />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/usage" element={<TokenUsage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      {rightPanelOpen && <RightPanel evalHistory={evalHistory} onClose={() => setRightPanelOpen(false)} />}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#12121E',
            color: '#F1F1F7',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            borderRadius: 12,
          },
        }}
      />
      <AppShell />
    </BrowserRouter>
  )
}
