import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cx } from '@/lib/format'

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
}

function Backdrop({ onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    />
  )
}

function Header({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg">
        <X size={18} />
      </button>
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEscape(open, onClose)
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size]
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClose={onClose} />
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cx('glass-strong pointer-events-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl', width)}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Header title={title} subtitle={subtitle} onClose={onClose} />
              <div className="overflow-y-auto px-6 py-5">{children}</div>
              {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer }) {
  useEscape(open, onClose)
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClose={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass-strong fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col sm:rounded-l-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <Header title={title} subtitle={subtitle} onClose={onClose} />
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
