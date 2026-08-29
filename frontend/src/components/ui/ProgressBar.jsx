import React, { useEffect, useRef, useState } from 'react'

export function ProgressBar({ value = 0, max = 100, color = '#7C3AED', label, showPercent = true, height = 6 }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(pct))
    return () => cancelAnimationFrame(t)
  }, [pct])

  return (
    <div className="space-y-1.5">
      {(label || showPercent) && (
        <div className="flex justify-between items-center">
          {label && <span className="text-xs text-slate-400 font-medium">{label}</span>}
          {showPercent && (
            <span className="text-[11px] font-bold font-mono-crisp" style={{ color }}>
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        className="w-full overflow-hidden rounded-full"
        style={{ height, background: 'var(--bg-elevated)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      </div>
    </div>
  )
}
