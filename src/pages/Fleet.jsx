import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Camera, Database, Download, FileSpreadsheet, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { ALL_BRANCHES, TODAY, getFleetMeta, getVehicles, isRealData, iso, resetFleet } from '@/data/api'
import { CATEGORIES, VEHICLE_STATUS } from '@/data/catalog'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader, SearchInput } from '@/components/ui/misc'
import { cx, date, km, num } from '@/lib/format'
import { exportFleetExcel } from '@/lib/fleetExcel'
import { exportFleet } from '@/lib/excel/exports'
import { ImportFleetModal } from '@/components/fleet/ImportFleetModal'
import { SapImportModal } from '@/components/fleet/SapImportModal'
import { FleetPhotoModal } from '@/components/fleet/FleetPhotoModal'
import { photoUrl, useFleetPhotos } from '@/lib/fleetPhotos'
import { clearSapData } from '@/lib/sapStore'
import { toast } from 'sonner'

function MaintenanceCell({ v }) {
  if (!v.mileage) return <div className="text-right text-xs text-muted">Sin registro</div>
  const left = v.kmToMaintenance
  const color = left < 0 ? '#ef4444' : left < 1500 ? '#f59e0b' : '#22c55e'
  return (
    <div className="text-right">
      <div className="tabular font-medium" style={{ color }}>
        {left < 0 ? `Vencida ${num(-left)} km` : `en ${num(left)} km`}
      </div>
      <div className="tabular text-xs text-muted">{km(v.nextMaintenanceKm)}</div>
    </div>
  )
}

export default function Fleet() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const vehicles = useData((b) => getVehicles(b, { includeSold: true }))
  const [query, setQuery] = useState(params.get('cliente') ?? '')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [transmission, setTransmission] = useState('all')
  const [fuel, setFuel] = useState('all')
  const [importing, setImporting] = useState(false)
  const [loadingSap, setLoadingSap] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [addingPhotos, setAddingPhotos] = useState(false)
  const photos = useFleetPhotos()
  const meta = useData(() => getFleetMeta())
  const allVehicles = useData(() => getVehicles(ALL_BRANCHES, { includeSold: true }))
  const maintenanceDue = params.get('mantencion') === 'vencida'
  const docsDue = params.get('documentos') === 'vencidos'

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const today = iso(TODAY)
    return vehicles.filter(
      (v) =>
        (category === 'all' || v.category === category) &&
        (status === 'all' || v.status === status) &&
        (transmission === 'all' || v.transmission === transmission) &&
        (fuel === 'all' || v.fuel === fuel) &&
        (!maintenanceDue || v.kmToMaintenance < 0) &&
        (!docsDue || v.documents.some((d) => d.expiresAt < today)) &&
        (!q || [v.plate, v.brand, v.model, v.branch, v.client, v.vin].some((x) => String(x).toLowerCase().includes(q))),
    )
  }, [vehicles, query, category, status, transmission, fuel, maintenanceDue, docsDue])

  const counts = useMemo(() => {
    const c = Object.fromEntries(Object.keys(VEHICLE_STATUS).map((k) => [k, 0]))
    vehicles.forEach((v) => (c[v.status] += 1))
    return c
  }, [vehicles])

  // Estados y filtros que los datos no usan (p. ej. arriendos o transmisión, que el SAP no trae) no se muestran.
  const shownStatus = Object.entries(VEHICLE_STATUS).filter(([id]) => !isRealData || counts[id] > 0)
  const hasTransmission = vehicles.some((v) => v.transmission)
  const active = [category, status, transmission, fuel].filter((x) => x !== 'all').length + (query ? 1 : 0) + (maintenanceDue ? 1 : 0) + (docsDue ? 1 : 0)
  const clear = () => {
    setQuery('')
    setCategory('all')
    setStatus('all')
    setTransmission('all')
    setFuel('all')
    setParams({}, { replace: true })
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: 'plate',
        header: 'Patente',
        cell: (c) => {
          const photo = photos[c.getValue()]?.at(-1)
          return (
            <span className="flex items-center gap-2.5">
              {photo && <img src={photoUrl(photo.file)} alt="" loading="lazy" className="size-8 shrink-0 rounded-md object-cover" />}
              <span className="font-semibold">{c.getValue()}</span>
            </span>
          )
        },
      },
      {
        id: 'model',
        accessorFn: (v) => `${v.brand} ${v.model}`,
        header: 'Vehículo',
        cell: ({ row: { original: v } }) => (
          <div className="max-w-52">
            <div className="truncate">{v.brand} {v.model}</div>
            <div className="text-xs text-muted">
              {v.categoryLabel} · {v.year}
            </div>
          </div>
        ),
      },
      {
        id: 'mechanics',
        accessorFn: (v) => `${v.transmission} ${v.fuel}`,
        header: hasTransmission ? 'Mecánica' : 'Combustible',
        cell: ({ row: { original: v } }) => (
          <div className="text-muted">
            <div>{v.transmission}</div>
            <div className="text-xs">{v.fuel}</div>
          </div>
        ),
      },
      {
        accessorKey: 'branch',
        header: 'Sucursal / cliente',
        cell: ({ row: { original: v } }) => (
          <div className="max-w-52">
            <div className="truncate">{v.branch}</div>
            <div className="truncate text-xs text-muted">{v.client || 'Sin cliente asignado'}</div>
          </div>
        ),
      },
      { accessorKey: 'statusLabel', header: 'Estado', cell: ({ row: { original: v } }) => <Badge color={VEHICLE_STATUS[v.status].color}>{v.statusLabel}</Badge> },
      { accessorKey: 'mileage', header: 'Kilometraje', cell: (c) => (c.getValue() ? km(c.getValue()) : '—'), meta: { align: 'right' } },
      { accessorKey: 'kmToMaintenance', header: 'Mantención', cell: ({ row: { original: v } }) => <MaintenanceCell v={v} />, meta: { align: 'right' } },
    ],
    [hasTransmission, photos],
  )

  const exportReport = () => exportFleet(rows, { filters: rows.length === vehicles.length ? 'toda la flota' : `${rows.length} de ${vehicles.length} vehículos (filtros aplicados)` })

  return (
    <>
      <PageHeader
        title="Flota"
        description={`${vehicles.length} vehículos · ${rows.length} con los filtros actuales`}
        actions={
          <>
            <Button onClick={exportReport} title="Informe en Excel con resumen y gráficos de lo filtrado">
              <Download size={16} /> Informe Excel
            </Button>
            <Button
              disabled={exporting}
              onClick={async () => {
                setExporting(true)
                try {
                  await exportFleetExcel(rows, `WEST_IA_flota_${iso(TODAY)}.xlsx`)
                  toast.success('Flota exportada a Excel', { description: `${rows.length.toLocaleString('es-CL')} vehículos` })
                } finally {
                  setExporting(false)
                }
              }}
              title="Exportar lo filtrado en Excel (se puede volver a importar)"
            >
              <FileSpreadsheet size={16} /> {exporting ? 'Generando…' : 'Excel editable'}
            </Button>
            <Button onClick={() => setAddingPhotos(true)} title="Subir fotos: la patente se lee sola y la foto queda en la ficha del vehículo">
              <Camera size={16} /> Subir fotos
            </Button>
            <Button onClick={() => setImporting(true)} title="Actualizar vehículos con la plantilla de flota">
              <Upload size={16} /> Importar plantilla
            </Button>
            <Button variant="primary" onClick={() => setLoadingSap(true)}>
              <Database size={16} /> Cargar Excel del SAP
            </Button>
          </>
        }
      />

      {meta.source === 'excel' ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="shrink-0 text-emerald-400" />
            <span>
              Flota importada desde <b>{meta.fileName}</b> el {date(meta.importedAt?.slice(0, 10))} · {allVehicles.length} vehículos
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(`¿Quitar la flota importada? Se volverá a ${isRealData ? 'los datos del SAP' : 'la flota de demostración'}.`)) resetFleet()
            }}
          >
            <RotateCcw size={14} /> {isRealData ? 'Volver a los datos del SAP' : 'Volver a datos de demostración'}
          </Button>
        </div>
      ) : meta.source === 'sap' ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Database size={18} className="shrink-0 text-brand-text" />
            <span>
              Datos del SAP: <b>{meta.fileName}</b>, cargado el {date(meta.importedAt?.slice(0, 10))} · {num(allVehicles.length)} vehículos · OT del {date(meta.from)} al {date(meta.to)}
            </span>
          </span>
          {meta.loadedFrom === 'browser' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!window.confirm('¿Quitar el Excel del SAP cargado en este navegador?')) return
                await clearSapData()
                window.location.reload()
              }}
            >
              <Trash2 size={14} /> Quitar datos cargados
            </Button>
          )}
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[var(--line)] px-4 py-3 text-xs text-muted">
          <FileSpreadsheet size={16} className="shrink-0 text-brand-text" />
          Mostrando la flota de demostración. Use “Cargar Excel del SAP” para cargar los datos reales.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {shownStatus.map(([id, s], i) => (
          <motion.button
            key={id}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setStatus(status === id ? 'all' : id)}
            className={cx('glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition', status === id ? 'ring-2' : 'hover:bg-hover')}
            style={status === id ? { '--tw-ring-color': s.color } : undefined}
          >
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="tabular font-semibold">{counts[id]}</span>
          </motion.button>
        ))}
      </div>

      <Card className="p-3" delay={0.05}>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Patente, modelo, cliente, VIN…" className="min-w-60 flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: 'all', label: 'Todas las categorías' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]} className="w-56" aria-label="Categoría" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'all', label: 'Todos los estados' }, ...shownStatus.map(([value, s]) => ({ value, label: s.label }))]} className="w-44" aria-label="Estado" />
          {hasTransmission && <Select value={transmission} onChange={(e) => setTransmission(e.target.value)} options={[{ value: 'all', label: 'Transmisión' }, 'Manual', 'Automática']} className="w-36" aria-label="Transmisión" />}
          <Select value={fuel} onChange={(e) => setFuel(e.target.value)} options={[{ value: 'all', label: 'Combustible' }, 'Bencina', 'Diésel']} className="w-36" aria-label="Combustible" />
          {active > 0 && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X size={14} /> Limpiar ({active})
            </Button>
          )}
        </div>
        {(maintenanceDue || docsDue) && (
          <div className="mt-2 flex gap-2 px-1 text-xs">
            {maintenanceDue && <Badge color="#ef4444">Solo mantenciones vencidas</Badge>}
            {docsDue && <Badge color="#ef4444">Solo documentos vencidos</Badge>}
          </div>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden" delay={0.1}>
        <DataTable data={rows} columns={columns} onRowClick={(v) => navigate(`/flota/${v.plate}`)} pageSize={15} initialSort={[{ id: 'plate', desc: false }]} />
      </Card>
      <ImportFleetModal open={importing} onClose={() => setImporting(false)} />
      <SapImportModal open={loadingSap} onClose={() => setLoadingSap(false)} />
      <FleetPhotoModal open={addingPhotos} onClose={() => setAddingPhotos(false)} />
    </>
  )
}
