import React from 'react'

export function Skeleton({ className = '', style = {} }) {
  return (
    <div
      className={`rounded-lg shimmer ${className}`}
      style={{ height: 16, ...style }}
    />
  )
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <Skeleton style={{ height: 12, width: '40%' }} />
      <Skeleton style={{ height: 32, width: '60%' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} style={{ height: 10, width: `${70 + Math.random() * 20}%` }} />
      ))}
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex gap-3 items-center px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <Skeleton style={{ height: 12, flex: 1 }} />
      <Skeleton style={{ height: 12, width: 64 }} />
      <Skeleton style={{ height: 12, width: 56 }} />
      <Skeleton style={{ height: 20, width: 72, borderRadius: 6 }} />
    </div>
  )
}
