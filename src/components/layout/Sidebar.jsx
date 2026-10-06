import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useData } from '@/hooks/useData'
import { getOpenWorkOrders } from '@/data/api'
import { cx } from '@/lib/format'
import logo from '@/assets/img/west_logo_yellow.png'
import { NAV } from './nav'

function NavItems({ collapsed, onNavigate }) {
  const openCount = useData((branch) => getOpenWorkOrders(branch).length)
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegación principal">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            cx(
              'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              isActive ? 'text-brand-ink' : 'text-muted hover:bg-hover hover:text-fg',
              collapsed && 'justify-center px-0',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-brand shadow-[0_6px_20px_-8px_rgba(255,196,0,0.6)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <Icon size={18} className="relative shrink-0" strokeWidth={isActive ? 2.4 : 2} />
              {!collapsed && <span className="relative truncate">{label}</span>}
              {badge === 'openOT' && openCount > 0 && (
                <span
                  className={cx(
                    'tabular relative ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    isActive ? 'bg-brand-ink/15 text-brand-ink' : 'bg-amber-500/15 text-amber-500',
                    collapsed && 'absolute -top-1 -right-1 ml-0 px-1',
                  )}
                >
                  {openCount}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserCard({ collapsed }) {
  const { user, logout } = useApp()
  if (!user) return null
  return (
    <div className={cx('flex items-center gap-3 rounded-xl p-2', !collapsed && 'glass')}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-amber-600 text-xs font-bold text-brand-ink">
        {user.initials}
      </span>
      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-[11px] text-muted">{user.role}</div>
          </div>
          <button type="button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg">
            <LogOut size={16} />
          </button>
        </>
      )}
    </div>
  )
}

function Brand({ collapsed }) {
  return (
    <div className={cx('flex h-16 items-center', collapsed ? 'justify-center' : 'gap-3 px-2')}>
      {collapsed ? (
        <span className="grid size-10 place-items-center rounded-xl bg-brand text-lg font-black text-brand-ink">W</span>
      ) : (
        <>
          <img src={logo} alt="West" className="h-8 w-auto" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">WEST IA</div>
            <div className="text-[10px] font-medium tracking-wide text-muted uppercase">Gestión de flota</div>
          </div>
        </>
      )}
    </div>
  )
}

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useApp()
  return (
    <>
      {/* Escritorio */}
      <motion.aside
        animate={{ width: collapsed ? 84 : 264 }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="glass sticky top-3 z-30 m-3 mr-0 hidden h-[calc(100vh-24px)] shrink-0 flex-col rounded-2xl p-3 lg:flex"
      >
        <Brand collapsed={collapsed} />
        <div className="mt-4 flex-1 overflow-y-auto">
          <NavItems collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className={cx('mb-2 flex h-9 items-center gap-3 rounded-xl px-3 text-xs text-muted transition hover:bg-hover hover:text-fg', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && 'Contraer menú'}
        </button>
        <UserCard collapsed={collapsed} />
      </motion.aside>

      {/* Móvil */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNavOpen(false)} />
            <motion.aside
              className="glass-strong fixed inset-y-0 left-0 z-50 flex w-72 flex-col p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              <Brand />
              <div className="mt-4 flex-1 overflow-y-auto">
                <NavItems onNavigate={() => setMobileNavOpen(false)} />
              </div>
              <UserCard />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
