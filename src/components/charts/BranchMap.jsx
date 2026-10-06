import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useApp } from '@/context/AppContext'
import { ALL_BRANCHES } from '@/data/branches'

// Esri Canvas: mapa base gris oscuro / claro, sin clave de acceso.
// (CARTO Dark Matter ahora exige API key; para usarlo, agregar la clave aquí.)
const TILES = {
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin'

function FlyToBranch({ branch }) {
  const map = useMap()
  useEffect(() => {
    if (branch) map.flyTo([branch.lat, branch.lng], 8, { duration: 0.8 })
    else map.flyToBounds([[-17.8, -75], [-42.2, -66.5]], { duration: 0.8 })
  }, [branch, map])
  return null
}

/**
 * rows: [{ branch, total, available, rented, workshop }]
 * El tamaño del punto representa la cantidad de vehículos; el color, la
 * proporción de unidades en taller (verde → ámbar → rojo).
 */
export function BranchMap({ rows, onSelect }) {
  const { theme, branchId } = useApp()
  const selected = useMemo(() => rows.find((r) => r.branch.id === branchId)?.branch, [rows, branchId])
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <MapContainer
      bounds={[[-17.8, -75], [-42.2, -66.5]]}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl
      className="h-full min-h-[460px] w-full rounded-b-2xl"
    >
      <TileLayer key={theme} url={TILES[theme === 'dark' ? 'dark' : 'light']} attribution={ATTRIBUTION} maxZoom={16} />
      <FlyToBranch branch={branchId === ALL_BRANCHES ? null : selected} />
      {rows.filter((r) => r.branch.lat != null).map((r) => {
        const share = r.total ? r.workshop / r.total : 0
        const color = r.total === 0 ? '#64748b' : share >= 0.34 ? '#ef4444' : share > 0 ? '#f59e0b' : '#22c55e'
        const isSelected = r.branch.id === branchId
        return (
          <CircleMarker
            key={r.branch.id}
            center={[r.branch.lat, r.branch.lng]}
            radius={6 + (r.total / max) * 12}
            pathOptions={{
              color: isSelected ? '#ffc400' : color,
              weight: isSelected ? 3 : 1.5,
              fillColor: color,
              fillOpacity: 0.45,
            }}
            eventHandlers={{ click: () => onSelect?.(r.branch.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]} className="west-tooltip" opacity={1}>
              <div className="min-w-40 text-xs">
                <div className="mb-1 font-semibold">{r.branch.name}</div>
                <div className="flex justify-between gap-4"><span className="text-muted">Vehículos</span><b>{r.total}</b></div>
                <div className="flex justify-between gap-4"><span style={{ color: '#22c55e' }}>Disponibles</span><b>{r.available}</b></div>
                <div className="flex justify-between gap-4"><span style={{ color: '#3b82f6' }}>Arrendados</span><b>{r.rented}</b></div>
                <div className="flex justify-between gap-4"><span style={{ color: '#f59e0b' }}>En taller</span><b>{r.workshop}</b></div>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
