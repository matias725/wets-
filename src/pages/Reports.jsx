import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Download, Gauge, Receipt, TrendingUp } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { BRANCHES, TODAY, addDays, daysBetween, getExpenseRows, getVehicle, getVehicles, iso } from '@/data/api'
import { CATEGORY_BY_ID } from '@/data/catalog'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/misc'
import { clp, date, downloadCSV, pct } from '@/lib/format'

function ReportCard({ icon: Icon, title, description, columns, rows, filename, delay }) {
  // preview: false => la columna va en el CSV pero no en la vista previa angosta
  const shown = columns.filter((c) => c.preview !== false)
  return (
    <Card delay={delay} className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand-text">
            <Icon size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => downloadCSV(filename, rows, columns.map((c) => ({ label: c.label, value: c.csv ?? c.value })))} disabled={!rows.length}>
          <Download size={14} /> CSV
        </Button>
      </div>
      <div className="mt-4 flex-1 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-line text-[10px] tracking-wide text-muted uppercase">
              {shown.map((c) => (
                <th key={c.label} className={`px-5 py-2 font-medium ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 7).map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {shown.map((c) => (
                  <td key={c.label} className={`px-5 py-2 whitespace-nowrap ${c.right ? 'tabular text-right' : ''}`}>
                    {c.format ? c.format(typeof c.value === 'function' ? c.value(r) : r[c.value]) : typeof c.value === 'function' ? c.value(r) : r[c.value]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="py-10 text-center text-sm text-muted">Sin datos en el período</div>}
      </div>
      {rows.length > 7 && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">Vista previa: 7 de {rows.length} filas. El CSV incluye todas.</div>}
    </Card>
  )
}

export default function Reports() {
  const [from, setFrom] = useState(iso(addDays(TODAY, -365)))
  const [to, setTo] = useState(iso(TODAY))
  const expenses = useData((b) => getExpenseRows(b))
  const vehicles = useData((b) => getVehicles(b))
  const inRange = (d) => d >= from && d <= to

  const availability = useMemo(
    () =>
      BRANCHES.map((b) => {
        const list = vehicles.filter((v) => v.branchId === b.id)
        const down = list.filter((v) => ['workshop', 'out'].includes(v.status)).length
        const rented = list.filter((v) => ['rented', 'reserved'].includes(v.status)).length
        return { branch: b.name, total: list.length, rented, down, occupancy: list.length ? rented / list.length : 0, availability: list.length ? (list.length - down) / list.length : 0 }
      }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total),
    [vehicles],
  )

  const spend = useMemo(() => {
    const map = {}
    expenses.filter((e) => inRange(e.date)).forEach((e) => {
      const key = `${e.branch}|${CATEGORY_BY_ID[e.category]?.label ?? 'Sin categoría'}`
      map[key] ??= { branch: e.branch, category: CATEGORY_BY_ID[e.category]?.label ?? 'Sin categoría', ots: 0, corrective: 0, preventive: 0, charge: 0, total: 0 }
      const m = map[key]
      m.ots += 1
      m.corrective += e.corrective
      m.preventive += e.preventive
      m.charge += e.charge
      m.total += e.total
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, from, to])

  const workshopDays = useMemo(() => {
    const map = {}
    vehicles.forEach((v) =>
      getVehicle(v.plate).history.filter((o) => o.closedDate && inRange(o.closedDate)).forEach((o) => {
        map[o.interventionType] ??= { type: o.interventionType, ots: 0, days: 0 }
        map[o.interventionType].ots += 1
        map[o.interventionType].days += daysBetween(o.receivedDate, new Date(o.closedDate + 'T00:00:00'))
      }),
    )
    return Object.values(map).map((r) => ({ ...r, avg: r.ots ? r.days / r.ots : 0 })).sort((a, b) => b.avg - a.avg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, from, to])

  const perVehicle = useMemo(
    () =>
      vehicles
        .map((v) => {
          const d = getVehicle(v.plate)
          const cost = d.history.filter((o) => inRange(o.receivedDate)).reduce((s, o) => s + o.totalCost, 0)
          return { plate: v.plate, model: `${v.brand} ${v.model}`, branch: v.branch, mileage: v.mileage, cost, cpk: v.mileage ? d.totalCost / v.mileage : 0, rate: v.dailyRate }
        })
        .sort((a, b) => b.cpk - a.cpk),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, from, to],
  )

  const suffix = `${from}_a_${to}`
  return (
    <>
      <PageHeader title="Reportes" description="Informes descargables en CSV (se abren directamente en Excel)" />
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Desde" id="r-from" className="w-44">
            <Input id="r-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta" id="r-to" className="w-44">
            <Input id="r-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2 pb-0.5">
            {[[30, '30 días'], [90, '90 días'], [365, '12 meses']].map(([n, label]) => (
              <motion.button
                key={n}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => {
                  setFrom(iso(addDays(TODAY, -n)))
                  setTo(iso(TODAY))
                }}
                className="glass h-10 rounded-xl px-3 text-xs text-muted transition hover:text-fg"
              >
                {label}
              </motion.button>
            ))}
          </div>
          <p className="ml-auto pb-2 text-xs text-muted">Período: {date(from)} al {date(to)}</p>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard
          icon={Gauge}
          title="Ocupación y disponibilidad por sucursal"
          description="Situación actual de la flota"
          filename={`west-ocupacion-${iso(TODAY)}.csv`}
          rows={availability}
          columns={[
            { label: 'Sucursal', value: 'branch' },
            { label: 'Vehículos', value: 'total', right: true },
            { label: 'Arrendados', value: 'rented', right: true, preview: false },
            { label: 'En taller', value: 'down', right: true },
            { label: 'Ocupación', value: 'occupancy', right: true, format: (v) => pct(v), csv: (r) => pct(r.occupancy) },
            { label: 'Disponibilidad', value: 'availability', right: true, format: (v) => pct(v), csv: (r) => pct(r.availability) },
          ]}
        />
        <ReportCard
          icon={Receipt}
          title="Gasto por sucursal y categoría"
          description="OT cerradas en el período"
          filename={`west-gasto-sucursal-categoria-${suffix}.csv`}
          rows={spend}
          delay={0.04}
          columns={[
            { label: 'Sucursal', value: 'branch' },
            { label: 'Categoría', value: 'category' },
            { label: 'OT', value: 'ots', right: true, preview: false },
            { label: 'Correctivo', value: 'corrective', right: true, format: clp, preview: false },
            { label: 'Total', value: 'total', right: true, format: clp },
          ]}
        />
        <ReportCard
          icon={Clock}
          title="Días promedio en taller"
          description="Por tipo de intervención · OT cerradas en el período"
          filename={`west-dias-taller-${suffix}.csv`}
          rows={workshopDays}
          delay={0.08}
          columns={[
            { label: 'Tipo de intervención', value: 'type' },
            { label: 'OT', value: 'ots', right: true },
            { label: 'Días promedio', value: 'avg', right: true, format: (v) => v.toFixed(1).replace('.', ','), csv: (r) => r.avg.toFixed(1).replace('.', ',') },
          ]}
        />
        <ReportCard
          icon={TrendingUp}
          title="Costo de mantención por vehículo"
          description="Costo en el período y costo histórico por kilómetro"
          filename={`west-costo-vehiculo-${suffix}.csv`}
          rows={perVehicle}
          delay={0.12}
          columns={[
            { label: 'Patente', value: 'plate' },
            { label: 'Modelo', value: 'model', preview: false },
            { label: 'Sucursal', value: 'branch' },
            { label: 'Costo período', value: 'cost', right: true, format: clp },
            { label: '$/km histórico', value: 'cpk', right: true, format: (v) => `$${v.toFixed(1).replace('.', ',')}`, csv: (r) => r.cpk.toFixed(1).replace('.', ',') },
          ]}
        />
      </div>
    </>
  )
}
