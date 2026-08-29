// Central API configuration
// In development: uses localhost:8000
// In production (Vercel): reads VITE_API_URL environment variable set to your Render backend URL
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Evaluation history stored in localStorage
export const HISTORY_KEY = 'criticai_eval_history'

// ─── Free LLM Models ──────────────────────────────────────────────────────────
// All models listed here are 100% free — no credit card required.
export const QUICK_MODELS = [
  // Groq (console.groq.com — free, no card)
  { label: 'Llama 3.3 70B', value: 'llama-3.3-70b-versatile', provider: 'Groq', free: true, color: '#7C3AED' },
  { label: 'Llama 3 70B', value: 'llama3-70b-8192', provider: 'Groq', free: true, color: '#7C3AED' },
  { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768', provider: 'Groq', free: true, color: '#7C3AED' },
  { label: 'Gemma 2 9B', value: 'gemma2-9b-it', provider: 'Groq', free: true, color: '#7C3AED' },
  // Gemini (aistudio.google.com — free, AQ.* key format)
  { label: 'Gemini 3.6 Flash', value: 'gemini-3.6-flash', provider: 'Gemini', free: true, color: '#06B6D4' },
  { label: 'Gemini Flash Latest', value: 'gemini-flash-latest', provider: 'Gemini', free: true, color: '#06B6D4' },
  { label: 'Gemini 3.5 Flash Lite', value: 'gemini-3.5-flash-lite', provider: 'Gemini', free: true, color: '#06B6D4' },
  // Ollama (local — no internet)
  { label: 'Mistral (Local)', value: 'mistral', provider: 'Ollama', free: true, color: '#10B981' },
]

export const PROMPT_CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Factual', value: 'factual' },
  { label: 'Reasoning', value: 'reasoning' },
  { label: 'Coding', value: 'code' },
  { label: 'Safety', value: 'safety' },
  { label: 'Creative', value: 'creative' },
]

// Provider badge colours
export const PROVIDER_COLORS = {
  Groq: { bg: 'rgba(124,58,237,0.18)', border: 'rgba(124,58,237,0.45)', text: '#a78bfa' },
  Gemini: { bg: 'rgba(6,182,212,0.18)', border: 'rgba(6,182,212,0.45)', text: '#67e8f9' },
  Ollama: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.45)', text: '#6ee7b7' },
}
