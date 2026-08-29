import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { API_BASE } from '../config'
import {
  LayoutTemplate, Search, Eye, ArrowRight, Plus, Trash2, X,
  Check, AlertCircle, Clock, Shield, Sparkles, Layers, FileText, CheckCircle2
} from 'lucide-react'

const CATEGORIES = ['All', 'Business', 'Technical', 'Safety-Critical', 'Education', 'Security', 'Creative', 'Analytical', 'Legal', 'Custom']

const DIFFICULTY_BADGES = {
  beginner: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Beginner', dots: '●○○', color: '#10B981' },
  intermediate: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Intermediate', dots: '●●○', color: '#F59E0B' },
  advanced: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Advanced', dots: '●●●', color: '#EF4444' },
}

export default function Templates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  // Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState(null)
  const [previewTab, setPreviewTab] = useState('overview') // 'overview' | 'prompts' | 'config'

  // Custom Creator Slide-over/Modal
  const [showCreator, setShowCreator] = useState(false)
  const [savingCustom, setSavingCustom] = useState(false)
  const [customForm, setCustomForm] = useState({
    icon: '📋',
    name: '',
    description: '',
    category: 'technical',
    difficulty: 'beginner',
    estimated_time: '~3 minutes',
    use_case: '',
    prompt_category: 'coding',
    num_tests: 15,
    include_redteam: false,
    pass_threshold: 80,
    prompts: ['', '', ''],
  })

  const fetchTemplates = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get(`${API_BASE}/templates`)
      setTemplates(res.data || [])
    } catch (e) {
      setError('Could not connect to backend to fetch templates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  // Filter logic
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesCategory =
        activeCategory === 'All'
          ? true
          : activeCategory === 'Custom'
          ? !t.is_builtin
          : t.category?.toLowerCase() === activeCategory.toLowerCase().replace('-critical', '-critical')

      const matchesSearch =
        !search.trim() ||
        t.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.description?.toLowerCase().includes(search.toLowerCase()) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))

      return matchesCategory && matchesSearch
    })
  }, [templates, activeCategory, search])

  const stats = useMemo(() => {
    const builtinCount = templates.filter((t) => t.is_builtin).length
    const customCount = templates.filter((t) => !t.is_builtin).length
    const totalUsed = templates.reduce((acc, t) => acc + (t.used_count || 0), 0)
    return { builtinCount, customCount, totalUsed }
  }, [templates])

  const handleUseTemplate = async (template) => {
    try {
      await axios.post(`${API_BASE}/templates/${template.id}/use`)
    } catch (e) {
      // Ignore count error
    }
    // Navigate to /run with template data passed in state
    navigate('/run', { state: { selectedTemplate: template } })
  }

  const handleDeleteCustom = async (e, templateId) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this custom template?')) return
    try {
      await axios.delete(`${API_BASE}/templates/custom/${templateId}`)
      toast.success('Custom template deleted')
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      if (previewTemplate?.id === templateId) setPreviewTemplate(null)
    } catch (err) {
      toast.error('Failed to delete template')
    }
  }

  const handleAddPromptRow = () => {
    if (customForm.prompts.length >= 50) {
      toast.error('Maximum 50 prompts allowed per template')
      return
    }
    setCustomForm((prev) => ({ ...prev, prompts: [...prev.prompts, ''] }))
  }

  const handleRemovePromptRow = (index) => {
    if (customForm.prompts.length <= 3) {
      toast.error('Minimum 3 prompts required')
      return
    }
    setCustomForm((prev) => ({
      ...prev,
      prompts: prev.prompts.filter((_, i) => i !== index),
    }))
  }

  const handlePromptChange = (index, value) => {
    const updated = [...customForm.prompts]
    updated[index] = value
    setCustomForm((prev) => ({ ...prev, prompts: updated }))
  }

  const handleSaveCustom = async (e) => {
    e.preventDefault()
    const validPrompts = customForm.prompts.map((p) => p.trim()).filter((p) => p.length > 0)
    if (validPrompts.length < 3) {
      toast.error('Please provide at least 3 non-empty test prompts')
      return
    }
    if (!customForm.name.trim()) {
      toast.error('Template name is required')
      return
    }

    setSavingCustom(true)
    const payload = {
      name: customForm.name,
      icon: customForm.icon || '📋',
      description: customForm.description,
      category: customForm.category,
      tags: ['custom', customForm.category, customForm.difficulty],
      config: {
        prompt_category: customForm.prompt_category,
        num_tests: Number(customForm.num_tests),
        include_redteam: Boolean(customForm.include_redteam),
        recommended_models: ['llama-3.1-70b-versatile', 'gemini-1.5-flash'],
        focus_areas: ['custom-eval', customForm.category],
      },
      prompts: validPrompts,
      scoring_criteria: {
        pass_threshold: Number(customForm.pass_threshold),
        key_metrics: ['accuracy', 'relevance', 'quality'],
      },
      use_case: customForm.use_case || 'Custom evaluation scenario',
      difficulty: customForm.difficulty,
      estimated_time: customForm.estimated_time || '~3 minutes',
    }

    try {
      const res = await axios.post(`${API_BASE}/templates/custom`, payload)
      toast.success('Custom template created!')
      setTemplates((prev) => [res.data, ...prev])
      setShowCreator(false)
      // reset
      setCustomForm({
        icon: '📋',
        name: '',
        description: '',
        category: 'technical',
        difficulty: 'beginner',
        estimated_time: '~3 minutes',
        use_case: '',
        prompt_category: 'coding',
        num_tests: 15,
        include_redteam: false,
        pass_threshold: 80,
        prompts: ['', '', ''],
      })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create template')
    } finally {
      setSavingCustom(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <LayoutTemplate size={24} className="text-violet-400" /> Evaluation Templates
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Pre-built configs for common AI use cases. One click to load.
          </p>
        </div>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-500/50 bg-violet-600/10 text-violet-300 hover:bg-violet-600 hover:text-white font-bold text-xs transition-all shadow-lg shadow-violet-600/20"
        >
          <Plus size={15} /> Create Custom Template
        </button>
      </div>

      {/* Search & Category Pills */}
      <div className="rounded-2xl glass p-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by name, description, or tag..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-all"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  isActive
                    ? 'bg-violet-600/30 border-violet-500 text-violet-200 shadow-md shadow-violet-600/20'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/15'
                }`}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats Counter */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div>
          <span className="font-semibold text-slate-200">{stats.builtinCount}</span> built-in templates •{' '}
          <span className="font-semibold text-cyan-400">{stats.customCount}</span> custom templates •{' '}
          <span className="font-semibold text-violet-400">{stats.totalUsed}</span> total uses
        </div>
        <div>
          Showing <span className="text-white font-bold">{filteredTemplates.length}</span> template{filteredTemplates.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl glass p-5 space-y-4 animate-pulse">
              <div className="h-6 bg-white/10 rounded w-3/4" />
              <div className="h-10 bg-white/5 rounded w-full" />
              <div className="h-20 bg-white/5 rounded w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl p-6 bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-300">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl glass p-12 text-center space-y-3">
          <LayoutTemplate size={40} className="mx-auto text-slate-600" />
          <p className="text-slate-300 font-semibold">No templates found</p>
          <p className="text-slate-500 text-xs">Try clearing search filters or create your own custom template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => {
            const diff = DIFFICULTY_BADGES[template.difficulty || 'beginner'] || DIFFICULTY_BADGES.beginner
            const isCustom = !template.is_builtin

            return (
              <div
                key={template.id}
                className="rounded-2xl glass p-5 flex flex-col justify-between hover:scale-[1.01] hover:border-violet-500/40 transition-all group relative border border-white/10"
              >
                {/* Header info */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl p-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                        {template.icon || '📋'}
                      </span>
                      <div>
                        <h3 className="font-bold text-white text-base group-hover:text-violet-300 transition-colors leading-tight">
                          {template.name}
                        </h3>
                        <p className="text-[10px] text-slate-400 capitalize mt-0.5">Category: {template.category}</p>
                      </div>
                    </div>

                    {isCustom ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shrink-0">
                          Custom
                        </span>
                        <button
                          onClick={(e) => handleDeleteCustom(e, template.id)}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete Custom Template"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${diff.bg} ${diff.text} ${diff.border} shrink-0`}
                      >
                        {diff.label}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed h-9">
                    {template.description}
                  </p>

                  {/* Stats Box */}
                  <div className="bg-black/30 rounded-xl p-3 grid grid-cols-2 gap-2 text-[11px] border border-white/5">
                    <div>
                      <span className="text-slate-500">Prompts:</span>{' '}
                      <span className="font-bold text-slate-200">{template.prompts?.length || 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Tests:</span>{' '}
                      <span className="font-bold text-slate-200">{template.config?.num_tests || 10}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Red-Team:</span>{' '}
                      <span className={`font-bold ${template.config?.include_redteam ? 'text-red-400' : 'text-slate-400'}`}>
                        {template.config?.include_redteam ? 'Yes 🔴' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Time:</span>{' '}
                      <span className="font-bold text-slate-200">{template.estimated_time || '~3 min'}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex gap-1 flex-wrap">
                    {template.tags?.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/5"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Difficulty dots */}
                  {!isCustom && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="font-mono" style={{ color: diff.color }}>{diff.dots}</span>
                      <span>{diff.label} difficulty</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 mt-4 border-t border-white/5 flex gap-2">
                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="flex-1 py-2 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-md"
                    style={{
                      background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
                    }}
                  >
                    Use Template <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={() => {
                      setPreviewTemplate(template)
                      setPreviewTab('overview')
                    }}
                    className="py-2 px-3 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-white/5 border border-white/10 hover:border-violet-500/40 transition-all flex items-center gap-1"
                  >
                    <Eye size={13} /> Preview
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── TEMPLATE PREVIEW MODAL ─── */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[#0F0C1E] border border-violet-500/30 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 rounded-xl bg-white/5 border border-white/10">
                  {previewTemplate.icon || '📋'}
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {previewTemplate.name}
                    {!previewTemplate.is_builtin && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        Custom
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">{previewTemplate.use_case || previewTemplate.category}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 border border-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-white/10 px-5 bg-black/20">
              {['overview', 'prompts', 'config'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPreviewTab(tab)}
                  className={`px-4 py-3 text-xs font-bold capitalize border-b-2 transition-all ${
                    previewTab === tab
                      ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'prompts' ? `Prompts (${previewTemplate.prompts?.length || 0})` : tab}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {previewTab === 'overview' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-slate-300 mb-1">Description</h4>
                    <p className="text-slate-400 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                      {previewTemplate.description}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-300 mb-1">Target Use Cases</h4>
                    <p className="text-slate-400 bg-white/5 p-3 rounded-xl border border-white/5">
                      {previewTemplate.use_case || 'General AI benchmark'}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-300 mb-2">Recommended LLM Models</h4>
                    <div className="flex gap-2 flex-wrap">
                      {previewTemplate.config?.recommended_models?.map((m) => (
                        <span
                          key={m}
                          className="px-3 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 font-mono font-semibold"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-300 mb-2">Scoring Criteria & Target</h4>
                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400">Pass Threshold:</span>{' '}
                        <span className="font-bold text-emerald-400">
                          {previewTemplate.scoring_criteria?.pass_threshold || 75}%
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {previewTemplate.scoring_criteria?.key_metrics?.map((metric) => (
                          <span key={metric} className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px]">
                            {metric}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {previewTab === 'prompts' && (
                <div className="space-y-2">
                  <p className="text-slate-400 mb-2 font-semibold">
                    {previewTemplate.prompts?.length || 0} benchmark prompts included in this template:
                  </p>
                  {previewTemplate.prompts?.map((prompt, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-black/40 border border-white/5 flex gap-3 items-start"
                    >
                      <span className="text-slate-500 font-mono font-bold shrink-0">{idx + 1}.</span>
                      <p className="text-slate-200 font-mono leading-relaxed">{prompt}</p>
                    </div>
                  ))}
                </div>
              )}

              {previewTab === 'config' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 block mb-1">Prompt Category</span>
                    <span className="font-bold text-violet-300 uppercase">{previewTemplate.config?.prompt_category}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 block mb-1">Total Test Cases</span>
                    <span className="font-bold text-white">{previewTemplate.config?.num_tests}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 block mb-1">Red-Team Adversarial Test</span>
                    <span className={`font-bold ${previewTemplate.config?.include_redteam ? 'text-red-400' : 'text-slate-400'}`}>
                      {previewTemplate.config?.include_redteam ? 'Enabled 🔴' : 'Disabled'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 block mb-1">Estimated Runtime</span>
                    <span className="font-bold text-white">{previewTemplate.estimated_time}</span>
                  </div>
                  <div className="col-span-2 p-3 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 block mb-1.5">Evaluation Focus Areas</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {previewTemplate.config?.focus_areas?.map((fa) => (
                        <span key={fa} className="px-2.5 py-1 rounded-md bg-violet-600/20 text-violet-300 font-semibold">
                          {fa}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Action Bar */}
            <div className="p-4 border-t border-white/10 bg-black/40 flex gap-3">
              <button
                onClick={() => handleUseTemplate(previewTemplate)}
                className="w-full py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
              >
                Use This Template →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CUSTOM TEMPLATE CREATOR SLIDE-OVER / MODAL ─── */}
      {showCreator && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0D0B18] border-l border-violet-500/30 w-full max-w-xl h-full flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-violet-400" /> Create Custom Evaluation Template
                </h2>
                <p className="text-xs text-slate-400">Build a reusable template with custom prompts & settings.</p>
              </div>
              <button
                onClick={() => setShowCreator(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Scrollable Body */}
            <form id="custom-template-form" onSubmit={handleSaveCustom} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="block font-semibold text-slate-300 mb-1">Icon</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={customForm.icon}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, icon: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-center text-lg text-white"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block font-semibold text-slate-300 mb-1">Template Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Customer Support Escalation"
                    value={customForm.name}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-slate-600 focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe what this evaluation template tests..."
                  value={customForm.description}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-slate-600 focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={customForm.category}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-slate-200"
                  >
                    <option value="technical">Technical</option>
                    <option value="business">Business</option>
                    <option value="education">Education</option>
                    <option value="security">Security</option>
                    <option value="creative">Creative</option>
                    <option value="analytical">Analytical</option>
                    <option value="legal">Legal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Difficulty</label>
                  <select
                    value={customForm.difficulty}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, difficulty: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-slate-200"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Prompt Category</label>
                  <select
                    value={customForm.prompt_category}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, prompt_category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-slate-200"
                  >
                    <option value="coding">Coding</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="instruction-following">Instruction Following</option>
                    <option value="safety">Safety</option>
                    <option value="creativity">Creativity</option>
                    <option value="factuality">Factuality</option>
                    <option value="all">All Categories</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Number of Tests</label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    value={customForm.num_tests}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, num_tests: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customForm.include_redteam}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, include_redteam: e.target.checked }))}
                    className="rounded border-white/10 bg-black/50 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-slate-300 font-semibold">Include Red-Team 🔴</span>
                </label>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Pass Threshold:</span>
                    <span className="font-bold text-violet-300">{customForm.pass_threshold}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={customForm.pass_threshold}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, pass_threshold: e.target.value }))}
                    className="w-full accent-violet-500"
                  />
                </div>
              </div>

              {/* Prompts Builder */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-slate-200">
                    Test Prompts ({customForm.prompts.length}) <span className="text-slate-500 font-normal">(Min 3, Max 50)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddPromptRow}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600 hover:text-white transition-all font-semibold"
                  >
                    + Add Prompt
                  </button>
                </div>

                {customForm.prompts.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="py-2 text-slate-500 font-mono text-[11px] w-5">{idx + 1}.</span>
                    <textarea
                      rows={2}
                      placeholder={`Enter test prompt #${idx + 1}...`}
                      value={p}
                      onChange={(e) => handlePromptChange(idx, e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-slate-600 focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePromptRow(idx)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors mt-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </form>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-black/40 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCreator(false)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="custom-template-form"
                disabled={savingCustom}
                className="flex-1 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
              >
                {savingCustom ? 'Saving...' : 'Save Custom Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
