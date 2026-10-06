import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { cx } from '@/lib/format'

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="bg-gradient-to-b from-[var(--text)] to-[color-mix(in_srgb,var(--text)_60%,transparent)] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Selector segmentado (p. ej. Tabla / Tablero). */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="glass inline-flex rounded-xl p-1" role="tablist">
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx('relative inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors', active ? 'text-brand-ink' : 'text-muted hover:text-fg')}
          >
            {active && <motion.span layoutId={`seg-${options.map((x) => x.value).join('')}`} className="absolute inset-0 rounded-lg bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative inline-flex items-center gap-1.5">
              {Icon && <Icon size={14} />}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-[var(--glass-border)] bg-input pr-3 pl-9 text-sm text-fg outline-none placeholder:text-subtle focus:border-brand/70 focus:ring-2 focus:ring-brand/20"
      />
    </div>
  )
}

export function Stat({ label, value, className }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="tabular mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

export function ProgressBar({ value, color = '#ffc400', className }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-[var(--line)]', className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}
