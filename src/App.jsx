import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from '@/context/AppContext'
import { Layout } from '@/components/layout/Layout'

// Cada página se carga solo cuando se visita (inicio más rápido).
// La presentación de ingreso (three.js) solo se descarga cuando se visita.
const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const OpenWorkOrders = lazy(() => import('@/pages/OpenWorkOrders'))
const Fleet = lazy(() => import('@/pages/Fleet'))
const VehicleDetail = lazy(() => import('@/pages/VehicleDetail'))
const Visits = lazy(() => import('@/pages/Visits'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Health = lazy(() => import('@/pages/Health'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Analyst = lazy(() => import('@/pages/Analyst'))
const Reports = lazy(() => import('@/pages/Reports'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function RequireAuth({ children }) {
  const { user } = useApp()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

function PageFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
                <Login />
              </Suspense>
            }
          />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            {[
              ['/', Dashboard],
              ['/ot', OpenWorkOrders],
              ['/flota', Fleet],
              ['/flota/:plate', VehicleDetail],
              ['/visitas', Visits],
              ['/gastos', Expenses],
              ['/alertas', Alerts],
              ['/salud', Health],
              ['/analista', Analyst],
              ['/reportes', Reports],
              ['*', NotFound],
            ].map(([path, Page]) => (
              <Route
                key={path}
                path={path}
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Page />
                  </Suspense>
                }
              />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
