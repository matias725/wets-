import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Building, CircleDollarSign, Download, HandCoins, ShieldCheck, Truck, Wrench, X } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { TODAY, getExpenseRows, iso, setRecovery } from '@/data/api'
import { BUSINESS_AREAS, EXPENSE_CATEGORIES, INTERVENTION_COLOR, INTERVENTION_TYPES, RECOVERY_STATUS } from '@/data/catalog'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader, SearchInput } from '@/components/ui/misc'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps } from '@/lib/chart'
import { clp, clpShort, date, downloadCSV, monthLabel, pct } from '@/lib/format'
import { toast } from 'sonner'

const RECOVERY_COLOR = { 'Por revisar': '#f59e0b', 'No recuperable': '#64748b', 'A cobro': '#22c55e' }

function RecoverySelect({ row }) {
  return (
    <select
      value={row.recovery}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        setRecovery(row.workOrder, e.target.value)
        toast.success(`OT ${row.workOrder}: ${e.target.value}`)
      }}
      aria-label={`Recuperabilidad OT ${row.workOrder}`}
      className="cursor-pointer rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium outline-none hover:border-[var(--glass-border)] focus:border-brand/60 [&>option]:bg-[var(--glass-strong)] [&>option]:text-fg"
      style={{ color: RECOVERY_COLOR[row.recovery] }}
    >
      {RECOVERY_STATUS.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  )
}

export default function Expenses() {
  const all = useData((b) => getExpenseRows(b))
  const years = useMemo(() => [...new Set(all.map((r) => r.date.slice(0, 4)))].sort().reverse(), [all])
  const [year, setYear] = useState(String(TODAY.getFullYear()))
  const [area, setArea] = useState('all')
  const [type, setType] = useState('all')
  const [recovery, setRecoveryFilter] = useState('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (r) =>
        r.date.startsWith(year) &&
        (area === 'all' || r.area === area) &&
        (type === 'all' || r.interventionType === type) &&
        (recovery === 'all' || r.recovery === recovery) &&
        (!q || [r.plate, r.workOrder, r.client, r.branch, r.reason].some((x) => String(x).toLowerCase().includes(q))),
    )
  }, [all, year, area, type, recovery, query])

  const totals = useMemo(() => {
    const sum = (f) => rows.reduce((s, r) => s + f(r), 0)
    return {
      total: sum((r) => r.total),
      corrective: sum((r) => r.corrective),
      preventive: sum((r) => r.preventive),
      charge: sum((r) => r.charge),
      rac: sum((r) => (r.area === 'RAC' ? r.total : 0)),
      lop: sum((r) => (r.area === 'LOP' ? r.total : 0)),
      pending: rows.filter((r) => r.recovery === 'Por revisar').length,
    }
  }, [rows])

  const monthly = useMemo(
    () =>
      // meses del año elegido, sin los que todavía no llegan
      Array.from({ length: Number(year) === TODAY.getFullYear() ? TODAY.getMonth() + 1 : 12 }, (_, i) => {
        const m = `${year}-${String(i + 1).padStart(2, '0')}`
        const list = rows.filter((r) => r.month === m)
        return {
          month: m,
          Correctivo: list.reduce((s, r) => s + r.corrective, 0),
          Preventivo: list.reduce((s, r) => s + r.preventive, 0),
          'A cobro': list.reduce((s, r) => s + r.charge, 0),
        }
      }),
    [rows, year],
  )

  const byType = useMemo(() => {
    const map = {}
    rows.forEach((r) => (map[r.interventionType] = (map[r.interventionType] || 0) + r.total))
    return Object.entries(map).map(([name, value]) => ({ name, value, color: INTERVENTION_COLOR[name] })).sort((a, b) => b.value - a.value)
  }, [rows])

  const byBranch = useMemo(() => {
    const map = {}
    rows.forEach((r) => (map[r.branch] = (map[r.branch] || 0) + r.total))
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [rows])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'plate',
        header: 'Patente / OT',
        cell: ({ row: { original: r } }) => (
          <div>
            <div className="font-semibold">{r.plate}</div>
            <div className="tabular text-xs text-muted">{r.workOrder}</div>
          </div>
        ),
      },
      { accessorKey: 'date', header: 'Fecha', cell: (c) => <span className="tabular text-muted">{date(c.getValue())}</span> },
      {
        accessorKey: 'branch',
        header: 'Sucursal / cliente',
        cell: ({ row: { original: r } }) => (
          <div className="max-w-52">
            <div className="truncate">{r.branch}</div>
            <div className="truncate text-xs text-muted">{r.client}</div>
          </div>
        ),
      },
      { accessorKey: 'area', header: 'Área', cell: (c) => <Badge color={c.getValue() === 'LOP' ? '#a78bfa' : '#38bdf8'} dot={false}>{c.getValue()}</Badge> },
      { accessorKey: 'interventionType', header: 'Tipo', cell: (c) => <Badge color={INTERVENTION_COLOR[c.getValue()]}>{c.getValue()}</Badge> },
      { accessorKey: 'total', header: 'Monto', cell: (c) => clp(c.getValue()), meta: { align: 'right' } },
      { accessorKey: 'recovery', header: 'Recuperabilidad', cell: ({ row }) => <RecoverySelect row={row.original} />, enableSorting: true },
    ],
    [],
  )

  const active = [area, type, recovery].filter((x) => x !== 'all').length + (query ? 1 : 0)
  const exportCSV = () =>
    downloadCSV(`west-gastos-${year}-${iso(TODAY)}.csv`, rows, [
      { label: 'Fecha', value: (r) => date(r.date) },
      { label: 'Patente', value: 'plate' },
      { label: 'N° OT', value: 'workOrder' },
      { label: 'Sucursal', value: 'branch' },
      { label: 'Cliente', value: 'client' },
      { label: 'Área', value: 'area' },
      { label: 'Tipo intervención', value: 'interventionType' },
      { label: 'Motivo', value: 'reason' },
      { label: 'Correctivo', value: 'corrective' },
      { label: 'Preventivo', value: 'preventive' },
      { label: 'A cobro', value: 'charge' },
      { label: 'Total', value: 'total' },
      { label: 'Recuperabilidad', value: 'recovery' },
    ])

  return (
    <>
      <PageHeader
        title="Control de Gastos"
        description="Análisis económico de mantención y recuperaciones RAC / LOP"
        actions={
          <Button onClick={exportCSV}>
            <Download size={16} /> Exportar CSV
          </Button>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Patente, OT, cliente o motivo…" className="min-w-56 flex-1" />
          <Select value={year} onChange={(e) => setYear(e.target.value)} options={years} className="w-28" aria-label="Año" />
          <Select value={area} onChange={(e) => setArea(e.target.value)} options={[{ value: 'all', label: 'RAC y LOP' }, ...BUSINESS_AREAS]} className="w-36" aria-label="Área de negocio" />
          <Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'all', label: 'Todos los tipos' }, ...INTERVENTION_TYPES.map((t) => t.id)]} className="w-52" aria-label="Tipo" />
          <Select value={recovery} onChange={(e) => setRecoveryFilter(e.target.value)} options={[{ value: 'all', label: 'Recuperabilidad' }, ...RECOVERY_STATUS]} className="w-44" aria-label="Recuperabilidad" />
          {active > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setArea('all')
                setType('all')
                setRecoveryFilter('all')
                setQuery('')
              }}
            >
              <X size={14} /> Limpiar ({active})
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Gasto total" value={totals.total} format={clpShort} hint={`${rows.length} OT · ${year}`} icon={CircleDollarSign} color="#ffc400" />
        <KpiCard label="Correctivo" value={totals.corrective} format={clpShort} hint={totals.total ? `${pct(totals.corrective / totals.total)} del gasto` : '—'} icon={Wrench} color="#3b82f6" delay={0.04} />
        <KpiCard label="Preventivo" value={totals.preventive} format={clpShort} hint={totals.total ? `${pct(totals.preventive / totals.total)} del gasto` : '—'} icon={ShieldCheck} color="#94a3b8" delay={0.08} />
        <KpiCard label="A cobro" value={totals.charge} format={clpShort} hint={`${totals.pending} OT por revisar`} icon={HandCoins} color="#22c55e" delay={0.12} onClick={() => setRecoveryFilter(recovery === 'Por revisar' ? 'all' : 'Por revisar')} active={recovery === 'Por revisar'} />
        <KpiCard label="RAC" value={totals.rac} format={clpShort} hint="Arriendo diario" icon={Truck} color="#38bdf8" delay={0.16} onClick={() => setArea(area === 'RAC' ? 'all' : 'RAC')} active={area === 'RAC'} />
        <KpiCard label="LOP" value={totals.lop} format={clpShort} hint="Leasing operativo" icon={Building} color="#a78bfa" delay={0.2} onClick={() => setArea(area === 'LOP' ? 'all' : 'LOP')} active={area === 'LOP'} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" delay={0.1}>
          <CardHeader title={`Evolución mensual ${year}`} subtitle="Correctivo, preventivo y a cobro" />
          <div className="h-[420px] px-2 pb-4">
            <ResponsiveContainer>
              <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="month" {...axisProps} tickFormatter={monthLabel} />
                <YAxis {...axisProps} tickFormatter={(v) => clpShort(v).replace('$ ', '')} width={60} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip formatter={clp} labelFormatter={monthLabel} />} />
                {EXPENSE_CATEGORIES.map((c, i) => (
                  <Bar key={c.id} dataKey={c.id} stackId="a" fill={c.color} radius={i === EXPENSE_CATEGORIES.length - 1 ? [6, 6, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card delay={0.14}>
          <CardHeader title="Por tipo de intervención" />
          <div className="flex items-center gap-3 px-5 pb-5">
            <div className="size-32 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none" cornerRadius={3}>
                    {byType.map((t) => (
                      <Cell key={t.name} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={clp} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
              {byType.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: t.color }} />
                    <span className="truncate text-muted" title={t.name}>{t.name}</span>
                  </span>
                  <span className="tabular shrink-0 font-medium whitespace-nowrap">{clpShort(t.value)}</span>
                </li>
              ))}
            </ul>
          </div>
          <CardHeader title="Sucursales con mayor gasto" className="pt-2" />
          <ul className="space-y-2 px-5 pb-5">
            {byBranch.map((b) => (
              <li key={b.name} className="text-xs">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="truncate text-muted">{b.name}</span>
                  <span className="tabular font-medium">{clpShort(b.value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(b.value / byBranch[0].value) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden" delay={0.18}>
        <CardHeader title="Órdenes de trabajo" subtitle="La recuperabilidad se puede cambiar directamente en la tabla" />
        <DataTable data={rows} columns={columns} pageSize={12} dense />
      </Card>
    </>
  )
}
