import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlarmClock, Building2, Download, Repeat, Timer, TrendingUp, Wrench } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { useApp } from '@/context/AppContext'
import { getAvailableMonths, getBranchComparison, getCostRanking, getMaintenanceForecast, getRepeatRepairs, getStalledOrders, getWorkshopDays, TODAY, iso } from '@/data/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader, Segmented } from '@/components/ui/misc'
import { clp, cx, date, km, monthLong, num, pct } from '@/lib/format'
import { exportCostRanking, exportMaintenance, exportOpenOrders, exportRepeatRepairs, exportWorkshopDays } from '@/lib/excel/exports'

const TABS = [
  { value: 'ot', label: 'OT estancadas', icon: AlarmClock },
  { value: 'mant', label: 'Mantenciones', icon: Wrench },
  { value: 'gasto', label: 'Gasto por vehículo', icon: TrendingUp },
  { value: 'dias', label: 'Días en taller', icon: Timer },
  { value: 'retrabajo', label: 'Re-trabajos', icon: Repeat },
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
                exportOpenOrders(rows, { title: `OT estancadas · más de ${minDays} días`, filters: 'responsable: el registrado o el sugerido de la sucursal', filename: `WEST_IA_ot_estancadas_${minDays}d_${iso(TODAY)}.xlsx` })
              }
            >
              <Download size={14} /> Excel
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
          { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: o } }) => <Vehicle plate={o.plate} sub={o.vehicle || o.client} /> },
          { accessorKey: 'daysOpen', header: 'Días', cell: (c) => <DaysBadge days={c.getValue()} /> },
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
function DueCell({ v }) {
  if (!v.estimated) {
    const left = v.kmToMaintenance
    return (
      <div>
        <span className="tabular font-semibold" style={{ color: left < 0 ? '#ef4444' : '#f59e0b' }}>{left < 0 ? `Vencida ${num(-left)} km` : `Faltan ${num(left)} km`}</span>
        <div className="text-[11px] text-muted">sin ritmo de uso</div>
      </div>
    )
  }
  const days = v.estDaysToMaintenance
  const color = days < 0 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#22c55e'
  return (
    <div>
      <span className="tabular font-semibold" style={{ color }}>{days < 0 ? `Vencida hace ${num(-days)} días` : days === 0 ? 'Hoy' : `En ${num(days)} días`}</span>
      <div className="text-[11px] text-muted">{date(v.estDueDate)}</div>
    </div>
  )
}

function MaintenanceTab({ rows }) {
  const navigate = useNavigate()
  const [view, setView] = useState('soon')
  const shown = rows.filter((v) => v.due === view)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Mantenciones de los próximos 30 días"
        subtitle="Próxima mantención = última preventiva + 10.000 km. Los km de hoy se estiman con el ritmo de uso de cada vehículo (km recorridos entre sus OT). Si tiene una sola OT o todas en el mismo mes, no hay ritmo y se usa el km registrado: aparece si le faltan 1.000 km o menos."
        icon={Wrench}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'soon', label: `Próximos 30 días (${rows.filter((v) => v.due === 'soon').length})` },
                { value: 'late', label: `Vencidas (${rows.filter((v) => v.due === 'late').length})` },
              ]}
            />
            <Button
              size="sm"
              disabled={!shown.length}
              onClick={() =>
                exportMaintenance(shown, { view })
              }
            >
              <Download size={14} /> Excel
            </Button>
          </div>
        }
      />
      <DataTable
        data={shown}
        pageSize={15}
        onRowClick={(v) => navigate(`/flota/${v.plate}`)}
        emptyText={view === 'soon' ? 'Ninguna mantención en los próximos 30 días' : 'Ninguna mantención vencida'}
        minWidth={860}
        columns={[
          { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: v } }) => <Vehicle plate={v.plate} sub={`${v.brand} ${v.model}`} /> },
          { accessorKey: 'branch', header: 'Sucursal' },
          {
            id: 'km',
            accessorFn: (v) => v.estMileage ?? v.mileage,
            header: 'Km hoy',
            cell: ({ row: { original: v } }) => (
              <div>
                <div className="tabular">{km(v.estMileage ?? v.mileage)}</div>
                <div className="text-[11px] text-muted">{v.estimated ? `estimado · registrado ${km(v.mileage)}` : 'registrado en OT'}</div>
              </div>
            ),
            meta: { align: 'right' },
          },
          { id: 'rate', accessorFn: (v) => v.kmPerDay ?? -1, header: 'Uso', cell: ({ row: { original: v } }) => (v.kmPerDay ? <span className="tabular text-muted">{num(v.kmPerDay)} km/día</span> : <span className="text-muted">—</span>), meta: { align: 'right' } },
          { accessorKey: 'nextMaintenanceKm', header: 'Mantención a los', cell: (c) => km(c.getValue()), meta: { align: 'right' } },
          { id: 'due', accessorFn: (v) => v.estDaysToMaintenance ?? v.kmToMaintenance / 100, header: 'Cuándo', cell: ({ row: { original: v } }) => <DueCell v={v} />, meta: { align: 'right' } },
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
                exportCostRanking(shown, { period })
              }
            >
              <Download size={14} /> Excel
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

// ----------------------------------------------------------- días en taller
function WorkshopDaysTab({ data, period }) {
  const navigate = useNavigate()
  const { rows, periodDays } = data
  const [onlyNow, setOnlyNow] = useState(false)
  const shown = onlyNow ? rows.filter((r) => r.inWorkshop) : rows
  const total = rows.reduce((s, r) => s + r.days, 0)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Días detenido en taller por vehículo"
        subtitle={`${period} (${num(periodDays)} días). Se unen los períodos de todas sus OT (ingreso → cierre, o hoy si sigue abierta), sin contar dos veces los días con más de una OT. No incluye OT de preparación de unidades ni OT terminadas sin fecha de cierre. Si durante una OT el vehículo vuelve a ingresar con más km, se considera que esa estadía terminó ahí ("ajustado"). Total: ${num(total)} días-vehículo.`}
        icon={Timer}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={onlyNow} onChange={setOnlyNow} options={[{ value: false, label: `Todos (${rows.length})` }, { value: true, label: `En taller hoy (${rows.filter((r) => r.inWorkshop).length})` }]} />
            <Button size="sm" disabled={!shown.length} onClick={() => exportWorkshopDays(shown, { period, periodDays })}>
              <Download size={14} /> Excel
            </Button>
          </div>
        }
      />
      <DataTable
        data={shown}
        pageSize={15}
        onRowClick={(r) => navigate(`/flota/${r.plate}`)}
        emptyText="Sin vehículos en taller en el período"
        minWidth={980}
        columns={[
          { id: 'rank', header: '#', enableSorting: false, cell: ({ row }) => <span className="tabular text-muted">{row.index + 1}</span> },
          { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: r } }) => <Vehicle plate={r.plate} sub={r.vehicle} /> },
          { accessorKey: 'branch', header: 'Sucursal' },
          { accessorKey: 'client', header: 'Cliente', cell: (c) => <span className="line-clamp-1 max-w-48 text-xs text-muted">{c.getValue()}</span> },
          { accessorKey: 'days', header: 'Días detenido', cell: (c) => <DaysBadge days={c.getValue()} />, meta: { align: 'right' } },
          { accessorKey: 'share', header: '% del período', cell: (c) => <span className="tabular">{pct(c.getValue(), 1)}</span>, meta: { align: 'right' } },
          { accessorKey: 'stays', header: 'Ingresos', cell: (c) => num(c.getValue()), meta: { align: 'right' } },
          { accessorKey: 'orders', header: 'OT', cell: (c) => num(c.getValue()), meta: { align: 'right' } },
          { accessorKey: 'longest', header: 'Estadía más larga', cell: (c) => `${num(c.getValue())} d`, meta: { align: 'right' } },
          {
            accessorKey: 'inWorkshop',
            header: 'Hoy',
            cell: ({ row: { original: r } }) => (
              <div className="flex flex-col items-start gap-1">
                {r.inWorkshop ? <Badge color="#f97316">En taller · {r.openDays} d</Badge> : <span className="text-xs text-muted">Operativo</span>}
                {r.trimmed > 0 && (
                  <span className="text-[11px] text-muted" title="Una OT siguió abierta en SAP mientras el vehículo circulaba (volvió a ingresar con más km); se recortó">
                    ajustado
                  </span>
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  )
}

// ------------------------------------------------- re-trabajos y garantías
function ReworkTab({ data, period }) {
  const navigate = useNavigate()
  const [view, setView] = useState('parts')
  const warranty = data.pairs.filter((p) => p.kind === 'warranty')
  const wear = data.pairs.filter((p) => p.kind === 'wear')
  const parts = data.parts.filter((r) => r.kind === 'warranty')
  const pairColumns = [
    { accessorKey: 'plate', header: 'Vehículo', cell: ({ row: { original: p } }) => <Vehicle plate={p.plate} sub={p.vehicle} /> },
    { accessorKey: 'part', header: 'Repuesto', cell: (c) => <span className="line-clamp-2 max-w-72 text-xs">{c.getValue()}</span> },
    { accessorKey: 'days', header: 'Días entre cambios', cell: (c) => <span className="tabular font-semibold">{c.getValue()} d</span>, meta: { align: 'right' } },
    { accessorKey: 'km', header: 'Km entre cambios', cell: (c) => (c.getValue() ? km(c.getValue()) : '—'), meta: { align: 'right' } },
    { id: 'orders', accessorFn: (p) => p.secondDate, header: 'OT', cell: ({ row: { original: p } }) => <span className="text-xs text-muted">{p.firstOrder} → {p.secondOrder}<br />{date(p.firstDate)} → {date(p.secondDate)}</span> },
    { accessorKey: 'branch', header: 'Sucursal' },
    { accessorKey: 'cost', header: 'Costo 2º cambio', cell: (c) => <span className="font-semibold">{clp(c.getValue())}</span>, meta: { align: 'right' } },
  ]
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Re-trabajos y posibles garantías"
        subtitle={`${period}. Posible garantía: un componente (no de desgaste) cambiado otra vez en el mismo vehículo dentro de 90 días: repuesto defectuoso, trabajo mal hecho o causa de fondo sin resolver. Desgaste acelerado: pastillas, balatas, pernos y similares repetidos en menos de 30 días. Sin OT de preparación ni mano de obra.`}
        icon={Repeat}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'parts', label: `Componentes (${parts.length})` },
                { value: 'warranty', label: `Posibles garantías (${warranty.length})` },
                { value: 'wear', label: `Desgaste acelerado (${wear.length})` },
              ]}
            />
            <Button size="sm" disabled={!data.pairs.length} onClick={() => exportRepeatRepairs(data, { period })}>
              <Download size={14} /> Excel
            </Button>
          </div>
        }
      />
      {view === 'parts' ? (
        <DataTable
          data={parts}
          pageSize={15}
          emptyText="Sin componentes repetidos en el período"
          minWidth={900}
          columns={[
            { accessorKey: 'part', header: 'Componente', cell: ({ row: { original: r } }) => <Vehicle plate={r.part} sub={r.code} /> },
            { accessorKey: 'repeats', header: 'Veces repetido', cell: (c) => <span className="tabular font-semibold">{c.getValue()}</span>, meta: { align: 'right' } },
            { accessorKey: 'plates', header: 'Vehículos', cell: (c) => num(c.getValue()), meta: { align: 'right' } },
            { accessorKey: 'avgDays', header: 'Días prom. entre cambios', cell: (c) => `${num(c.getValue())} d`, meta: { align: 'right' } },
            { accessorKey: 'cost', header: 'Costo de las repeticiones', cell: (c) => <span className="font-semibold">{clp(c.getValue())}</span>, meta: { align: 'right' } },
            { accessorKey: 'branches', header: 'Sucursales', cell: (c) => <span className="line-clamp-2 max-w-64 text-xs text-muted">{c.getValue()}</span> },
          ]}
        />
      ) : (
        <DataTable
          data={view === 'warranty' ? warranty : wear}
          pageSize={15}
          onRowClick={(p) => navigate(`/flota/${p.plate}`)}
          emptyText="Sin casos en el período"
          minWidth={1000}
          columns={pairColumns}
        />
      )}
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
  const maintenance = useData((b) => getMaintenanceForecast(b, 30))
  const ranking = useData((b) => getCostRanking(b, range), [period])
  const branches = useData(() => getBranchComparison(range), [period])
  const workshopDays = useData((b) => getWorkshopDays(b, range), [period])
  const rework = useData((b) => getRepeatRepairs(b, range), [period])

  const flagged = ranking.filter((r) => r.advice === 'sell').length
  const late = maintenance.filter((v) => v.due === 'late').length

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
        <KpiCard label="Mantenciones por hacer" value={maintenance.length} hint={`${late} vencidas · ${maintenance.length - late} en los próximos 30 días`} icon={Wrench} color="#f59e0b" onClick={() => setTab('mant')} active={tab === 'mant'} delay={0.04} />
        <KpiCard label="Evaluar venta" value={flagged} hint={`Vehículos con gasto muy alto · ${period.length === 4 ? period : monthLong(period)}`} icon={TrendingUp} color="#f472b6" onClick={() => setTab('gasto')} active={tab === 'gasto'} delay={0.08} />
        <KpiCard label="Sucursales comparadas" value={branches.length} hint="Disponibilidad, días en taller y gasto" icon={Building2} onClick={() => setTab('suc')} active={tab === 'suc'} delay={0.12} />
      </div>

      <div className="mb-4 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === 'ot' && <StalledTab rows={stalled} minDays={minDays} setMinDays={setMinDays} />}
      {tab === 'mant' && <MaintenanceTab rows={maintenance} />}
      {tab === 'gasto' && <CostTab rows={ranking} period={periodLabel} />}
      {tab === 'retrabajo' && <ReworkTab data={rework} period={period.length === 4 ? `Año ${period}` : monthLong(period)} />}
      {tab === 'dias' && <WorkshopDaysTab data={workshopDays} period={period.length === 4 ? `Año ${period}` : monthLong(period)} />}
      {tab === 'suc' && <BranchTab rows={branches} period={periodLabel} selected={branchId} />}
    </>
  )
}
