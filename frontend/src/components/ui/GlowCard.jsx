import React from 'react'
import { motion } from 'framer-motion'
import { scaleIn } from '../../lib/animations'

export function GlowCard({ children, className = '', color = '#7C3AED', onClick, hoverable = true }) {
  return (
    <motion.div
      variants={scaleIn}
      onClick={onClick}
      className={`relative rounded-2xl overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
      whileHover={hoverable ? {
        borderColor: `${color}40`,
        boxShadow: `0 0 32px ${color}18, 0 4px 24px rgba(0,0,0,0.4)`,
        y: -1,
      } : {}}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(circle at top right, ${color}08, transparent 70%)` }}
      />
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  )
}
