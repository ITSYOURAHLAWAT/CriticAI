import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import axios from 'axios'
import {
  Settings as SettingsIcon, Server, Cpu, Sliders,
  CheckCircle2, XCircle, Key, Eye, EyeOff, ExternalLink,
  Zap, Wifi, WifiOff, RefreshCw, Bell, BellOff,
} from 'lucide-react'
import { API_BASE, PROVIDER_COLORS } from '../config'

// ─── localStorage helpers ──────────────────────────────────────────────────────
const LS = {
  get: (k) => localStorage.getItem(`criticai_${k}`) || '',
  set: (k, v) => localStorage.setItem(`criticai_${k}`, v),
}

// ─── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'groq',
    name: 'Groq',
    icon: '⚡',
    envKey: 'GROQ_API_KEY',
    lsKey: 'groq_api_key',
    placeholder: 'gsk_...',
    link: 'https://console.groq.com',
    linkLabel: 'Get free key → console.groq.com',
    description: 'Fastest free LLM API. Llama 3.1, Mixtral, Gemma. No credit card.',
    color: PROVIDER_COLORS.Groq,
    testModel: 'llama-3.1-70b-versatile',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: '✦',
    envKey: 'GEMINI_API_KEY',
    lsKey: 'gemini_api_key',
    placeholder: 'AIza...',
    link: 'https://aistudio.google.com/app/apikey',
    linkLabel: 'Get free key → aistudio.google.com',
    description: 'Google Gemini. Free 1500 requests/day. Flash models.',
    color: PROVIDER_COLORS.Gemini,
    testModel: 'gemini-1.5-flash',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    icon: '🖥',
    envKey: 'OLLAMA_BASE_URL',
    lsKey: 'ollama_base_url',
    placeholder: 'http://localhost:11434',
    link: 'https://ollama.com',
    linkLabel: 'Download local → ollama.com',
    description: 'Fully local — no internet needed. Run any model offline.',
    color: PROVIDER_COLORS.Ollama,
    testModel: 'mistral',
  },
]

// ─── AlertsCard component ──────────────────────────────────────────────────────
function AlertsCard() {
  const [slackUrl, setSlackUrl]       = useState(() => localStorage.getItem('criticai_slack_url') || '')
  const [discordUrl, setDiscordUrl]   = useState(() => localStorage.getItem('criticai_discord_url') || '')
  const [threshold, setThreshold]     = useState(() => parseInt(localStorage.getItem('criticai_alert_threshold') || '50'))
  const [testing, setTesting]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [testResult, setTestResult]   = useState(null) // null | {slack, discord}

  const handleSave = async () => {
    setSaving(true)
    try {
      localStorage.setItem('criticai_slack_url', slackUrl)
      localStorage.setItem('criticai_discord_url', discordUrl)
      localStorage.setItem('criticai_alert_threshold', threshold)
      await axios.post(`${API_BASE}/alerts/save`, {
        slack_url: slackUrl,
        discord_url: discordUrl,
        threshold,
      }, { timeout: 5000 })
      toast.success('Alert configuration saved!')
    } catch {
      toast.error('Failed to save to backend — saved to browser only')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!slackUrl && !discordUrl) {
      toast.error('Add at least one webhook URL before testing')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await axios.post(`${API_BASE}/alerts/test`, {
        slack_url: slackUrl,
        discord_url: discordUrl,
        threshold,
      }, { timeout: 15000 })
      setTestResult(data.results)
      if (data.ok) toast.success('Test alert sent! Check your Slack/Discord.')
      else toast.error('Test alert failed — check URLs and try again')
    } catch {
      toast.error('Could not reach backend to send test alert')
    } finally {
      setTesting(false)
    }
  }

  const hasUrls = slackUrl || discordUrl

  return (
    <div className="rounded-2xl p-6 glass space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Bell size={18} className="text-amber-400" />
          Slack &amp; Discord Alerts
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
          hasUrls ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/5 text-slate-500 border border-white/10'
        }`}>
          {hasUrls ? '🔔 Configured' : '🔕 Not configured'}
        </span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Receive automatic notifications when a model's health score drops below your threshold
        or red-team attacks succeed. 100% free — just paste your webhook URL.
      </p>

      {/* Webhook URLs */}
      <div className="space-y-3">
        {/* Slack */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase mb-2">
            <span>🔔</span> Slack Webhook URL
            <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer"
               className="ml-auto text-violet-400 hover:text-violet-300 normal-case font-normal flex items-center gap-1">
              Setup guide <ExternalLink size={10} />
            </a>
          </label>
          <input
            id="settings-slack-webhook"
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T.../B.../..."
            className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm
                       placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>

        {/* Discord */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase mb-2">
            <span>💬</span> Discord Webhook URL
            <a href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank" rel="noreferrer"
               className="ml-auto text-violet-400 hover:text-violet-300 normal-case font-normal flex items-center gap-1">
              Setup guide <ExternalLink size={10} />
            </a>
          </label>
          <input
            id="settings-discord-webhook"
            type="url"
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/.../..."
            className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm
                       placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Alert Threshold Slider */}
      <div>
        <label className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase mb-3">
          <span>⚠️ Alert when health score below</span>
          <span className={`px-2 py-0.5 rounded-md font-bold text-sm ${
            threshold <= 30 ? 'text-red-400' : threshold <= 60 ? 'text-amber-400' : 'text-green-400'
          }`}>{threshold}</span>
        </label>
        <input
          id="settings-alert-threshold"
          type="range"
          min="0"
          max="100"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${
              threshold <= 30 ? '#ef4444' : threshold <= 60 ? '#f59e0b' : '#22c55e'
            } ${threshold}%, rgba(255,255,255,0.1) ${threshold}%)`
          }}
        />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>0 (Always alert)</span>
          <span>50 (Recommended)</span>
          <span>100 (Never)</span>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(testResult).map(([channel, r]) => (
            <div key={channel} className={`p-3 rounded-xl text-xs flex items-center gap-2 font-semibold border ${
              r.ok
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>
              {r.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span className="capitalize">{channel}</span>: {r.ok ? 'Delivered!' : r.message}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <button
          id="settings-alerts-save"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <RefreshCw size={12} className="animate-spin" /> : <Bell size={12} />}
          {saving ? 'Saving...' : 'Save Config'}
        </button>
        <button
          id="settings-alerts-test"
          onClick={handleTest}
          disabled={testing || !hasUrls}
          className="flex-1 px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-semibold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {testing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
          {testing ? 'Sending...' : 'Test Alert'}
        </button>
      </div>
    </div>
  )
}

// ─── ApiKeyCard component ──────────────────────────────────────────────────────
function ApiKeyCard({ provider }) {
  const [value, setValue] = useState(() => LS.get(provider.lsKey) || (provider.id === 'ollama' ? 'http://localhost:11434' : ''))
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(null) // null | 'ok' | 'fail'
  const [statusMsg, setStatusMsg] = useState('')

  const handleSave = async () => {
    if (!value && provider.id !== 'ollama') {
      toast.error('Please enter an API key before saving')
      return
    }
    // Save to localStorage (browser cache)
    LS.set(provider.lsKey, value)
    // Also persist to backend .env so it survives server restarts
    try {
      const payload = provider.id === 'ollama'
        ? { provider: provider.id, api_key: '', base_url: value }
        : { provider: provider.id, api_key: value, base_url: '' }
      await axios.post(`${API_BASE}/provider/save-key`, payload, { timeout: 5000 })
      toast.success(`✅ ${provider.name} key saved to browser + .env file!`)
    } catch (err) {
      // localStorage still saved — just warn about .env
      toast.success(`${provider.name} key saved to browser (backend offline — .env not updated)`)
    }
  }

  const handleTest = async () => {
    if (!value && provider.id !== 'ollama') {
      toast.error(`Enter your ${provider.name} API key first`)
      return
    }
    setTesting(true)
    setStatus(null)
    try {
      // Send the key directly in the request body so the backend tests THIS key
      const payload = provider.id === 'ollama'
        ? { api_key: '', base_url: value || 'http://localhost:11434' }
        : { api_key: value, base_url: '' }
      const res = await axios.post(
        `${API_BASE}/provider/test?provider=${provider.id}`,
        payload,
        { timeout: 20000 }
      )
      if (res.data.ok) {
        setStatus('ok')
        setStatusMsg(res.data.message || 'Connected successfully')
        toast.success(`✅ ${provider.name} connected!`)
      } else {
        setStatus('fail')
        setStatusMsg(res.data.message || 'Connection failed — check your key')
        toast.error(`${provider.name}: ${res.data.message}`)
      }
    } catch (err) {
      const isOffline = err.message === 'Network Error' || !err.response
      setStatus('fail')
      if (isOffline) {
        setStatusMsg('Backend offline — start FastAPI server first')
        toast.error('Backend server is not running! Start it with: python -m uvicorn api.main:app --port 8000')
      } else {
        setStatusMsg(err.response?.data?.detail || err.message || 'Test failed')
        toast.error(`${provider.name} test failed: ${err.response?.data?.detail || err.message}`)
      }
    } finally {
      setTesting(false)
    }
  }

  const { color } = provider
  const isConfigured = Boolean(value && value !== 'http://localhost:11434')

  return (
    <div
      className="rounded-2xl p-5 space-y-4 transition-all"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${color.border}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: color.bg, border: `1px solid ${color.border}` }}
          >
            {provider.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">{provider.name}</span>
              {/* Status dot */}
              <span
                className={`w-2 h-2 rounded-full ${status === 'ok' ? 'bg-emerald-400' : status === 'fail' ? 'bg-red-400' : isConfigured ? 'bg-amber-400' : 'bg-slate-600'} animate-pulse`}
              />
            </div>
            <p className="text-[11px] text-slate-500">{provider.description}</p>
          </div>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: color.bg, border: `1px solid ${color.border}`, color: color.text }}
        >
          🆓 Free
        </span>
      </div>

      {/* Input */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Key size={10} /> {provider.envKey}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={provider.id === 'ollama' ? 'text' : (show ? 'text' : 'password')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={provider.placeholder}
              className="w-full px-4 py-2.5 pr-10 rounded-xl bg-black/40 border border-white/10 text-white text-sm font-mono placeholder-slate-700 focus:outline-none transition-all"
              style={{ focusBorderColor: color.border }}
              onFocus={(e) => (e.target.style.borderColor = color.border)}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
            {provider.id !== 'ollama' && (
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${color.border}, rgba(255,255,255,0.15))` }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Status feedback */}
      {status && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
            status === 'ok'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {status === 'ok' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {statusMsg}
        </div>
      )}

      {/* Footer row: helper link + test button */}
      <div className="flex items-center justify-between pt-1">
        <a
          href={provider.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
          style={{ color: color.text }}
        >
          <ExternalLink size={10} /> {provider.linkLabel}
        </a>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: color.border, color: color.text, background: color.bg }}
        >
          {testing ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />}
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const [apiUrl, setApiUrl] = useState(API_BASE)
  const [defaultModel, setDefaultModel] = useState('llama-3.1-70b-versatile')
  const [defaultTests, setDefaultTests] = useState(10)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [providerStatus, setProviderStatus] = useState(null)

  // Load provider status from backend on mount
  useEffect(() => {
    axios.get(`${API_BASE}/provider/status`).then((r) => setProviderStatus(r.data)).catch(() => {})
  }, [])

  const testConnection = async () => {
    setTesting(true)
    setConnectionStatus(null)
    try {
      await axios.get(`${apiUrl}/health`, { timeout: 3000 })
      setConnectionStatus('online')
      toast.success('Successfully connected to FastAPI backend!')
    } catch {
      setConnectionStatus('offline')
      toast.error('Could not connect to FastAPI server at specified URL.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold gradient-text">System Settings</h1>
        <p className="text-slate-400 text-sm">Configure API keys, backend endpoints, and evaluation preferences.</p>
      </div>

      {/* ── API Keys Card ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 glass space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Key size={18} className="text-violet-400" /> Free LLM API Keys
          </div>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
            🆓 All Free — No Credit Card
          </span>
        </div>

        {/* Provider status summary from backend */}
        {providerStatus && (
          <div className="flex gap-3 flex-wrap">
            {['groq', 'gemini', 'ollama'].map((p) => {
              const ps = providerStatus[p]
              const pc = PROVIDER_COLORS[p.charAt(0).toUpperCase() + p.slice(1)] || {}
              const isOk = ps?.configured
              return (
                <div key={p} className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-slate-300 capitalize">{p}</span>
                  <span className="text-slate-600">{isOk ? '(key set)' : '(not configured)'}</span>
                </div>
              )
            })}
            {providerStatus.simulation_mode && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                ⚠️ Simulation mode active
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          {PROVIDERS.map((prov) => (
            <ApiKeyCard key={prov.id} provider={prov} />
          ))}
        </div>

        <div className="rounded-xl p-4 bg-black/30 border border-white/5 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-400">💡 How it works</p>
          <p>Keys saved here are stored in your browser localStorage (prefixed <code className="text-violet-400">criticai_</code>).
            The backend reads keys from the <code className="text-violet-400">.env</code> file in the project root.
            To persist across server restarts, copy your keys into <code className="text-cyan-400">.env</code> file.</p>
          <p className="mt-1">Fallback order: <span className="text-violet-300">Groq</span> → <span className="text-cyan-300">Gemini</span> → <span className="text-emerald-300">Ollama</span> → <span className="text-slate-400">Simulation</span></p>
        </div>
      </div>

      {/* ── Backend Connection ───────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 glass space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Server size={18} className="text-violet-400" /> API Server Connection
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">FastAPI Base URL</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={testConnection}
              disabled={testing}
              className="px-5 py-2.5 rounded-xl bg-violet-600 font-semibold text-xs text-white hover:bg-violet-500 transition-all flex items-center gap-2"
            >
              {testing ? <RefreshCw size={12} className="animate-spin" /> : <Wifi size={12} />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </div>

        {connectionStatus && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            connectionStatus === 'online'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
              : 'bg-red-500/10 text-red-400 border border-red-500/30'
          }`}>
            {connectionStatus === 'online' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {connectionStatus === 'online'
              ? `Connected: FastAPI server online at ${apiUrl}`
              : 'Offline: Server failed health check'}
          </div>
        )}
      </div>

      {/* ── Alerts Configuration ──────────────────────────────────────────────── */}
      <AlertsCard />

      {/* ── Evaluation Preferences ───────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 glass space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sliders size={18} className="text-cyan-400" /> Evaluation Preferences
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Default Model</label>
            <input
              type="text"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Default Test Count</label>
            <input
              type="number"
              value={defaultTests}
              onChange={(e) => setDefaultTests(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
      </div>

      {/* ── Tech Stack ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 glass space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Cpu size={18} className="text-violet-400" /> Tech Stack Architecture
        </div>
        <div className="flex gap-2 flex-wrap pt-2">
          {['FastAPI', 'LangGraph', 'LiteLLM', 'Groq SDK', 'Gemini API', 'Ollama', 'React 18', 'Tailwind CSS', 'ChromaDB', 'Python 3.10'].map((tech) => (
            <span key={tech} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-slate-300">
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
