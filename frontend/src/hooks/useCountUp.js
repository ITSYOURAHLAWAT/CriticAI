import { useState, useEffect, useRef } from 'react'

export function useCountUp(target, duration = 1200, startOnMount = true) {
  const [value, setValue] = useState(0)
  const frameRef = useRef(null)
  const startRef = useRef(null)
  const startValueRef = useRef(0)

  useEffect(() => {
    if (!startOnMount) return
    const numTarget = parseFloat(target) || 0
    startValueRef.current = 0
    startRef.current = null

    const step = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(startValueRef.current + (numTarget - startValueRef.current) * eased)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        setValue(numTarget)
      }
    }

    frameRef.current = requestAnimationFrame(step)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, duration, startOnMount])

  return value
}
