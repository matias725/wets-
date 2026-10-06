import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ALL_BRANCHES, BRANCH_BY_ID } from '@/data/branches'
import { CURRENT_USER } from '@/data/people'

const AppContext = createContext(null)

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => readStorage('westia.theme', 'dark'))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStorage('westia.sidebar', '0') === '1')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [branchId, setBranchId] = useState(() => {
    const saved = readStorage('westia.branch', ALL_BRANCHES)
    return saved === ALL_BRANCHES || BRANCH_BY_ID[saved] ? saved : ALL_BRANCHES
  })
  const [user, setUser] = useState(() => (readStorage('westia.session', '') ? CURRENT_USER : null))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f3f5f9')
    writeStorage('westia.theme', theme)
  }, [theme])
  useEffect(() => writeStorage('westia.sidebar', sidebarCollapsed ? '1' : '0'), [sidebarCollapsed])
  useEffect(() => writeStorage('westia.branch', branchId), [branchId])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), [])
  const login = useCallback(() => {
    writeStorage('westia.session', '1')
    setUser(CURRENT_USER)
  }, [])
  const logout = useCallback(() => {
    try {
      localStorage.removeItem('westia.session')
    } catch {
      /* nada */
    }
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      theme, toggleTheme, sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen,
      branchId, setBranchId, user, login, logout,
    }),
    [theme, toggleTheme, sidebarCollapsed, toggleSidebar, mobileNavOpen, branchId, user, login, logout],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>')
  return ctx
}
