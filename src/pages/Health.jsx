import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Cog, Repeat, TrendingUp } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { TODAY, addDays, getOpenWorkOrders, getVehicle, getVehicles, iso, isRealData } from '@/data/api'
import { VEHICLE_STATUS } from '@/data/catalog'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader, ProgressBar } from '@/components/ui/misc'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps } from '@/lib/chart'
import { clp, clpShort, km, num } from '@/lib/format'

export default function Health() {
  const navigate = useNavigate()
  const vehicles = useData((b) => getVehicles(b))
  const open = useData((b) => getOpenWorkOrders(b))
  const details = useMemo(() => vehicles.map((v) => getVehicle(v.plate)), [vehicles])

  const health = useMemo(() => {
    const total = vehicles.length || 1
    const down = vehicles.filter((v) => ['workshop', 'out'].includes(v.status)).length
    const availability = (total - down) / total
    const label = availability >= 0.9 ? 'Saludable' : availability >= 0.8 ? 'Atención' : 'Crítico'
    const color = availability >= 0.9 ? '#22c55e' : availability >= 0.8 ? '#f59e0b' : '#ef4444'
    const avgDays = open.length ? open.reduce((s, o) => s + o.daysOpen, 0) / open.length : 0
    return { availability, label, color, avgDays, down }
  }, [vehicles, open])

  const costPerKm = useMemo(
    () =>
      details
        .filter((v) => v.mileage >= 5000)
        .map((v) => ({ plate: v.plate, model: `${v.brand} ${v.model}`, branch: v.branch, mileage: v.mileage, cost: v.totalCost, cpk: v.costPerKm }))
        .sort((a, b) => b.cpk - a.cpk)
        .slice(0, 10),
    [details],
  )

  const recurrence = useMemo(() => {
    const since = iso(addDays(TODAY, -365))
    return details
      .map((v) => {
        const corrective = v.history.filter((o) => o.receivedDate >= since && ['Correctiva', 'Preventiva + Correctiva'].includes(o.interventionType))
        return { plate: v.plate, model: `${v.brand} ${v.model}`, branch: v.branch, count: corrective.length, cost: corrective.reduce((s, o) => s + o.totalCost, 0), last: corrective[0]?.reason ?? '' }
      })
      .filter((r) => r.count >= 2)
      .sort((a, b) => b.count - a.count || b.cost - a.cost)
      .slice(0, 10)
  }, [details])

  const components = useMemo(() => {
    const map = {}
    details.forEach((v) =>
      v.history.forEach((o) =>
        o.lines
          // sin mano de obra (demo: códigos MO-; SAP: servicios de mano de obra)
          .filter((l) => !l.code.startsWith('MO-') && !/MANO ?OBRA/i.test(`${l.code} ${l.description}`))
          .forEach((l) => {
            map[l.description] ??= { name: l.description, cost: 0, qty: 0 }
            map[l.description].cost += l.total
            map[l.description].qty += l.qty
          }),
      ),
    )
    return Object.values(map).sort((a, b) => b.cost - a.cost).slice(0, 8)
  }, [details])

  // con datos SAP no hay arriendos ni limpieza: solo se listan los estados presentes
  const distribution = Object.entries(VEHICLE_STATUS)
    .map(([id, s]) => ({ id, ...s, count: vehicles.filter((v) => v.status === id).length }))
    .filter((d) => !isRealData || d.count > 0)

  return (
    <>
      <PageHeader title="Salud e Inteligencia" description="Indicadores operacionales y rankings calculados sobre el historial de OT" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Índice de salud" subtitle="Disponibilidad operativa de la flota" icon={Activity} />
          <div className="relative mx-auto h-56 max-w-xs">
            <ResponsiveContainer>
              <RadialBarChart innerRadius="78%" outerRadius="100%" data={[{ value: health.availability * 100 }]} startAngle={220} endAngle={-40}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={12} fill={health.color} background={{ fill: 'var(--line)' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="tabular text-4xl font-semibold">{(health.availability * 100).toFixed(0)}%</div>
                <div className="mt-1 text-sm font-medium" style={{ color: health.color }}>{health.label}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 pb-5 text-center text-xs text-muted">
            <div className="rounded-xl bg-[var(--line)] p-3">
              <div className="tabular text-lg font-semibold text-fg">{health.down}</div>
              unidades fuera de operación
            </div>
            <div className="rounded-xl bg-[var(--line)] p-3">
              <div className="tabular text-lg font-semibold text-fg">{health.avgDays.toFixed(1).replace('.', ',')}</div>
              días promedio en taller
            </div>
          </div>
        </Card>

        <Card delay={0.05}>
          <CardHeader title="Distribución operativa" subtitle={`${vehicles.length} vehículos`} />
          <ul className="space-y-3.5 px-5 pb-5">
            {distribution.map((d) => (
              <li key={d.id}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="size-2 rounded-full" style={{ background: d.color }} />
                    {d.label}
                  </span>
                  <span className="tabular font-medium">
                    {d.count} <span className="text-xs text-muted">· {vehicles.length ? Math.round((d.count / vehicles.length) * 100) : 0}%</span>
                  </span>
                </div>
                <ProgressBar value={vehicles.length ? d.count / vehicles.length : 0} color={d.color} />
              </li>
            ))}
          </ul>
        </Card>

        <Card delay={0.1}>
          <CardHeader title="Componentes con más gasto" subtitle="Repuestos en todo el historial (sin mano de obra)" icon={Cog} />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer>
              <BarChart data={components} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" {...axisProps} tickFormatter={(v) => clpShort(v).replace('$ ', '')} />
                <YAxis type="category" dataKey="name" {...axisProps} width={130} interval={0} tick={{ fill: 'var(--muted)', fontSize: 10 }} tickFormatter={(v) => (v.length > 22 ? v.slice(0, 21) + '…' : v)} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip formatter={clp} />} />
                <Bar dataKey="cost" name="Costo" fill="#ffc400" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card delay={0.12} className="overflow-hidden">
          <CardHeader title="Mayor costo por kilómetro" subtitle="Costo histórico de mantención / kilometraje actual" icon={TrendingUp} />
          <DataTable
            data={costPerKm}
            dense
            pageSize={10}
            onRowClick={(r) => navigate(`/flota/${r.plate}`)}
            minWidth={420}
            columns={[
              {
                accessorKey: 'plate',
                header: 'Patente',
                cell: ({ row: { original: r } }) => (
                  <div>
                    <div className="font-semibold">{r.plate}</div>
                    <div className="text-xs text-muted">{r.model}</div>
                  </div>
                ),
              },
              { accessorKey: 'mileage', header: 'Km', cell: (c) => km(c.getValue()), meta: { align: 'right' } },
              { accessorKey: 'cost', header: 'Costo', cell: (c) => clp(c.getValue()), meta: { align: 'right' } },
              { accessorKey: 'cpk', header: '$/km', cell: (c) => <span className="font-semibold text-brand-text">${c.getValue().toFixed(1).replace('.', ',')}</span>, meta: { align: 'right' } },
            ]}
          />
        </Card>
        <Card delay={0.16} className="overflow-hidden">
          <CardHeader title="Recurrencia de fallas" subtitle="Unidades con 2 o más OT correctivas en los últimos 12 meses" icon={Repeat} />
          <DataTable
            data={recurrence}
            dense
            pageSize={10}
            onRowClick={(r) => navigate(`/flota/${r.plate}`)}
            emptyText="Ninguna unidad con correctivas repetidas en 12 meses"
            minWidth={420}
            columns={[
              {
                accessorKey: 'plate',
                header: 'Patente',
                cell: ({ row: { original: r } }) => (
                  <div className="max-w-56">
                    <div className="font-semibold">{r.plate} <span className="font-normal text-muted">· {r.branch}</span></div>
                    <div className="truncate text-xs text-muted">Último: {r.last}</div>
                  </div>
                ),
              },
              { accessorKey: 'count', header: 'Correctivas', cell: (c) => <span className="font-semibold">{num(c.getValue())}</span>, meta: { align: 'right' } },
              { accessorKey: 'cost', header: 'Costo', cell: (c) => clp(c.getValue()), meta: { align: 'right' } },
            ]}
          />
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted">Los rankings son una prioridad de revisión, no una probabilidad de falla.</p>
    </>
  )
}
