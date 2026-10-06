import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlarmClock, Building2, Download, TrendingUp, Wrench } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { useApp } from '@/context/AppContext'
import { getAvailableMonths, getBranchComparison, getCostRanking, getMaintenanceDue, getStalledOrders, TODAY, iso } from '@/data/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader, Segmented } from '@/components/ui/misc'
import { clp, cx, downloadCSV, km, monthLong, num, pct } from '@/lib/format'

const TABS = [
  { value: 'ot', label: 'OT estancadas', icon: AlarmClock },
  { value: 'mant', label: 'Mantenciones', icon: Wrench },
  { value: 'gasto', label: 'Gasto por vehículo', icon: TrendingUp },
  { value: 'suc', label: 'Sucursales', icon: Building2 },
]

const ADVICE = {
  sell: { label: 'Evaluar venta', color: '#ef4444' },
  review: { label: 'Revisar', color: '#f59e0b' },
}

function Vehicle({ plate, sub }) {
  return (
    <div className="min-w-0">
      <div className="font-semibold">{plate}</div>
      <div className="max-w-56 truncate text-xs text-muted">{sub}</div>
    </div>
  )
}

// ------------------------------------------------------------- OT estancadas
function StalledTab({ rows, minDays, setMinDays }) {
  const navigate = useNavigate()
  const byBranch = useMemo(() => {
    const m = {}
    rows.forEach((o) => (m[o.branch] = (m[o.branch] ?? 0) + 1))
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Vehículos detenidos en taller"
        subtitle="OT abiertas en SAP ordenadas por días en taller. Responsable: el registrado en la gestión de la OT o, si no hay, quien más OT genera en esa sucursal (sugerido)."
        icon={AlarmClock}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={minDays} onChange={setMinDays} options={[{ value: 15, label: 'Más de 15 días' }, { value: 30, label: 'Más de 30 días' }]} />
            <Button
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                downloadCSV(`OT_estancadas_${minDays}d_${iso(TODAY)}.csv`, rows, [
                  { label: 'OT', value: 'workOrder' },
                  { label: 'Patente', value: 'plate' },
                  { label: 'Vehículo', value: 'vehicle' },
                  { label: 'Sucursal', value: 'branch' },
                  { label: 'Días en taller', value: 'daysOpen' },
                  { label: 'Responsable', value: (o) => `${o.owner}${o.ownerSuggested ? ' (sugerido)' : ''}` },
                  { label: 'Estado real', value: (o) => o.management.realStatus },
                  { label: 'Motivo', value: 'reason' },
                ])
              }
            >
              <Download size={14} /> CSV
            </Button>
          </div>
        }
      />
      {byBranch.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {byBranch.map(([b, n]) => (
            <span key={b} className="rounded-lg bg-[var(--line)] px-2 py-1 text-xs">
              {b} <b className="tabular">{n}</b>
            </span>
          ))}
        </div>
      )}
      <DataTable
        data={rows}
        pageSize={15}
        onRowClick={(o) => navigate(`/ot?ot=${o.workOrder}`)}
        emptyText={`Ninguna OT abierta con más de ${minDays} días`}
        minWidth={860}
        columns={[
          { accessorKey: 'daysOpen', header: 'Días', cell: (c) => <DaysBadge days={c.getValue()} /> },
          { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: o } }) => <Vehicle plate={o.plate} sub={o.vehicle || o.client} /> },
          { accessorKey: 'workOrder', header: 'OT', cell: (c) => <span className="tabular text-muted">{c.getValue()}</span> },
          { accessorKey: 'branch', header: 'Sucursal' },
          {
            accessorKey: 'owner',
            header: 'Responsable',
            cell: ({ row: { original: o } }) => (
              <div>
                <div className="font-medium">{o.owner}</div>
                {o.ownerSuggested && <div className="text-[11px] text-muted">sugerido · sin gestión registrada</div>}
              </div>
            ),
          },
          { id: 'reason', accessorFn: (o) => o.reason, header: 'Motivo', cell: (c) => <span className="line-clamp-2 max-w-72 text-xs text-muted">{c.getValue()}</span> },
        ]}
      />
    </Card>
  )
}

// ------------------------------------------------------------- mantenciones
function MaintenanceTab({ rows }) {
  const navigate = useNavigate()
  const [view, setView] = useState('soon')
  const shown = view === 'soon' ? rows.filter((v) => v.kmToMaintenance >= 0) : rows.filter((v) => v.kmToMaintenance < 0)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Mantenciones preventivas"
        subtitle="Próxima mantención = última preventiva + 10.000 km. El kilometraje es el último registrado en una OT del SAP."
        icon={Wrench}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'soon', label: `Faltan ≤ 1.000 km (${rows.filter((v) => v.kmToMaintenance >= 0).length})` },
                { value: 'late', label: `Vencidas (${rows.filter((v) => v.kmToMaintenance < 0).length})` },
              ]}
            />
            <Button
              size="sm"
              disabled={!shown.length}
              onClick={() =>
                downloadCSV(`Mantenciones_${view === 'soon' ? 'proximas' : 'vencidas'}_${iso(TODAY)}.csv`, shown, [
                  { label: 'Patente', value: 'plate' },
                  { label: 'Marca', value: 'brand' },
                  { label: 'Modelo', value: 'model' },
                  { label: 'Sucursal', value: 'branch' },
                  { label: 'Km actual', value: 'mileage' },
                  { label: 'Próxima mantención (km)', value: 'nextMaintenanceKm' },
                  { label: 'Km restantes', value: 'kmToMaintenance' },
                ])
              }
            >
              <Download size={14} /> CSV
            </Button>
          </div>
        }
      />
      <DataTable
        data={shown}
        pageSize={15}
        onRowClick={(v) => navigate(`/flota/${v.plate}`)}
        emptyText={view === 'soon' ? 'Ningún vehículo a menos de 1.000 km de su mantención' : 'Ninguna mantención vencida'}
        minWidth={720}
        columns={[
          { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: v } }) => <Vehicle plate={v.plate} sub={`${v.brand} ${v.model}`} /> },
          { accessorKey: 'branch', header: 'Sucursal' },
          { accessorKey: 'statusLabel', header: 'Estado', cell: (c) => <span className="text-xs text-muted">{c.getValue()}</span> },
          { accessorKey: 'mileage', header: 'Km actual', cell: (c) => km(c.getValue()), meta: { align: 'right' } },
          { accessorKey: 'nextMaintenanceKm', header: 'Mantención a los', cell: (c) => km(c.getValue()), meta: { align: 'right' } },
          {
            accessorKey: 'kmToMaintenance',
            header: 'Faltan',
            cell: (c) => {
              const left = c.getValue()
              const color = left < 0 ? '#ef4444' : left <= 500 ? '#f59e0b' : '#22c55e'
              return <span className="tabular font-semibold" style={{ color }}>{left < 0 ? `Vencida ${num(-left)} km` : `${num(left)} km`}</span>
            },
            meta: { align: 'right' },
          },
        ]}
      />
    </Card>
  )
}

// ------------------------------------------------------- gasto por vehículo
function CostTab({ rows, period }) {
  const navigate = useNavigate()
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const shown = onlyFlagged ? rows.filter((r) => r.advice) : rows
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Vehículos que más gastan"
        subtitle={`${period}. Gasto = mantención, reparaciones y siniestros; la preparación o equipamiento para clientes y faenas se muestra aparte y no cuenta. "Evaluar venta": gasta 3 veces o más que el promedio de su categoría y tiene 4 años o más, o 150.000 km o más. "Revisar": gasta 3 veces o más que el promedio (vehículo nuevo) o tiene 8 o más OT correctivas.`}
        icon={TrendingUp}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={onlyFlagged} onChange={setOnlyFlagged} options={[{ value: false, label: 'Todos' }, { value: true, label: `Con alerta (${rows.filter((r) => r.advice).length})` }]} />
            <Button
              size="sm"
              disabled={!shown.length}
              onClick={() =>
                downloadCSV(`Gasto_por_vehiculo_${iso(TODAY)}.csv`, shown, [
                  { label: 'Patente', value: 'plate' },
                  { label: 'Vehículo', value: 'vehicle' },
                  { label: 'Año', value: 'year' },
                  { label: 'Categoría', value: 'category' },
                  { label: 'Sucursal', value: 'branch' },
                  { label: 'Km', value: 'mileage' },
                  { label: 'OT', value: 'orders' },
                  { label: 'Preventivo', value: 'preventive' },
                  { label: 'Correctivo', value: 'corrective' },
                  { label: 'Siniestros / DYP', value: 'accident' },
                  { label: 'Gasto (sin preparación)', value: 'spend' },
                  { label: 'Preparación / equipamiento', value: 'preparation' },
                  { label: 'Total', value: 'total' },
                  { label: 'Veces el promedio de su categoría', value: (r) => r.ratio.toFixed(1) },
                  { label: 'Sugerencia', value: (r) => ADVICE[r.advice]?.label ?? '' },
                ])
              }
            >
              <Download size={14} /> CSV
            </Button>
          </div>
        }
      />
      <DataTable
        data={shown}
        pageSize={15}
        onRowClick={(r) => navigate(`/flota/${r.plate}`)}
        emptyText="Sin gasto en el período"
        minWidth={980}
        columns={[
          { id: 'rank', header: '#', enableSorting: false, cell: ({ row }) => <span className="tabular text-muted">{row.index + 1}</span> },
          { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: r } }) => <Vehicle plate={r.plate} sub={`${r.vehicle}${r.year ? ` · ${r.year}` : ''}`} /> },
          { accessorKey: 'branch', header: 'Sucursal' },
          { accessorKey: 'orders', header: 'OT', cell: (c) => num(c.getValue()), meta: { align: 'right' } },
          { accessorKey: 'corrective', header: 'Correctivo', cell: (c) => clp(c.getValue()), meta: { align: 'right' } },
          { accessorKey: 'accident', header: 'Siniestros / DYP', cell: (c) => (c.getValue() ? clp(c.getValue()) : '—'), meta: { align: 'right' } },
          { accessorKey: 'spend', header: 'Gasto', cell: (c) => <span className="font-semibold">{clp(c.getValue())}</span>, meta: { align: 'right' } },
          { accessorKey: 'preparation', header: 'Preparación', cell: (c) => (c.getValue() ? <span className="text-muted">{clp(c.getValue())}</span> : '—'), meta: { align: 'right' } },
          { accessorKey: 'ratio', header: 'vs. promedio', cell: (c) => <span className="tabular">{c.getValue().toFixed(1).replace('.', ',')}×</span>, meta: { align: 'right' } },
          {
            accessorKey: 'advice',
            header: 'Sugerencia',
            cell: (c) => (ADVICE[c.getValue()] ? <Badge color={ADVICE[c.getValue()].color}>{ADVICE[c.getValue()].label}</Badge> : <span className="text-muted">—</span>),
          },
        ]}
      />
    </Card>
  )
}

// --------------------------------------------------------------- sucursales
const COMPARE = [
  { key: 'vehicles', label: 'Vehículos', fmt: num },
  { key: 'availability', label: 'Disponibilidad', fmt: (v) => pct(v), better: 'high' },
  { key: 'workshop', label: 'En taller', fmt: num, better: 'low' },
  { key: 'avgDays', label: 'Días prom. en taller', fmt: (v) => v.toFixed(1).replace('.', ','), better: 'low' },
  { key: 'stalled', label: 'OT > 15 días', fmt: num, better: 'low' },
  { key: 'orders', label: 'OT del período', fmt: num },
  { key: 'total', label: 'Gasto del período', fmt: clp },
  { key: 'perVehicle', label: 'Gasto por vehículo', fmt: clp, better: 'low' },
]

function BranchTab({ rows, period, selected }) {
  const [sort, setSort] = useState('perVehicle')
  const extremes = useMemo(() => {
    const out = {}
    COMPARE.filter((c) => c.better).forEach((c) => {
      // solo sucursales con flota suficiente para que la comparación sea justa
      const vals = rows.filter((r) => r.vehicles >= 10 && r[c.key] != null).map((r) => r[c.key])
      if (vals.length < 2) return
      const best = c.better === 'high' ? Math.max(...vals) : Math.min(...vals)
      const worst = c.better === 'high' ? Math.min(...vals) : Math.max(...vals)
      if (best !== worst) out[c.key] = { best, worst }
    })
    return out
  }, [rows])
  // las sucursales chicas (menos de 10 vehículos) van al final: sus promedios engañan
  const sorted = [...rows].sort((a, b) => (b.vehicles >= 10) - (a.vehicles >= 10) || (b[sort] ?? -1) - (a[sort] ?? -1))
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Comparación entre sucursales"
        subtitle={`${period}. Verde = mejor y rojo = peor de cada columna (entre sucursales con 10 o más vehículos). Cada vehículo cuenta en la sucursal de su última OT.`}
        icon={Building2}
        action={
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={COMPARE.map((c) => ({ value: c.key, label: `Ordenar: ${c.label}` }))}
            className="w-56"
            aria-label="Ordenar por"
          />
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-y border-line text-[11px] tracking-wide text-muted uppercase">
              <th className="px-5 py-2.5 text-left font-medium">Sucursal</th>
              {COMPARE.map((c) => (
                <th key={c.key} className={cx('px-3 py-2.5 text-right font-medium', sort === c.key && 'text-brand-text')}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.branchId} className={cx('border-b border-line last:border-0', r.branchId === selected && 'bg-brand/8')}>
                <td className="px-5 py-2.5 font-medium">{r.branch}</td>
                {COMPARE.map((c) => {
                  const v = r[c.key]
                  const e = r.vehicles >= 10 ? extremes[c.key] : null
                  const color = e && v === e.worst ? '#ef4444' : e && v === e.best ? '#22c55e' : undefined
                  return (
                    <td key={c.key} className="tabular px-3 py-2.5 text-right" style={{ color, fontWeight: color ? 600 : undefined }}>
                      {v == null ? '—' : c.fmt(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function Alerts() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('vista')) ? params.get('vista') : 'ot'
  const setTab = (v) => setParams((p) => (p.set('vista', v), p), { replace: true })
  const { branchId } = useApp()
  const [minDays, setMinDays] = useState(15)

  const months = useMemo(() => getAvailableMonths(), [])
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))], [months])
  const [period, setPeriod] = useState(() => years[0] ?? String(TODAY.getFullYear()))
  const range = period.length === 4 ? { from: `${period}-01-01`, to: `${period}-12-31` } : { from: `${period}-01`, to: `${period}-31` }
  const periodLabel = period.length === 4 ? `OT recibidas en ${period}` : `OT recibidas en ${monthLong(period)}`

  const stalled = useData((b) => getStalledOrders(b, minDays), [minDays])
  const stalled30 = useData((b) => getStalledOrders(b, 30))
  const maintenance = useData((b) => getMaintenanceDue(b, 1000))
  const ranking = useData((b) => getCostRanking(b, range), [period])
  const branches = useData(() => getBranchComparison(range), [period])

  const flagged = ranking.filter((r) => r.advice === 'sell').length
  const late = maintenance.filter((v) => v.kmToMaintenance < 0).length

  return (
    <>
      <PageHeader
        title="Alertas y rankings"
        description="Lo que requiere atención: vehículos detenidos, mantenciones por hacer, los que más gastan y cómo va cada sucursal"
        actions={
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[...years.map((y) => ({ value: y, label: `Año ${y}` })), ...months.map((m) => ({ value: m, label: monthLong(m) }))]}
            className="w-48"
            aria-label="Período del gasto"
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="OT con más de 30 días" value={stalled30.length} hint="Unidades detenidas en taller" icon={AlarmClock} color="#ef4444" onClick={() => (setTab('ot'), setMinDays(30))} active={tab === 'ot' && minDays === 30} />
        <KpiCard label="Mantenciones por hacer" value={maintenance.length} hint={`${late} vencidas · ${maintenance.length - late} a menos de 1.000 km`} icon={Wrench} color="#f59e0b" onClick={() => setTab('mant')} active={tab === 'mant'} delay={0.04} />
        <KpiCard label="Evaluar venta" value={flagged} hint={`Vehículos con gasto muy alto · ${period.length === 4 ? period : monthLong(period)}`} icon={TrendingUp} color="#f472b6" onClick={() => setTab('gasto')} active={tab === 'gasto'} delay={0.08} />
        <KpiCard label="Sucursales comparadas" value={branches.length} hint="Disponibilidad, días en taller y gasto" icon={Building2} onClick={() => setTab('suc')} active={tab === 'suc'} delay={0.12} />
      </div>

      <div className="mb-4 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === 'ot' && <StalledTab rows={stalled} minDays={minDays} setMinDays={setMinDays} />}
      {tab === 'mant' && <MaintenanceTab rows={maintenance} />}
      {tab === 'gasto' && <CostTab rows={ranking} period={periodLabel} />}
      {tab === 'suc' && <BranchTab rows={branches} period={periodLabel} selected={branchId} />}
    </>
  )
}
