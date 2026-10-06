import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, CarFront, ChevronDown, FileText, Gauge, Hammer, History, Receipt, ShieldAlert, Wrench } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '@/hooks/useData'
import { getOpenWorkOrders, getVehicle, ALL_BRANCHES, isRealData } from '@/data/api'
import { INTERVENTION_COLOR, VEHICLE_STATUS, expiryColor } from '@/data/catalog'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Segmented, Stat } from '@/components/ui/misc'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps } from '@/lib/chart'
import { ManagementDrawer } from '@/components/ot/ManagementDrawer'
import { clp, clpShort, cx, date, km, num } from '@/lib/format'
import pickupPhoto from '@/assets/img/camioneta-4x4.jpg'

function OTRow({ o }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="relative pl-7">
      <span className="absolute top-2 left-0 size-3 rounded-full ring-4 ring-[var(--bg)]" style={{ background: INTERVENTION_COLOR[o.interventionType] }} />
      <button type="button" onClick={() => setOpen((x) => !x)} className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-hover" aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="tabular text-xs text-muted">{date(o.receivedDate)}</span>
            <span className="min-w-0 font-medium">{o.reason}</span>
            <Badge color={INTERVENTION_COLOR[o.interventionType]}>{o.interventionType}</Badge>
            {o.active && <Badge color="#f59e0b">Abierta · {o.daysOpen} d</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="tabular text-sm font-medium">{clp(o.totalCost)}</span>
            <ChevronDown size={16} className={cx('text-muted transition-transform', open && 'rotate-180')} />
          </div>
        </div>
        <div className="mt-0.5 text-xs text-muted">
          OT {o.workOrder} · {o.branch}{o.mileage ? ` · ${km(o.mileage)}` : ""} · {o.sapStatus}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <table className="mx-3 mb-3 w-[calc(100%-24px)] text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-1.5 text-left font-medium">Código</th>
                  <th className="py-1.5 text-left font-medium">Descripción</th>
                  <th className="py-1.5 text-right font-medium">Cant.</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-1.5 text-muted">{l.code}</td>
                    <td className="py-1.5">{l.description}</td>
                    <td className="tabular py-1.5 text-right">{l.qty}</td>
                    <td className="tabular py-1.5 text-right">{clp(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

export default function VehicleDetail() {
  const { plate } = useParams()
  const v = useData(() => getVehicle(plate), [plate])
  const openOT = useData(() => getOpenWorkOrders(ALL_BRANCHES).filter((o) => o.plate === plate), [plate])
  const [tab, setTab] = useState('history')
  const [managing, setManaging] = useState(null)

  const costByType = useMemo(() => {
    if (!v) return []
    const map = {}
    v.history.forEach((o) => (map[o.interventionType] = (map[o.interventionType] || 0) + o.totalCost))
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [v])

  if (!v) {
    return (
      <Card className="mx-auto mt-16 max-w-md p-10 text-center">
        <h1 className="text-lg font-semibold">Patente {plate} no encontrada</h1>
        <Link to="/flota" className="mt-4 inline-block text-sm text-brand-text">Volver a la flota</Link>
      </Card>
    )
  }

  const preventive = v.history.filter((o) => o.interventionType.startsWith('Preventiva'))
  const damages = v.history.filter((o) => ['DYP', 'Compañía de seguros'].includes(o.interventionType))
  const lists = { history: v.history, maintenance: preventive, damages }
  // la foto genérica (un Jeep) confunde con vehículos reales: con datos SAP se usa el ícono
  const showPhoto = !isRealData && (v.category.startsWith('pickup') || v.category === 'suv')
  const hasKm = v.mileage > 0

  return (
    <>
      <Link to="/flota" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-fg">
        <ArrowLeft size={16} /> Flota
      </Link>

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[minmax(0,420px)_1fr]">
          <div className="relative min-h-56 overflow-hidden">
            {showPhoto ? (
              <>
                <img src={pickupPhoto} alt="Imagen referencial del vehículo" className="absolute inset-0 size-full object-cover" />
                <span className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">Imagen referencial</span>
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand/25 via-transparent to-sky-500/20">
                <CarFront size={96} strokeWidth={1} className="text-brand-text/70" />
              </div>
            )}
          </div>
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{v.plate}</h1>
              <Badge color={VEHICLE_STATUS[v.status].color}>{v.statusLabel}</Badge>
              <Badge color="#94a3b8" dot={false}>{v.area}</Badge>
            </div>
            <p className="mt-1 text-lg text-muted">
              {v.brand} {v.model}{v.year ? ` · ${v.year}` : ''}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Stat label="Categoría" value={v.categoryLabel} />
              <Stat label="Sucursal" value={v.branch} />
              <Stat label="Cliente" value={v.client || 'Sin cliente'} />
              {v.transmission && <Stat label="Transmisión" value={v.transmission} />}
              <Stat label="Combustible" value={v.fuel} />
              {v.vin && <Stat label="VIN" value={<span className="text-xs">{v.vin}</span>} />}
            </div>
          </div>
        </div>
      </Card>

      {openOT.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <Wrench size={20} className="text-amber-500" />
            <div>
              <div className="text-sm font-semibold">
                {openOT[0].daysOpen === 0 ? 'Ingresó hoy a taller' : `En taller hace ${openOT[0].daysOpen} ${openOT[0].daysOpen === 1 ? 'día' : 'días'}`} · OT {openOT[0].workOrder}
              </div>
              <div className="text-xs text-muted">
                {openOT[0].reason} · {openOT[0].management.realStatus} · {openOT[0].management.responsible || 'sin responsable'}
              </div>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setManaging(openOT[0])}>Gestionar OT</Button>
        </motion.div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Kilometraje" value={v.mileage} format={(n) => (hasKm ? km(n) : 'Sin registro')} hint={hasKm && isRealData ? 'Último registrado en una OT' : undefined} icon={Gauge} color="#3b82f6" />
        <KpiCard label="OT históricas" value={v.history.length} icon={History} color="#8b5cf6" delay={0.04} />
        <KpiCard label="Costo acumulado" value={v.totalCost} format={clpShort} hint={clp(v.totalCost)} icon={Receipt} color="#ffc400" delay={0.08} />
        <KpiCard label="Costo por km" value={v.costPerKm} format={(n) => (hasKm ? `${n.toFixed(1).replace('.', ',')}` : '—')} hint={hasKm ? undefined : 'Falta kilometraje'} icon={Hammer} color="#f97316" delay={0.12} />
        <KpiCard
          label="Próxima mantención"
          value={Math.abs(v.kmToMaintenance)}
          format={(n) => (!hasKm ? 'Sin registro' : v.kmToMaintenance < 0 ? `-${num(n)} km` : `${num(n)} km`)}
          hint={!hasKm ? 'Falta kilometraje' : v.kmToMaintenance < 0 ? 'Vencida: programar ingreso' : `A los ${km(v.nextMaintenanceKm)}`}
          icon={Wrench}
          color={!hasKm ? '#64748b' : v.kmToMaintenance < 0 ? '#ef4444' : v.kmToMaintenance < 1500 ? '#f59e0b' : '#22c55e'}
          delay={0.16}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" delay={0.1}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 className="text-[15px] font-semibold">Historial</h2>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'history', label: `Órdenes (${v.history.length})` },
                { value: 'maintenance', label: `Mantenciones (${preventive.length})` },
                { value: 'damages', label: `Daños (${damages.length})` },
              ]}
            />
          </div>
          <ul className="relative mt-4 space-y-1 px-5 pb-5 before:absolute before:top-2 before:bottom-6 before:left-[25px] before:w-px before:bg-[var(--line)]">
            {lists[tab].map((o) => (
              <OTRow key={o.workOrder} o={o} />
            ))}
            {!lists[tab].length && <li className="py-10 text-center text-sm text-muted">Sin registros</li>}
          </ul>
        </Card>

        <div className="grid content-start gap-4">
          <Card delay={0.14}>
            <CardHeader title="Documentos" subtitle="Vencimientos del vehículo" icon={FileText} />
            <ul className="space-y-2 px-5 pb-5">
              {v.documents.length === 0 && <li className="rounded-xl bg-[var(--line)] px-3 py-2.5 text-sm text-muted">Sin documentos registrados en el SAP</li>}
              {v.documents.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--line)] px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-xs text-muted">Vence {date(d.expiresAt)}</div>
                  </div>
                  <span className="tabular rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: expiryColor(d.daysLeft), background: `color-mix(in srgb, ${expiryColor(d.daysLeft)} 15%, transparent)` }}>
                    {d.daysLeft < 0 ? `Vencido hace ${-d.daysLeft} d` : `${d.daysLeft} días`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card delay={0.18}>
            <CardHeader title="Costo por tipo de intervención" icon={ShieldAlert} />
            <div className="h-56 px-2 pb-4">
              <ResponsiveContainer>
                <BarChart data={costByType} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" {...axisProps} width={130} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                  <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip formatter={clp} />} />
                  <Bar dataKey="value" name="Costo" radius={[0, 6, 6, 0]}>
                    {costByType.map((c) => (
                      <Cell key={c.name} fill={INTERVENTION_COLOR[c.name]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <ManagementDrawer ot={managing} onClose={() => setManaging(null)} />
    </>
  )
}
