import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Building2, ChevronDown, Menu, Moon, Search, Sun } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useData } from '@/hooks/useData'
import { ALL_BRANCHES, BRANCHES, getNotifications, searchAll } from '@/data/api'
import { cx, todayLong } from '@/lib/format'

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => ref.current && !ref.current.contains(e.target) && onOutside()
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside])
}

function BranchSelector() {
  const { branchId, setBranchId } = useApp()
  return (
    <label className="glass relative flex h-10 items-center gap-2 rounded-xl pr-8 pl-3 text-sm">
      <Building2 size={16} className="shrink-0 text-brand-text" />
      <span className="sr-only">Sucursal</span>
      <select
        value={branchId}
        onChange={(e) => setBranchId(e.target.value)}
        className="max-w-[180px] cursor-pointer appearance-none truncate bg-transparent font-medium outline-none sm:max-w-[220px] [&>option]:bg-[var(--glass-strong)] [&>option]:text-fg"
      >
        <option value={ALL_BRANCHES}>Todas las sucursales</option>
        {BRANCHES.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  )
}

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const ref = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const results = query.trim().length >= 2 ? searchAll(query) : []
  useClickOutside(ref, () => setOpen(false))

  // Atajo: "/" enfoca el buscador
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (r) => {
    navigate(r.to)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  return (
    <div ref={ref} className="relative min-w-0 flex-1 md:max-w-md">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, results.length - 1))
          if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
          if (e.key === 'Enter' && results[cursor]) go(results[cursor])
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Buscar patente, N° de OT o cliente…"
        aria-label="Búsqueda global"
        className="glass h-10 w-full rounded-xl pr-10 pl-9 text-sm outline-none placeholder:text-subtle focus:ring-2 focus:ring-brand/30"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-[10px] text-subtle sm:block">/</kbd>
      <AnimatePresence>
        {open && query.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-xl p-1.5"
          >
            {results.length ? (
              results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                  className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === cursor && 'bg-hover')}
                >
                  <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide text-brand-text uppercase">{r.type}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted">Sin coincidencias para “{query}”</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const TONE = { danger: '#ef4444', warning: '#f59e0b' }

function Notifications() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const items = useData((branch) => getNotifications(branch))
  useClickOutside(ref, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones" className="glass relative grid size-10 place-items-center rounded-xl text-muted transition hover:text-fg">
        <Bell size={18} />
        {items.length > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-red-500 ring-2 ring-[var(--bg)]" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute top-12 right-0 z-50 w-80 overflow-hidden rounded-xl"
          >
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">Alertas</div>
            {items.length ? (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    navigate(n.to)
                    setOpen(false)
                  }}
                  className="flex w-full gap-3 border-b border-line px-4 py-3 text-left transition last:border-0 hover:bg-hover"
                >
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: TONE[n.tone] }} />
                  <span>
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="block text-xs text-muted">{n.detail}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted">Sin alertas pendientes</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Header() {
  const { theme, toggleTheme, setMobileNavOpen } = useApp()
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 px-4 pt-3 pb-3 max-md:bg-[var(--bg)] md:backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú" className="glass grid size-10 shrink-0 place-items-center rounded-xl text-muted lg:hidden">
          <Menu size={18} />
        </button>
        <GlobalSearch />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <BranchSelector />
          </div>
          <span className="hidden text-xs text-muted xl:block">{todayLong()}</span>
          <Notifications />
          <button type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} className="glass grid size-10 place-items-center rounded-xl text-muted transition hover:text-fg">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
      <div className="mt-2 sm:hidden">
        <BranchSelector />
      </div>
    </header>
  )
}
