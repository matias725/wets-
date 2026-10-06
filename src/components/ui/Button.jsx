import { forwardRef } from 'react'
import { cx } from '@/lib/format'

const VARIANTS = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-[0_6px_20px_-6px_rgba(255,196,0,0.55)]',
  secondary: 'glass text-fg hover:bg-hover',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'bg-red-500/90 text-white hover:bg-red-500',
}
const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2 rounded-xl',
  icon: 'size-9 rounded-xl',
}

export const Button = forwardRef(function Button({ variant = 'secondary', size = 'md', className, children, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
