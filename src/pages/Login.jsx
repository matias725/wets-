import { useMemo } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { ALL_BRANCHES, BRANCHES, TODAY, addDays, getExpenseRows, getOpenWorkOrders, getVehicles, iso } from '@/data/api'
import { clpShort } from '@/lib/format'
import HiluxShowcase from '@/components/login/HiluxShowcase'

export default function Login() {
  const { user, login } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // Datos reales de la flota para la portada y el cuadro de datos.
  const { stats, branchList } = useMemo(() => {
    const vehicles = getVehicles(ALL_BRANCHES)
    const open = getOpenWorkOrders(ALL_BRANCHES)
    const down = vehicles.filter((v) => v.status === 'workshop' || v.status === 'out').length
    const since = iso(addDays(TODAY, -30))
    const spend = getExpenseRows(ALL_BRANCHES).filter((e) => e.date > since).reduce((s, e) => s + e.total, 0)
    const list = BRANCHES.map((b) => {
      const own = vehicles.filter((v) => v.branchId === b.id)
      return { id: b.id, name: b.name.replace(' (casa matriz)', '').replace(' (Santiago)', ''), total: own.length, available: own.filter((v) => v.status === 'available').length }
    })
    return {
      stats: {
        vehicles: vehicles.length,
        branches: BRANCHES.length,
        workshop: new Set(open.map((o) => o.plate)).size,
        openOT: open.length,
        availability: vehicles.length ? (vehicles.length - down) / vehicles.length : 0,
        spend: clpShort(spend).replace('$ ', '$').replace('$ ', '$'),
      },
      branchList: list,
    }
  }, [])

  if (user) return <Navigate to={location.state?.from || '/'} replace />

  return (
    <HiluxShowcase
      stats={stats}
      branchList={branchList}
      onLogin={() => {
        login()
        navigate(location.state?.from || '/', { replace: true })
      }}
    />
  )
}
