import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, FileSpreadsheet, RotateCcw, Upload, X } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { ALL_BRANCHES, TODAY, getFleetMeta, getVehicles, iso, resetFleet } from '@/data/api'
import { CATEGORIES, VEHICLE_STATUS } from '@/data/catalog'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader, SearchInput } from '@/components/ui/misc'
import { cx, date, downloadCSV, km, num } from '@/lib/format'
import { exportFleetExcel } from '@/lib/fleetExcel'
import { ImportFleetModal } from '@/components/fleet/ImportFleetModal'

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
  const [exporting, setExporting] = useState(false)
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
      { accessorKey: 'plate', header: 'Patente', cell: (c) => <span className="font-semibold">{c.getValue()}</span> },
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
        header: 'Mecánica',
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
    [],
  )

  const exportCSV = () =>
    downloadCSV(`west-flota-${iso(TODAY)}.csv`, rows, [
      { label: 'Patente', value: 'plate' },
      { label: 'Marca', value: 'brand' },
      { label: 'Modelo', value: 'model' },
      { label: 'Categoría', value: 'categoryLabel' },
      { label: 'Año', value: 'year' },
      { label: 'Transmisión', value: 'transmission' },
      { label: 'Combustible', value: 'fuel' },
      { label: 'Sucursal', value: 'branch' },
      { label: 'Estado', value: 'statusLabel' },
      { label: 'Cliente', value: 'client' },
      { label: 'Kilometraje', value: 'mileage' },
      { label: 'Próxima mantención (km)', value: 'nextMaintenanceKm' },
      { label: 'VIN', value: 'vin' },
    ])

  return (
    <>
      <PageHeader
        title="Flota"
        description={`${vehicles.length} vehículos · ${rows.length} con los filtros actuales`}
        actions={
          <>
            <Button onClick={exportCSV} title="Exportar lo filtrado en CSV">
              <Download size={16} /> CSV
            </Button>
            <Button
              disabled={exporting}
              onClick={async () => {
                setExporting(true)
                try {
                  await exportFleetExcel(rows, `WEST_IA_flota_${iso(TODAY)}.xlsx`)
                } finally {
                  setExporting(false)
                }
              }}
              title="Exportar lo filtrado en Excel (se puede volver a importar)"
            >
              <FileSpreadsheet size={16} /> {exporting ? 'Generando…' : 'Exportar Excel'}
            </Button>
            <Button variant="primary" onClick={() => setImporting(true)}>
              <Upload size={16} /> Importar Excel
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
              if (window.confirm('¿Volver a la flota de demostración? La flota importada se quitará de este navegador.')) resetFleet()
            }}
          >
            <RotateCcw size={14} /> Volver a datos de demostración
          </Button>
        </div>
      ) : meta.source === 'sap' ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/25 bg-brand/10 px-4 py-3 text-sm">
          <FileSpreadsheet size={18} className="shrink-0 text-brand-text" />
          <span>
            Flota real cargada desde <b>{meta.fileName}</b> · {num(allVehicles.length)} vehículos · OT desde el {date(meta.from)} al {date(meta.to)}
          </span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[var(--line)] px-4 py-3 text-xs text-muted">
          <FileSpreadsheet size={16} className="shrink-0 text-brand-text" />
          Mostrando la flota de demostración. Use “Importar Excel” para cargar la flota real.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(VEHICLE_STATUS).map(([id, s], i) => (
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
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'all', label: 'Todos los estados' }, ...Object.entries(VEHICLE_STATUS).map(([value, s]) => ({ value, label: s.label }))]} className="w-44" aria-label="Estado" />
          <Select value={transmission} onChange={(e) => setTransmission(e.target.value)} options={[{ value: 'all', label: 'Transmisión' }, 'Manual', 'Automática']} className="w-36" aria-label="Transmisión" />
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
    </>
  )
}
