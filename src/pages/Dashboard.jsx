import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, ArrowRight, CarFront, CheckCircle2, Gauge, LogIn, Receipt, Wrench } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useData } from '@/hooks/useData'
import {
  BRANCHES, ALL_BRANCHES, TODAY, getExpenseRows, getOpenWorkOrders, getVehicles, iso, addDays,
} from '@/data/api'
import { CATEGORIES, PRIORITY_COLOR, VEHICLE_STATUS } from '@/data/catalog'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/misc'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps } from '@/lib/chart'
import { BranchMap } from '@/components/charts/BranchMap'
import { clp, clpShort, monthLabel, pct } from '@/lib/format'

// Hora referencial determinista para la agenda del día (datos de demostración).
const slotFor = (key) => {
  const n = [...key].reduce((s, c) => s + c.charCodeAt(0), 0)
  return `${String(8 + (n % 10)).padStart(2, '0')}:${n % 2 ? '30' : '00'}`
}

export default function Dashboard() {
  const { setBranchId, branchId } = useApp()
  const navigate = useNavigate()
  const vehicles = useData((b) => getVehicles(b))
  const allVehicles = useData(() => getVehicles(ALL_BRANCHES))
  const open = useData((b) => getOpenWorkOrders(b))
  const expenses = useData((b) => getExpenseRows(b))

  const kpis = useMemo(() => {
    const total = vehicles.length
    const down = vehicles.filter((v) => v.status === 'workshop' || v.status === 'out').length
    const todayIso = iso(TODAY)
    const since = iso(addDays(TODAY, -30))
    return {
      total,
      availability: total ? (total - down) / total : 0,
      available: vehicles.filter((v) => v.status === 'available').length,
      rented: vehicles.filter((v) => v.status === 'rented').length,
      inToday: open.filter((o) => o.receivedDate === todayIso).length,
      releaseToday: open.filter((o) => o.management.commitmentDate === todayIso).length,
      monthSpend: expenses.filter((e) => e.date > since).reduce((s, e) => s + e.total, 0),
      inWorkshop: new Set(open.map((o) => o.plate)).size,
      critical: open.filter((o) => o.daysOpen > 10).length,
    }
  }, [vehicles, open, expenses])

  const branchRows = useMemo(
    () =>
      BRANCHES.map((branch) => {
        const list = allVehicles.filter((v) => v.branchId === branch.id)
        return {
          branch,
          name: branch.name.replace('APT ', 'APT '),
          total: list.length,
          available: list.filter((v) => v.status === 'available').length,
          rented: list.filter((v) => ['rented', 'reserved'].includes(v.status)).length,
          workshop: list.filter((v) => ['workshop', 'out'].includes(v.status)).length,
          other: list.filter((v) => v.status === 'cleaning').length,
        }
      }),
    [allVehicles],
  )

  const occupancy = useMemo(
    () =>
      branchRows
        .filter((r) => r.total > 0)
        .map((r) => ({ ...r, occupancy: r.rented / r.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
    [branchRows],
  )

  const monthly = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      // 12 meses completos, terminando en el mes anterior
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - 12 + i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    return months.map((m) => {
      const rows = expenses.filter((e) => e.month === m)
      return {
        month: m,
        Correctivo: rows.reduce((s, e) => s + e.corrective, 0),
        Preventivo: rows.reduce((s, e) => s + e.preventive, 0),
        'A cobro': rows.reduce((s, e) => s + e.charge, 0),
      }
    })
  }, [expenses])

  const byCategory = useMemo(
    () =>
      CATEGORIES.map((c) => ({ name: c.label, value: vehicles.filter((v) => v.category === c.id).length, color: c.color })).filter((c) => c.value > 0),
    [vehicles],
  )

  const today = useMemo(() => {
    const todayIso = iso(TODAY)
    const items = [
      ...open.filter((o) => o.receivedDate === todayIso).map((o) => ({ kind: 'Ingreso a taller', icon: LogIn, color: '#f59e0b', o })),
      ...open.filter((o) => o.management.commitmentDate === todayIso).map((o) => ({ kind: 'Liberación comprometida', icon: CheckCircle2, color: '#22c55e', o })),
      ...open
        .filter((o) => o.management.commitmentDate === iso(addDays(TODAY, 1)))
        .map((o) => ({ kind: 'Compromiso mañana', icon: CheckCircle2, color: '#3b82f6', o, tomorrow: true })),
    ]
    return items.map((it) => ({ ...it, time: it.tomorrow ? 'Mañana' : slotFor(it.o.workOrder) })).sort((a, b) => a.time.localeCompare(b.time))
  }, [open])

  const attention = open.slice(0, 6)
  const branchLabel = branchId === ALL_BRANCHES ? 'todas las sucursales' : BRANCHES.find((b) => b.id === branchId)?.name

  return (
    <>
      <PageHeader title="Panel principal" description={`Estado de la flota en ${branchLabel}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Disponibilidad" value={kpis.availability * 100} format={(n) => `${n.toFixed(1).replace('.', ',')}%`} hint={`${kpis.total - kpis.inWorkshop} de ${kpis.total} unidades operativas`} icon={Gauge} color="#22c55e" delay={0} />
        <KpiCard label="Disponibles hoy" value={kpis.available} hint={`${kpis.rented} arrendadas en este momento`} icon={CarFront} color="#3b82f6" delay={0.04} />
        <KpiCard label="Ingresos hoy" value={kpis.inToday} hint="OT recibidas hoy" icon={LogIn} color="#f59e0b" delay={0.08} onClick={() => navigate('/ot')} />
        <KpiCard label="Liberaciones hoy" value={kpis.releaseToday} hint="Compromisos con fecha de hoy" icon={CheckCircle2} color="#06b6d4" delay={0.12} onClick={() => navigate('/ot?vista=tablero')} />
        <KpiCard label="Gasto 30 días" value={kpis.monthSpend} format={clpShort} hint={clp(kpis.monthSpend)} icon={Receipt} color="#ffc400" delay={0.16} onClick={() => navigate('/gastos')} />
        <KpiCard label="En taller" value={kpis.inWorkshop} hint={`${kpis.critical} con más de 10 días`} icon={Wrench} color="#ef4444" delay={0.2} onClick={() => navigate('/ot')} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card delay={0.1}>
            <CardHeader title="Uso de la flota por sucursal" subtitle="Disponibles, arrendadas y en taller · 10 sucursales con más unidades" />
            <div className="h-[340px] px-2 pb-4">
              <ResponsiveContainer>
                <BarChart data={occupancy} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }} barCategoryGap="26%">
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={150} interval={0} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip />} />
                  <Bar dataKey="available" name="Disponibles" stackId="a" fill={VEHICLE_STATUS.available.color} />
                  <Bar dataKey="rented" name="Arrendadas / reservadas" stackId="a" fill={VEHICLE_STATUS.rented.color} />
                  <Bar dataKey="other" name="En limpieza" stackId="a" fill={VEHICLE_STATUS.cleaning.color} />
                  <Bar dataKey="workshop" name="En taller" stackId="a" fill={VEHICLE_STATUS.workshop.color} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card delay={0.15}>
            <CardHeader
              title="Gasto de mantención · últimos 12 meses"
              subtitle="OT cerradas, separadas en correctivo, preventivo y a cobro"
              action={
                <Link to="/gastos" className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline">
                  Ver detalle <ArrowRight size={14} />
                </Link>
              }
            />
            <div className="h-72 px-2 pb-4">
              <ResponsiveContainer>
                <AreaChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    {[['corr', '#3b82f6'], ['prev', '#94a3b8'], ['cobro', '#22c55e']].map(([id, c]) => (
                      <linearGradient key={id} id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={monthLabel} />
                  <YAxis {...axisProps} tickFormatter={(v) => clpShort(v).replace('$ ', '')} width={60} />
                  <Tooltip content={<ChartTooltip formatter={clp} labelFormatter={monthLabel} />} />
                  <Area type="monotone" dataKey="Correctivo" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#g-corr)" />
                  <Area type="monotone" dataKey="Preventivo" stackId="1" stroke="#94a3b8" strokeWidth={2} fill="url(#g-prev)" />
                  <Area type="monotone" dataKey="A cobro" stackId="1" stroke="#22c55e" strokeWidth={2} fill="url(#g-cobro)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card delay={0.12} className="flex flex-col overflow-hidden">
          <CardHeader title="Sucursales" subtitle="Tamaño = vehículos · color = proporción en taller · clic para filtrar" />
          <div className="relative flex-1">
            <BranchMap rows={branchRows} onSelect={(id) => setBranchId(id === branchId ? ALL_BRANCHES : id)} />
            <div className="glass-strong pointer-events-none absolute bottom-3 left-3 z-[400] flex gap-3 rounded-lg px-3 py-2 text-[11px]">
              {[['#22c55e', 'Sin unidades en taller'], ['#f59e0b', 'Con unidades en taller'], ['#ef4444', '≥ 1/3 en taller']].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5 text-muted">
                  <span className="size-2 rounded-full" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card delay={0.18}>
          <CardHeader title="Flota por categoría" subtitle={`${vehicles.length} vehículos`} />
          <div className="flex items-center gap-4 px-5 pb-5">
            <div className="relative size-40 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={3} stroke="none" cornerRadius={4}>
                    {byCategory.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v} unidades`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="tabular text-2xl font-semibold">{vehicles.length}</div>
                  <div className="text-[11px] text-muted">vehículos</div>
                </div>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2 text-sm">
              {byCategory.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                    <span className="text-xs leading-tight text-muted">{c.name}</span>
                  </span>
                  <span className="tabular font-medium">{c.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card delay={0.22}>
          <CardHeader title="Hoy" subtitle="Ingresos a taller y liberaciones comprometidas" />
          <ul className="max-h-72 space-y-1 overflow-y-auto px-3 pb-4">
            {today.length ? (
              today.map(({ kind, icon: Icon, color, o, time }) => (
                <li key={`${kind}-${o.workOrder}`}>
                  <Link to={`/flota/${o.plate}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-hover">
                    <span className="tabular w-14 shrink-0 text-xs font-medium text-muted">{time}</span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {o.plate} · {o.vehicle}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {kind} · {o.client} · {o.branch}
                      </span>
                    </span>
                  </Link>
                </li>
              ))
            ) : (
              <li className="py-10 text-center text-sm text-muted">Sin movimientos programados para hoy</li>
            )}
          </ul>
        </Card>

        <Card delay={0.26} className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            title="Requieren atención"
            subtitle="Unidades con más días en taller"
            icon={AlertTriangle}
            action={
              <Link to="/ot" className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline">
                Ver todas <ArrowRight size={14} />
              </Link>
            }
          />
          <ul className="space-y-1 px-3 pb-4">
            {attention.map((o) => (
              <li key={o.workOrder}>
                <Link to={`/flota/${o.plate}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-hover">
                  <DaysBadge days={o.daysOpen} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {o.plate} <span className="font-normal text-muted">· {o.branch}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">{o.reason}</span>
                  </span>
                  <Badge color={PRIORITY_COLOR[o.management.priority]}>{o.management.priority}</Badge>
                </Link>
              </li>
            ))}
            {!attention.length && <li className="py-10 text-center text-sm text-muted">Sin unidades en taller</li>}
          </ul>
          <div className="mx-5 mb-5 rounded-xl bg-[var(--line)] p-3 text-xs text-muted">
            Disponibilidad general: <b className="text-fg">{pct(kpis.availability, 1)}</b> · {kpis.critical} OT superan los 10 días
          </div>
        </Card>
      </div>
    </>
  )
}
