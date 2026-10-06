import { useMemo } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { ALL_BRANCHES, getOpenWorkOrders, getVehicles } from '@/data/api'
import LoginScreen from '@/components/login/LoginScreen'

export default function Login() {
  const { user, login } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // Datos reales de la flota para las tarjetas del ingreso.
  const stats = useMemo(() => {
    const vehicles = getVehicles(ALL_BRANCHES)
    const open = getOpenWorkOrders(ALL_BRANCHES)
    const down = vehicles.filter((v) => v.status === 'workshop' || v.status === 'out').length
    return {
      vehicles: vehicles.length,
      workshop: new Set(open.map((o) => o.plate)).size,
      availability: vehicles.length ? (vehicles.length - down) / vehicles.length : 0,
    }
  }, [])

  if (user) return <Navigate to={location.state?.from || '/'} replace />

  return (
    <LoginScreen
      stats={stats}
      onLogin={() => {
        login()
        navigate(location.state?.from || '/', { replace: true })
      }}
    />
  )
}
