import { motion } from 'framer-motion'
import { useCountUp } from '@/hooks/useCountUp'
import { cx } from '@/lib/format'

/**
 * Indicador con número animado.
 * format: función que recibe el número animado y devuelve el texto a mostrar.
 */
export function KpiCard({ label, value, format = (n) => Math.round(n).toLocaleString('es-CL'), hint, icon: Icon, color = '#ffc400', onClick, active, delay = 0 }) {
  const animated = useCountUp(value)
  const Comp = onClick ? motion.button : motion.div
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cx(
        'glass group relative overflow-hidden rounded-2xl p-4 text-left transition-colors',
        onClick && 'cursor-pointer focus-visible:outline-2 focus-visible:outline-brand',
      )}
      style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, var(--glass-shadow)` } : undefined}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && (
          <span className="grid size-8 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <div className="tabular mt-3 text-[26px] leading-none font-semibold tracking-tight">{format(animated)}</div>
      {hint && <div className="mt-2 truncate text-xs text-muted">{hint}</div>}
    </Comp>
  )
}
