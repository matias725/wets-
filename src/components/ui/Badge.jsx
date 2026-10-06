import { daysColor } from '@/data/catalog'
import { cx } from '@/lib/format'

export function Badge({ color = '#94a3b8', children, dot = true, className, title }) {
  return (
    <span
      title={title}
      className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', className)}
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color: `color-mix(in srgb, ${color} 75%, var(--text))` }}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export function DaysBadge({ days }) {
  const color = daysColor(days)
  return (
    <span
      className="tabular inline-flex min-w-11 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      title="0–2 verde · 3–10 ámbar · 11–20 naranja · >20 rojo"
    >
      {days} d
    </span>
  )
}
