import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

// Anima un número desde su valor anterior al nuevo (KPIs).
export function useCountUp(value, duration = 0.9) {
  const [display, setDisplay] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const target = Number(value) || 0
    const controls = animate(from.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    from.current = target
    return () => controls.stop()
  }, [value, duration])
  return display
}
