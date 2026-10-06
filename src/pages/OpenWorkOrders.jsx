import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertOctagon, CalendarX, Columns3, Download, ExternalLink, List, Package, ShieldCheck, UserX, X } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { TODAY, getOpenWorkOrders, iso } from '@/data/api'
import { INTERVENTION_COLOR, INTERVENTION_TYPES, PRIORITIES, PRIORITY_COLOR } from '@/data/catalog'
import { Card } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader, SearchInput, Segmented } from '@/components/ui/misc'
import { ManagementDrawer } from '@/components/ot/ManagementDrawer'
import { KanbanBoard } from '@/components/ot/KanbanBoard'
import { date } from '@/lib/format'
import { exportOpenOrders } from '@/lib/excel/exports'

const QUICK = [
  { id: 'critical', label: 'Críticas', hint: 'Prioridad o seguridad', icon: AlertOctagon, color: '#ef4444' },
  { id: 'noManagement', label: 'Sin gestión', hint: 'Requieren actualización', icon: UserX, color: '#94a3b8' },
  { id: 'overdue', label: 'Compromiso vencido', hint: 'Fecha cumplida', icon: CalendarX, color: '#f97316' },
  { id: 'parts', label: 'Esperando repuesto', hint: 'Bloqueadas por repuesto', icon: Package, color: '#f59e0b' },
  { id: 'external', label: 'Externos', hint: 'Concesionario o seguro', icon: ExternalLink, color: '#06b6d4' },
  { id: 'releasable', label: 'Liberables', hint: 'Sin bloqueo o cierre', icon: ShieldCheck, color: '#22c55e' },
]

const DAY_RANGES = [
  { value: 'all', label: 'Todos los días', test: () => true },
  { value: '0-2', label: '0–2 días', test: (d) => d <= 2 },
  { value: '3-10', label: '3–10 días', test: (d) => d >= 3 && d <= 10 },
  { value: '11-20', label: '11–20 días', test: (d) => d >= 11 && d <= 20 },
  { value: 'gt20', label: 'Más de 20 días', test: (d) => d > 20 },
]

export default function OpenWorkOrders() {
  const [params, setParams] = useSearchParams()
  const all = useData((b) => getOpenWorkOrders(b))
  const [query, setQuery] = useState('')
  const [client, setClient] = useState('all')
  const [type, setType] = useState('all')
  const [priority, setPriority] = useState('all')
  // ?ot=NÚMERO abre directamente la gestión de esa OT (enlace desde Alertas).
  const [selected, setSelected] = useState(() => all.find((o) => o.workOrder === params.get('ot')) ?? null)

  const view = params.get('vista') === 'tablero' ? 'board' : 'table'
  const filterParam = params.get('filtro') ?? ''
  const quick = QUICK.some((q) => q.id === filterParam) ? filterParam : null
  const days = DAY_RANGES.some((r) => r.value === filterParam) ? filterParam : 'all'

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  // Filtros comunes (todo menos el filtro rápido) para que los conteos de las
  // tarjetas respondan a sucursal, cliente, tipo, prioridad, días y búsqueda.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dayTest = DAY_RANGES.find((r) => r.value === days).test
    return all.filter(
      (o) =>
        (client === 'all' || o.client === client) &&
        (type === 'all' || o.interventionType === type) &&
        (priority === 'all' || o.management.priority === priority) &&
        dayTest(o.daysOpen) &&
        (!q || [o.plate, o.workOrder, o.client, o.branch, o.reason, o.management.responsible, o.vehicle].some((v) => String(v).toLowerCase().includes(q))),
    )
  }, [all, query, client, type, priority, days])
  const rows = useMemo(() => (quick ? base.filter((o) => o.flags[quick]) : base), [base, quick])

  const clients = useMemo(() => ['all', ...new Set(all.map((o) => o.client))].sort(), [all])
  const activeFilters = [client !== 'all', type !== 'all', priority !== 'all', days !== 'all', Boolean(quick), Boolean(query)].filter(Boolean).length

  const clearFilters = () => {
    setQuery('')
    setClient('all')
    setType('all')
    setPriority('all')
    setParam('filtro', '')
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: 'plate',
        header: 'Patente / OT',
        cell: ({ row: { original: o } }) => (
          <div>
            <div className="font-semibold">{o.plate}</div>
            <div className="text-xs text-muted">
              {o.vehicle} · OT {o.workOrder}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'branch',
        header: 'Sucursal / cliente',
        cell: ({ row: { original: o } }) => (
          <div className="max-w-48">
            <div className="truncate">{o.branch}</div>
            <div className="truncate text-xs text-muted">{o.client}</div>
          </div>
        ),
      },
      { accessorKey: 'daysOpen', header: 'Días', cell: (c) => <DaysBadge days={c.getValue()} />, meta: { align: 'right' } },
      { id: 'priority', accessorFn: (o) => PRIORITIES.indexOf(o.management.priority), header: 'Prioridad', cell: ({ row: { original: o } }) => <Badge color={PRIORITY_COLOR[o.management.priority]}>{o.management.priority}</Badge> },
      {
        id: 'real',
        accessorFn: (o) => o.management.realStatus,
        header: 'Estado real / tipo',
        cell: ({ row: { original: o } }) => (
          <div className="max-w-48">
            <div className="truncate" title={o.management.realStatus}>{o.management.realStatus}</div>
            <div className="mt-0.5">
              <Badge color={INTERVENTION_COLOR[o.interventionType]}>{o.interventionType}</Badge>
            </div>
          </div>
        ),
      },
      {
        id: 'commit',
        accessorFn: (o) => o.management.commitmentDate || '9999',
        header: 'Responsable / compromiso',
        cell: ({ row: { original: o } }) => {
          const d = o.management.commitmentDate
          const tone = !d ? 'text-subtle' : o.flags.overdue ? 'font-medium text-red-400' : d === iso(TODAY) ? 'font-medium text-emerald-400' : 'text-muted'
          return (
            <div className="max-w-44">
              <div className="truncate">{o.management.responsible || <span className="text-subtle">Sin responsable</span>}</div>
              <div className={`text-xs ${tone}`}>{d ? `${o.flags.overdue ? 'Vencido · ' : ''}${date(d)}` : 'Sin fecha'}</div>
            </div>
          )
        },
      },
    ],
    [],
  )

  const exportExcel = () => exportOpenOrders(rows, { filters: rows.length === all.length ? 'todas las OT abiertas' : `${rows.length} de ${all.length} OT (filtros aplicados)` })

  return (
    <>
      <PageHeader
        title="Control OT abiertas"
        description={`${all.length} órdenes de trabajo activas en SAP · ${new Set(all.map((o) => o.plate)).size} unidades detenidas`}
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => setParam('vista', v === 'board' ? 'tablero' : '')}
              options={[
                { value: 'table', label: 'Tabla', icon: List },
                { value: 'board', label: 'Tablero', icon: Columns3 },
              ]}
            />
            <Button onClick={exportExcel}>
              <Download size={16} /> Exportar Excel
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {QUICK.map((q, i) => (
          <KpiCard
            key={q.id}
            label={q.label}
            value={base.filter((o) => o.flags[q.id]).length}
            hint={q.hint}
            icon={q.icon}
            color={q.color}
            delay={i * 0.03}
            active={quick === q.id}
            onClick={() => setParam('filtro', quick === q.id ? '' : q.id)}
          />
        ))}
      </div>

      <Card className="mt-4 p-3" delay={0.1}>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Patente, OT, cliente, motivo o responsable…" className="min-w-60 flex-1" />
          <Select value={client} onChange={(e) => setClient(e.target.value)} options={clients.map((c) => ({ value: c, label: c === 'all' ? 'Todos los clientes' : c }))} className="w-48" aria-label="Cliente" />
          <Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'all', label: 'Todos los tipos' }, ...INTERVENTION_TYPES.map((t) => t.id)]} className="w-48" aria-label="Tipo de intervención" />
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} options={[{ value: 'all', label: 'Toda prioridad' }, ...PRIORITIES]} className="w-40" aria-label="Prioridad" />
          <Select value={days} onChange={(e) => setParam('filtro', e.target.value === 'all' ? '' : e.target.value)} options={DAY_RANGES} className="w-40" aria-label="Días detenida" />
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X size={14} /> Limpiar ({activeFilters})
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-4">
        {view === 'table' ? (
          <Card delay={0.12} className="overflow-hidden">
            <DataTable data={rows} columns={columns} onRowClick={setSelected} pageSize={12} />
          </Card>
        ) : (
          <KanbanBoard rows={rows} onOpen={setSelected} />
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Semáforo de días: 0–2 verde · 3–10 ámbar · 11–20 naranja · más de 20 rojo. {view === 'board' && 'Arrastre las tarjetas para actualizar el estado real.'}</p>

      <ManagementDrawer ot={selected} onClose={() => setSelected(null)} />
    </>
  )
}
