import React from 'react'
import { motion } from 'framer-motion'
import { useCountUp } from '../../hooks/useCountUp'
import { fadeUp } from '../../lib/animations'

export function MetricCard({ icon: Icon, label, value, sub, color = '#7C3AED', animate = true, suffix = '' }) {
  const isNumber = !isNaN(parseFloat(value)) && !String(value).includes('%') && !suffix
  const numericVal = isNumber ? parseFloat(value) : 0
  const displayValue = useCountUp(animate && isNumber ? numericVal : 0, 1000, animate && isNumber)

  const display = isNumber && animate
    ? Math.round(displayValue).toLocaleString() + suffix
    : String(value)

  return (
    <motion.div
      variants={fadeUp}
      className="relative overflow-hidden rounded-2xl p-5 group cursor-default"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        transition: 'border-color 0.2s',
      }}
      whileHover={{ borderColor: `${color}44`, boxShadow: `0 0 28px ${color}18` }}
    >
      {/* bg blob */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-[0.07] blur-2xl"
        style={{ background: color }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div
            className="p-2 rounded-xl"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}
          >
            <Icon size={16} style={{ color }} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {label}
          </span>
        </div>
        <p className="text-3xl font-black text-white font-mono-crisp leading-none">
          {display}
        </p>
        {sub && (
          <p className="text-[11px] text-slate-500 mt-2">{sub}</p>
        )}
      </div>
    </motion.div>
  )
}
