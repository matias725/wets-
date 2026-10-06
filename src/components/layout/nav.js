import { BellRing, Car, ClipboardList, FileBarChart, HeartPulse, LayoutDashboard, MapPin, Receipt, Sparkles } from 'lucide-react'

export const NAV = [
  { to: '/', label: 'Panel principal', icon: LayoutDashboard, end: true },
  { to: '/ot', label: 'Control OT abiertas', icon: ClipboardList, badge: 'openOT' },
  { to: '/alertas', label: 'Alertas y rankings', icon: BellRing },
  { to: '/flota', label: 'Flota', icon: Car },
  { to: '/visitas', label: 'Visitas a sucursal', icon: MapPin },
  { to: '/gastos', label: 'Control de Gastos', icon: Receipt },
  { to: '/salud', label: 'Salud e Inteligencia', icon: HeartPulse },
  { to: '/analista', label: 'Analista Técnico', icon: Sparkles },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart },
]
