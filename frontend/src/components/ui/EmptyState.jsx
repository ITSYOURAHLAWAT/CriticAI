import React from 'react'
import { motion } from 'framer-motion'
import { scaleIn } from '../../lib/animations'

export function EmptyState({ icon: Icon, title, description, action, actionLabel }) {
  return (
    <motion.div
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <div
        className="p-5 rounded-2xl"
        style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}
      >
        <Icon size={36} className="text-violet-700" />
      </div>
      <div>
        <p className="text-slate-300 font-semibold text-sm">{title}</p>
        {description && (
          <p className="text-slate-600 text-xs mt-1 max-w-xs">{description}</p>
        )}
      </div>
      {action && actionLabel && (
        <button
          onClick={action}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  )
}
