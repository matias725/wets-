import { ChevronDown } from 'lucide-react'
import { cx } from '@/lib/format'

const control =
  'w-full rounded-xl border border-[var(--glass-border)] bg-input px-3 text-sm text-fg placeholder:text-subtle ' +
  'transition-colors outline-none focus:border-brand/70 focus:ring-2 focus:ring-brand/20'

export function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
      {children}
    </label>
  )
}

export function Field({ label, id, children, className }) {
  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
    </div>
  )
}

export function Input({ className, ...props }) {
  return <input className={cx(control, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return <textarea className={cx(control, 'min-h-24 py-2.5', className)} {...props} />
}

/** options: array de strings o de { value, label } */
export function Select({ options, className, ...props }) {
  return (
    <div className={cx('relative', className)}>
      <select className={cx(control, 'h-10 cursor-pointer appearance-none pr-9 [&>option]:bg-[var(--glass-strong)] [&>option]:text-fg')} {...props}>
        {options.map((o) => {
          const value = typeof o === 'string' ? o : o.value
          const label = typeof o === 'string' ? o : o.label
          return (
            <option key={value} value={value}>
              {label}
            </option>
          )
        })}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </div>
  )
}
