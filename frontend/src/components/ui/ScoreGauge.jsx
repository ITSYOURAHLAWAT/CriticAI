import React, { useEffect, useState } from 'react'

export function ScoreGauge({ score = 0, size = 120, strokeWidth = 10 }) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = (size - strokeWidth) / 2
  const circumference = radius * Math.PI // half circle
  const pct = Math.min(Math.max(animatedScore, 0), 100)
  const offset = circumference - (pct / 100) * circumference

  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'
  const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F'

  useEffect(() => {
    let start = null
    const target = score
    const duration = 1000
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setAnimatedScore(ease * target)
      if (p < 1) requestAnimationFrame(step)
      else setAnimatedScore(target)
    }
    requestAnimationFrame(step)
  }, [score])

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
        {/* Track */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.05s linear, stroke 0.5s', filter: `drop-shadow(0 0 6px ${color})` }}
        />
        {/* Score text */}
        <text
          x={size / 2}
          y={size / 2 + 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={size * 0.2}
          fontWeight="900"
          fontFamily="'JetBrains Mono', monospace"
        >
          {Math.round(animatedScore)}
        </text>
      </svg>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Grade</span>
        <span className="text-sm font-black px-2 py-0.5 rounded-md"
          style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}>
          {grade}
        </span>
      </div>
    </div>
  )
}
