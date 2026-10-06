// Exportaciones Excel de cada pantalla: hoja "Resumen" (indicadores + gráficos)
// y hoja de detalle con filtros y totales.
import { toast } from 'sonner'
import { META, TODAY, iso } from '@/data/api'
import { downloadReport } from './report'

const today = () => iso(TODAY).split('-').reverse().join('-')
const source = () => (META.source === 'sap' ? `SAP: ${META.fileName}` : 'datos de demostración')
const subtitleOf = (extra) => [extra, `generado el ${today()}`, source()].filter(Boolean).join(' · ')
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

/** Agrupa y suma: [[clave, valor]] de mayor a menor; el resto se junta en "Otros". */
function groupBy(rows, key, value = () => 1, { top = 10, others = true } = {}) {
  const m = new Map()
  rows.forEach((r) => {
    const k = key(r) || 'Sin dato'
    m.set(k, (m.get(k) ?? 0) + (Number(value(r)) || 0))
  })
  const list = [...m.entries()].sort((a, b) => b[1] - a[1])
  if (list.length <= top) return list
  const head = list.slice(0, top)
  return others ? [...head, ['Otros', list.slice(top).reduce((s, x) => s + x[1], 0)]] : head
}
const series = (name, entries, color) => ({ name, values: entries.map((e) => e[1]), ...(color ? { color } : {}) })
const cats = (entries) => entries.map((e) => e[0])
const sum = (rows, f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0)
const byMonth = (rows, dateOf, values) => {
  const months = [...new Set(rows.map((r) => dateOf(r)?.slice(0, 7)).filter(Boolean))].sort()
  return { months, labels: months.map(monthLabel), values: values.map((f) => months.map((m) => sum(rows.filter((r) => dateOf(r)?.startsWith(m)), f))) }
}

async function save(filename, spec, rowsCount) {
  try {
    await downloadReport(filename, spec)
    toast.success(`Descargado: ${filename}`, { description: `${rowsCount.toLocaleString('es-CL')} filas · con resumen y gráficos` })
  } catch (e) {
    toast.error('No se pudo generar el Excel', { description: e?.message || String(e) })
  }
}

const detail = (name, title, columns, rows, extra = {}) => ({ name, kind: 'table', title, columns, rows, ...extra })

// ------------------------------------------------------------------ gastos
export function exportExpenses(rows, { year, filters } = {}) {
  const total = sum(rows, (r) => r.total)
  const m = byMonth(rows, (r) => r.date, [(r) => r.preventive, (r) => r.corrective, (r) => r.tires ?? 0, (r) => r.equipment ?? 0, (r) => r.charge])
  const types = groupBy(rows, (r) => r.interventionType, (r) => r.total, { top: 7 })
  const branches = groupBy(rows, (r) => r.branch, (r) => r.total, { top: 10, others: false })
  const clients = groupBy(rows, (r) => r.client, (r) => r.total, { top: 10, others: false })
  return save(`WEST_IA_gastos_${year ?? ''}_${iso(TODAY)}.xlsx`, {
    title: `Control de gastos${year ? ` · ${year}` : ''}`,
    subtitle: subtitleOf(filters || 'OT cerradas'),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Gasto total', value: total, fmt: 'clp', hint: `${rows.length.toLocaleString('es-CL')} OT cerradas` },
          { label: 'Correctivo', value: sum(rows, (r) => r.corrective), fmt: 'clp', color: 'FFFFC400' },
          { label: 'Preventivo', value: total ? sum(rows, (r) => r.preventive) / total : 0, fmt: 'pct', hint: 'del gasto total', color: 'FF22C55E' },
          { label: 'Promedio por OT', value: rows.length ? total / rows.length : 0, fmt: 'clp', hint: `${new Set(rows.map((r) => r.plate)).size} vehículos`, color: 'FF3B82F6' },
        ],
        charts: [
          {
            type: 'bar', title: 'Gasto mensual', wide: true, stacked: true, fmt: 'clpM', categories: m.labels,
            series: [
              { name: 'Preventivo', values: m.values[0], color: '22C55E' },
              { name: 'Correctivo', values: m.values[1], color: 'FFC400' },
              { name: 'Neumáticos', values: m.values[2], color: 'F97316' },
              { name: 'Equipamiento', values: m.values[3], color: '2A2723' },
              { name: 'A cobro', values: m.values[4], color: '3B82F6' },
            ],
          },
          { type: 'doughnut', title: 'Gasto por tipo de intervención', fmt: 'clp', categories: cats(types), series: [series('Gasto', types)] },
          { type: 'barH', title: 'Gasto por sucursal', fmt: 'clpM', labels: true, categories: cats(branches), series: [series('Gasto', branches)] },
          { type: 'barH', title: 'Clientes con más gasto', wide: true, rows: 14, fmt: 'clpM', labels: true, categories: cats(clients), series: [series('Gasto', clients, '2A2723')] },
        ],
        tables: [{ title: 'Gasto por sucursal', columns: [{ header: 'Sucursal', value: 0 }, { header: 'Gasto', value: 1, fmt: 'clp', total: 'sum' }, { header: '% del total', value: (r) => (total ? r[1] / total : 0), fmt: 'pct' }], rows: groupBy(rows, (r) => r.branch, (r) => r.total, { top: 50, others: false }) }],
      },
      detail('Detalle OT', 'Detalle de gastos por OT', [
        { header: 'Fecha', value: 'date', fmt: 'date' },
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'N° OT', value: 'workOrder' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Cliente', value: 'client' },
        { header: 'Área', value: 'area' },
        { header: 'Tipo intervención', value: 'interventionType' },
        { header: 'Preparación de unidad', value: (r) => (r.preparation ? 'Sí' : '') },
        { header: 'Motivo', value: 'reason', wrap: true, width: 48 },
        { header: 'Correctivo', value: 'corrective', fmt: 'clp', total: 'sum' },
        { header: 'Preventivo', value: 'preventive', fmt: 'clp', total: 'sum' },
        { header: 'Neumáticos', value: (r) => r.tires ?? 0, fmt: 'clp', total: 'sum' },
        { header: 'Equipamiento', value: (r) => r.equipment ?? 0, fmt: 'clp', total: 'sum' },
        { header: 'A cobro', value: 'charge', fmt: 'clp', total: 'sum' },
        { header: 'Total', value: 'total', fmt: 'clp', total: 'sum', bar: true, bold: true },
        { header: 'Recuperabilidad', value: 'recovery' },
      ], rows, { freezeCols: 2 }),
    ],
  }, rows.length)
}

// ------------------------------------------------------------------- flota
export function exportFleet(rows, { filters } = {}) {
  const status = groupBy(rows, (v) => v.statusLabel, () => 1, { top: 8 })
  const brands = groupBy(rows, (v) => v.brand, () => 1, { top: 10 })
  const branches = groupBy(rows, (v) => v.branch, () => 1, { top: 12, others: false })
  const years = [...groupBy(rows.filter((v) => v.year), (v) => String(v.year), () => 1, { top: 40, others: false })].sort((a, b) => a[0].localeCompare(b[0]))
  const late = rows.filter((v) => v.mileage > 0 && v.kmToMaintenance < 0).length
  const withKm = rows.filter((v) => v.mileage > 0)
  return save(`WEST_IA_flota_${iso(TODAY)}.xlsx`, {
    title: 'Flota',
    subtitle: subtitleOf(filters),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Vehículos', value: rows.length, fmt: 'int' },
          { label: 'En taller', value: rows.filter((v) => v.status === 'workshop').length, fmt: 'int', color: 'FFF97316', hint: rows.length ? `${Math.round((rows.filter((v) => v.status === 'workshop').length / rows.length) * 100)}% de la flota` : '' },
          { label: 'Km promedio', value: withKm.length ? sum(withKm, (v) => v.mileage) / withKm.length : 0, fmt: 'km', color: 'FF3B82F6' },
          { label: 'Mantención vencida', value: late, fmt: 'int', color: 'FFEF4444', hint: 'según km de la última OT' },
        ],
        charts: [
          { type: 'doughnut', title: 'Estado de la flota', fmt: 'int', categories: cats(status), series: [series('Vehículos', status)] },
          { type: 'barH', title: 'Marcas', fmt: 'int', labels: true, categories: cats(brands), series: [series('Vehículos', brands, '2A2723')] },
          { type: 'barH', title: 'Vehículos por sucursal', wide: true, rows: 15, fmt: 'int', labels: true, categories: cats(branches), series: [series('Vehículos', branches)] },
          { type: 'bar', title: 'Antigüedad (año del vehículo)', wide: true, rows: 13, fmt: 'int', labels: true, categories: cats(years), series: [series('Vehículos', years, '3B82F6')] },
        ],
      },
      detail('Vehículos', 'Detalle de la flota', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Marca', value: 'brand' },
        { header: 'Modelo', value: 'model' },
        { header: 'Categoría', value: 'categoryLabel' },
        { header: 'Año', value: 'year' },
        { header: 'Combustible', value: 'fuel' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Estado', value: 'statusLabel' },
        { header: 'Cliente', value: 'client' },
        { header: 'Kilometraje', value: (v) => v.mileage || null, fmt: 'km', total: 'avg' },
        { header: 'Km estimado hoy', value: (v) => v.estMileage ?? null, fmt: 'km' },
        { header: 'Próxima mantención', value: 'nextMaintenanceKm', fmt: 'km' },
        { header: 'Km para mantención', value: (v) => (v.mileage ? v.kmToMaintenance : null), fmt: 'int', scale: 'good-high' },
        { header: 'VIN', value: 'vin' },
      ], rows, { freezeCols: 1 }),
    ],
  }, rows.length)
}

// -------------------------------------------------------------- OT abiertas
const DAY_RANGES = [
  ['0-7 días', 0, 7],
  ['8-15 días', 8, 15],
  ['16-30 días', 16, 30],
  ['31-60 días', 31, 60],
  ['Más de 60', 61, Infinity],
]
const dayBuckets = (rows) => DAY_RANGES.map(([label, a, b]) => [label, rows.filter((o) => o.daysOpen >= a && o.daysOpen <= b).length])

export function exportOpenOrders(rows, { filters, title = 'Control de OT abiertas', filename = `WEST_IA_ot_abiertas_${iso(TODAY)}.xlsx` } = {}) {
  const m = (o) => o.management ?? {}
  const branches = groupBy(rows, (o) => o.branch, () => 1, { top: 12, others: false })
  const real = groupBy(rows, (o) => m(o).realStatus, () => 1, { top: 7 })
  const avg = rows.length ? sum(rows, (o) => o.daysOpen) / rows.length : 0
  return save(filename, {
    title,
    subtitle: subtitleOf(filters),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Vehículos en taller', value: rows.length, fmt: 'int' },
          { label: 'Días promedio', value: avg, fmt: 'dec1', color: 'FFF97316' },
          { label: 'Más de 30 días', value: rows.filter((o) => o.daysOpen > 30).length, fmt: 'int', color: 'FFEF4444' },
          { label: 'Sin gestión', value: rows.filter((o) => o.flags?.noManagement).length, fmt: 'int', color: 'FF94A3B8', hint: 'sin responsable ni estado real' },
        ],
        charts: [
          { type: 'bar', title: 'Antigüedad de las OT abiertas', fmt: 'int', labels: true, categories: cats(dayBuckets(rows)), series: [series('OT', dayBuckets(rows), 'F97316')] },
          { type: 'doughnut', title: 'Estado real (gestión)', fmt: 'int', categories: cats(real), series: [series('OT', real)] },
          { type: 'barH', title: 'OT abiertas por sucursal', wide: true, rows: 15, fmt: 'int', labels: true, categories: cats(branches), series: [series('OT', branches)] },
        ],
      },
      detail('OT abiertas', 'Detalle de OT abiertas', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Vehículo', value: 'vehicle' },
        { header: 'N° OT', value: 'workOrder' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Cliente', value: 'client' },
        { header: 'Estado SAP', value: 'sapStatus' },
        { header: 'Ingreso', value: 'receivedDate', fmt: 'date' },
        { header: 'Días detenida', value: 'daysOpen', fmt: 'days', total: 'avg', scale: 'bad-high', bold: true },
        { header: 'Tipo intervención', value: 'interventionType' },
        { header: 'Motivo', value: 'reason', wrap: true, width: 48 },
        { header: 'Prioridad', value: (o) => m(o).priority },
        { header: 'Estado real', value: (o) => m(o).realStatus },
        { header: 'Bloqueo', value: (o) => m(o).blocker },
        { header: 'Responsable', value: (o) => m(o).responsible || o.owner || '' },
        { header: 'Compromiso', value: (o) => m(o).commitmentDate || null, fmt: 'date' },
        { header: 'Próxima acción', value: (o) => m(o).nextAction, wrap: true, width: 30 },
      ], rows, { freezeCols: 1 }),
    ],
  }, rows.length)
}

// ------------------------------------------------------------- mantenciones
export function exportMaintenance(rows, { view } = {}) {
  const branches = groupBy(rows, (v) => v.branch, () => 1, { top: 12, others: false })
  const weeks = [
    ['Vencidas', rows.filter((v) => v.due === 'late').length],
    ['0-7 días', rows.filter((v) => v.due === 'soon' && (v.estDaysToMaintenance ?? 99) <= 7).length],
    ['8-15 días', rows.filter((v) => v.due === 'soon' && v.estDaysToMaintenance > 7 && v.estDaysToMaintenance <= 15).length],
    ['16-30 días', rows.filter((v) => v.due === 'soon' && v.estDaysToMaintenance > 15).length],
    ['Sin ritmo de uso', rows.filter((v) => v.due === 'soon' && v.estDaysToMaintenance == null).length],
  ]
  return save(`WEST_IA_mantenciones_${view === 'late' ? 'vencidas' : 'proximas'}_${iso(TODAY)}.xlsx`, {
    title: view === 'late' ? 'Mantenciones vencidas' : 'Mantenciones de los próximos 30 días',
    subtitle: subtitleOf('km de hoy estimados con el ritmo de uso de cada vehículo'),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Vehículos', value: rows.length, fmt: 'int' },
          { label: 'Vencidas', value: rows.filter((v) => v.due === 'late').length, fmt: 'int', color: 'FFEF4444' },
          { label: 'Próxima semana', value: weeks[1][1], fmt: 'int', color: 'FFF97316' },
          { label: 'Km/día promedio', value: (() => { const r = rows.filter((v) => v.kmPerDay); return r.length ? sum(r, (v) => v.kmPerDay) / r.length : 0 })(), fmt: 'int', color: 'FF3B82F6' },
        ],
        charts: [
          { type: 'bar', title: '¿Cuándo toca?', fmt: 'int', labels: true, categories: cats(weeks), series: [series('Vehículos', weeks, 'F97316')] },
          { type: 'barH', title: 'Por sucursal', fmt: 'int', labels: true, categories: cats(branches), series: [series('Vehículos', branches)] },
        ],
      },
      detail('Mantenciones', 'Detalle de mantenciones', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Marca', value: 'brand' },
        { header: 'Modelo', value: 'model' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Cliente', value: 'client' },
        { header: 'Km registrado (última OT)', value: 'mileage', fmt: 'km' },
        { header: 'Km estimado hoy', value: (v) => v.estMileage ?? null, fmt: 'km' },
        { header: 'Km por día', value: (v) => (v.kmPerDay ? Math.round(v.kmPerDay) : null), fmt: 'int' },
        { header: 'Mantención a los', value: 'nextMaintenanceKm', fmt: 'km' },
        { header: 'Fecha estimada', value: (v) => v.estDueDate ?? null, fmt: 'date', bold: true },
        { header: 'Días restantes', value: (v) => v.estDaysToMaintenance ?? null, fmt: 'int', scale: 'good-high' },
        { header: 'Km restantes (según registro)', value: 'kmToMaintenance', fmt: 'int' },
      ], rows, { freezeCols: 1 }),
    ],
  }, rows.length)
}

// ------------------------------------------------------ gasto por vehículo
const ADVICE = { sell: 'Evaluar venta', review: 'Revisar' }
export function exportCostRanking(rows, { period } = {}) {
  const top = rows.slice(0, 15)
  const total = sum(rows, (r) => r.spend)
  const top20 = sum(rows.slice(0, Math.ceil(rows.length * 0.2)), (r) => r.spend)
  return save(`WEST_IA_gasto_por_vehiculo_${iso(TODAY)}.xlsx`, {
    title: 'Gasto por vehículo',
    subtitle: subtitleOf(period),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Gasto (sin preparación)', value: total, fmt: 'clp', hint: `${rows.length} vehículos con OT` },
          { label: 'Evaluar venta', value: rows.filter((r) => r.advice === 'sell').length, fmt: 'int', color: 'FFEF4444' },
          { label: 'Revisar', value: rows.filter((r) => r.advice === 'review').length, fmt: 'int', color: 'FFF97316' },
          { label: '20% que más gasta', value: total ? top20 / total : 0, fmt: 'pct', hint: 'del gasto total', color: 'FF2A2723' },
        ],
        charts: [
          {
            type: 'barH', title: 'Los 15 vehículos que más gastan', wide: true, rows: 20, stacked: true, fmt: 'clpM', categories: top.map((r) => `${r.plate} · ${r.vehicle}`),
            series: [
              { name: 'Preventivo', values: top.map((r) => r.preventive), color: '22C55E' },
              { name: 'Correctivo', values: top.map((r) => r.corrective), color: 'FFC400' },
              { name: 'Neumáticos', values: top.map((r) => r.tires ?? 0), color: 'F97316' },
              { name: 'Equipamiento', values: top.map((r) => r.equipment ?? 0), color: '2A2723' },
              { name: 'Siniestros / DYP', values: top.map((r) => r.accident), color: 'EF4444' },
            ],
          },
        ],
      },
      detail('Vehículos', 'Ranking de gasto por vehículo', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Vehículo', value: 'vehicle' },
        { header: 'Año', value: 'year' },
        { header: 'Categoría', value: 'category' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Km', value: 'mileage', fmt: 'km' },
        { header: 'OT', value: 'orders', fmt: 'int', total: 'sum' },
        { header: 'Preventivo', value: 'preventive', fmt: 'clp', total: 'sum' },
        { header: 'Correctivo', value: 'corrective', fmt: 'clp', total: 'sum' },
        { header: 'Neumáticos', value: (r) => r.tires ?? 0, fmt: 'clp', total: 'sum' },
        { header: 'Equipamiento', value: (r) => r.equipment ?? 0, fmt: 'clp', total: 'sum' },
        { header: 'Siniestros / DYP', value: 'accident', fmt: 'clp', total: 'sum' },
        { header: 'Gasto (sin preparación)', value: 'spend', fmt: 'clp', total: 'sum', bar: true, bold: true },
        { header: 'Preparación', value: 'preparation', fmt: 'clp', total: 'sum' },
        { header: 'Veces el promedio de su categoría', value: (r) => Math.round(r.ratio * 10) / 10, fmt: 'dec1', scale: 'bad-high' },
        { header: 'Sugerencia', value: (r) => ADVICE[r.advice] ?? '', bold: true },
      ], rows, { freezeCols: 1 }),
    ],
  }, rows.length)
}

// ------------------------------------------------------ OT para cerrar en SAP
export function exportOrdersToClose(rows) {
  const reasons = groupBy(rows, (r) => r.reasonLabel, () => 1, { top: 6 })
  const branches = groupBy(rows, (r) => r.branch, () => 1, { top: 15, others: false })
  return save(`OT para cerrar en SAP ${iso(TODAY)}.xlsx`, {
    title: 'OT para cerrar o revisar en SAP',
    subtitle: subtitleOf('para enviar a cada taller · ordenadas por prioridad y sucursal'),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'OT para cerrar o revisar', value: rows.length, fmt: 'int' },
          { label: 'Liberadas sin cerrar', value: rows.filter((r) => r.reason === 'released').length, fmt: 'int', color: 'FFEF4444' },
          { label: 'Finalizadas sin cierre', value: rows.filter((r) => r.reason === 'finished').length, fmt: 'int', color: 'FFF97316' },
          { label: 'Para revisar', value: rows.filter((r) => ['superseded', 'stale'].includes(r.reason)).length, fmt: 'int', color: 'FF3B82F6' },
        ],
        charts: [
          { type: 'doughnut', title: 'Por motivo', fmt: 'int', categories: cats(reasons), series: [series('OT', reasons)] },
          { type: 'barH', title: 'Por sucursal', fmt: 'int', labels: true, categories: cats(branches), series: [series('OT', branches)] },
        ],
        notes: [
          'Por qué importa: una OT que sigue abierta en SAP cuenta como vehículo detenido. Infla los días en taller, la disponibilidad y los reportes.',
          'Prioridad 1: la gestión dice que la unidad ya salió. 2: el trabajo terminó pero falta cerrar o facturar. 3 y 4: revisar caso a caso.',
          'Use el filtro de la columna "Sucursal" en la hoja "OT" para enviar a cada taller solo lo suyo.',
        ],
      },
      detail('OT', 'OT para cerrar o revisar en SAP', [
        { header: 'Prioridad', value: 'priority', fmt: 'int', scale: 'good-high' },
        { header: 'Sucursal', value: 'branch', bold: true },
        { header: 'OT', value: 'workOrder', bold: true },
        { header: 'Patente', value: 'plate' },
        { header: 'Vehículo', value: 'vehicle' },
        { header: 'Cliente', value: 'client' },
        { header: 'Motivo', value: 'reasonLabel' },
        { header: 'Qué hacer', value: 'action', bold: true },
        { header: 'Evidencia', value: 'evidence', wrap: true, width: 46 },
        { header: 'Estado SAP', value: 'sapStatus' },
        { header: 'Ingreso', value: 'receivedDate', fmt: 'date' },
        { header: 'Días abierta', value: 'daysOpen', fmt: 'int', scale: 'bad-high' },
        { header: 'Creó la OT', value: 'createdBy' },
        { header: 'Responsable (gestión)', value: 'responsible' },
        { header: 'Motivo de la OT', value: 'reasonText', wrap: true, width: 40 },
        { header: 'Hecho', value: () => null, list: ['Cerrada', 'Revisada: sigue abierta'], width: 18 },
      ], rows, { freezeCols: 3, note: `${rows.length} OT · marque la columna amarilla "Hecho" a medida que las cierren` }),
    ],
  }, rows.length)
}

// ---------------------------------------------------------- días en taller
export function exportWorkshopDays(rows, { period, periodDays }) {
  const top = rows.slice(0, 15)
  const branches = groupBy(rows, (r) => r.branch, (r) => r.days, { top: 12, others: false })
  const total = sum(rows, (r) => r.days)
  return save(`WEST_IA_dias_en_taller_${iso(TODAY)}.xlsx`, {
    title: 'Días detenido en taller por vehículo',
    subtitle: subtitleOf(`${period} · sin OT de preparación de unidades`),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Vehículos con días en taller', value: rows.length, fmt: 'int' },
          { label: 'Días-vehículo detenidos', value: total, fmt: 'int', color: 'FFF97316' },
          { label: 'Promedio por vehículo', value: rows.length ? total / rows.length : 0, fmt: 'dec1', hint: `días en un período de ${periodDays}`, color: 'FF3B82F6' },
          { label: 'En taller hoy', value: rows.filter((r) => r.inWorkshop).length, fmt: 'int', color: 'FFEF4444' },
        ],
        charts: [
          { type: 'barH', title: 'Los 15 vehículos con más días detenido', wide: true, rows: 20, fmt: 'int', labels: true, categories: top.map((r) => `${r.plate} · ${r.vehicle}`), series: [{ name: 'Días', values: top.map((r) => r.days), color: 'F97316' }] },
          { type: 'barH', title: 'Días-vehículo detenidos por sucursal', wide: true, rows: 15, fmt: 'int', labels: true, categories: cats(branches), series: [series('Días', branches)] },
        ],
        notes: [
          'Los días se calculan uniendo los períodos de todas las OT del vehículo (ingreso → cierre, o hoy si sigue abierta), sin contar dos veces los días en que tuvo más de una OT a la vez.',
          'No se cuentan las OT terminadas sin fecha de cierre. Si durante una OT el vehículo vuelve a ingresar con más km, esa estadía se corta ahí (columna "Ajustado").',
        ],
      },
      detail('Vehículos', 'Días detenido por vehículo', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Vehículo', value: 'vehicle' },
        { header: 'Categoría', value: 'category' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Cliente', value: 'client' },
        { header: 'Días detenido', value: 'days', fmt: 'int', total: 'sum', bar: true, bold: true },
        { header: '% del período', value: 'share', fmt: 'pct', scale: 'bad-high' },
        { header: 'Ingresos a taller', value: 'stays', fmt: 'int', total: 'sum' },
        { header: 'OT', value: 'orders', fmt: 'int', total: 'sum' },
        { header: 'Estadía más larga (días)', value: 'longest', fmt: 'int' },
        { header: 'Promedio por ingreso (días)', value: (r) => Math.round(r.avgStay * 10) / 10, fmt: 'dec1' },
        { header: 'En taller hoy', value: (r) => (r.inWorkshop ? `Sí · ${r.openDays} días` : '') },
        { header: 'Ajustado', value: (r) => (r.trimmed ? 'OT abierta en SAP con el vehículo circulando: se recortó' : ''), width: 30 },
      ], rows, { freezeCols: 1 }),
    ],
  }, rows.length)
}

// ----------------------------------------------------------------- visitas
export function exportVisit(visit, rows, branch) {
  const results = groupBy(rows, (r) => r.result, () => 1, { top: 6 })
  return save(`WEST_IA_visita_${branch.replace(/\W+/g, '-')}_${visit.date}.xlsx`, {
    title: `Visita a sucursal · ${branch}`,
    subtitle: subtitleOf(`visita del ${visit.date.split('-').reverse().join('-')}${visit.visitor ? ` · ${visit.visitor}` : ''}`),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Unidades revisadas', value: rows.length, fmt: 'int' },
          { label: 'Liberadas', value: rows.filter((r) => r.result === 'LIBERADA').length, fmt: 'int', color: 'FF22C55E' },
          { label: 'Continúan', value: rows.filter((r) => r.result === 'CONTINÚA').length, fmt: 'int', color: 'FFF97316' },
          { label: 'Nuevas', value: rows.filter((r) => r.result === 'NUEVA').length, fmt: 'int', color: 'FF3B82F6' },
        ],
        charts: [{ type: 'doughnut', title: 'Resultado vs. visita anterior', fmt: 'int', categories: cats(results), series: [series('Unidades', results)] }],
        notes: visit.notes ? [`Notas: ${visit.notes}`] : [],
      },
      detail('Unidades', 'Unidades de la visita', [
        { header: 'Resultado vs. anterior', value: 'result', bold: true },
        { header: 'Revisada', value: (i) => (i.reviewed ? 'Sí' : 'No') },
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'N° OT', value: 'workOrder' },
        { header: 'Días', value: 'daysOpen', fmt: 'days', scale: 'bad-high' },
        { header: 'Estado real', value: 'realStatus' },
        { header: 'Responsable', value: 'responsible' },
      ], rows),
    ],
  }, rows.length)
}

// ------------------------------------------------- informe de tabla genérico
/** columns: [{ header, value, fmt?, total?, bar?, scale? }]; chart opcional con { type, title, label, value, fmt }. */
export function exportTable({ filename, title, subtitle, columns, rows, chart }) {
  const sheets = []
  if (chart && rows.length) {
    const entries = rows.slice(0, chart.top ?? 15).map((r) => [String(typeof chart.label === 'function' ? chart.label(r) : r[chart.label]), Number(typeof chart.value === 'function' ? chart.value(r) : r[chart.value]) || 0])
    sheets.push({ name: 'Resumen', kind: 'dashboard', charts: [{ type: chart.type ?? 'barH', title: chart.title ?? title, wide: true, rows: Math.max(12, Math.min(24, entries.length + 6)), fmt: chart.fmt ?? 'int', labels: true, categories: cats(entries), series: [series(chart.series ?? title, entries)] }] })
  }
  sheets.push(detail('Detalle', title, columns, rows))
  return save(filename, { title, subtitle: subtitleOf(subtitle), sheets }, rows.length)
}

// ------------------------------------------- repuestos sin clasificar
const PART_CLASSES = ['Preventivo', 'Correctivo', 'Neumáticos', 'Equipamiento']
/** Sugerencia por la descripción; solo una ayuda, la decisión es de quien clasifica. */
function suggestClass(desc) {
  const d = String(desc ?? '').toUpperCase()
  if (/\bNEUM|\bLLANTA|CAMARA AIRE|VALVULA NEUM/.test(d)) return 'Neumáticos'
  if (/FILTRO|ACEITE|LUBRIC|REFRIGERANTE|LIQ(UIDO)?\.? ?FRENO|MANTENCI|PAUTA|GRASA|ORING|O-RING|SCANNER|LAVADO/.test(d)) return 'Preventivo'
  if (/LAMINA|BARRA ANTIVUELCO|PERTIGA|BALIZA|CINTA REFLEC|EXTINTOR|CU[ÑN]A|BOTIQU|ADHESIVO|SE[ÑN]ALETICA|ANTENA|\bGPS\b|JAULA|LOGO|CAMILLA|EPP|MANGAS TERRESTRES|KIT (DE )?DERRAME|PORTA ?ESCALA|ESTANQUE .*IRONMAN/.test(d)) return 'Equipamiento'
  return 'Correctivo'
}

export function exportUnclassifiedParts(rows) {
  const total = sum(rows, (r) => r.amount)
  const top = rows.slice(0, 15)
  const coverage = (n) => (rows.length ? rows[Math.min(n, rows.length) - 1].cumulative : 0)
  return save(`Repuestos por clasificar ${iso(TODAY)}.xlsx`, {
    title: 'Repuestos y servicios sin clasificar',
    subtitle: subtitleOf('códigos de las OT que no están en ningún catálogo de repuestos'),
    sheets: [
      {
        name: 'Cómo usar',
        kind: 'dashboard',
        kpis: [
          { label: 'Códigos sin clasificar', value: rows.length, fmt: 'int' },
          { label: 'Monto sin clasificar', value: total, fmt: 'clp', color: 'FFF97316' },
          { label: 'Los 20 primeros cubren', value: coverage(20), fmt: 'pct', hint: 'del monto sin clasificar', color: 'FF22C55E' },
          { label: 'Los 50 primeros cubren', value: coverage(50), fmt: 'pct', hint: 'del monto sin clasificar', color: 'FF3B82F6' },
        ],
        charts: [{ type: 'barH', title: 'Los 15 códigos con más monto', wide: true, rows: 18, fmt: 'clpM', labels: true, categories: top.map((r) => `${r.code} · ${r.description}`.slice(0, 60)), series: [{ name: 'Monto', values: top.map((r) => r.amount) }] }],
        notes: [
          '1. En la hoja "Por clasificar", elija la clase de cada código en la columna amarilla "Clase" (lista desplegable).',
          '   La columna "Sugerencia" es solo una ayuda según la descripción; revísela antes de aceptarla.',
          '2. Guarde el archivo y déjelo en la carpeta SAP del escritorio. WEST IA lo lee solo y recalcula los gastos.',
          '3. Los códigos con la columna "Clase" vacía se ignoran: puede clasificarlos de a poco.',
          'Clases: Preventivo (pauta / mantención), Correctivo (reparación de fallas), Neumáticos, Equipamiento (preparación de unidades, no es falla).',
        ],
      },
      detail('Por clasificar', 'Códigos por clasificar · ordenados por monto', [
        { header: 'Código', value: 'code', bold: true },
        { header: 'Descripción', value: 'description', width: 52 },
        { header: 'Clase', value: () => null, list: PART_CLASSES, width: 16 },
        { header: 'Sugerencia', value: (r) => suggestClass(r.description), width: 14 },
        { header: 'Monto', value: 'amount', fmt: 'clp', total: 'sum', bar: true },
        { header: '% del monto', value: 'share', fmt: 'pct' },
        { header: '% acumulado', value: 'cumulative', fmt: 'pct' },
        { header: 'Cantidad', value: 'qty', fmt: 'dec1' },
        { header: 'OT', value: 'orders', fmt: 'int', total: 'sum' },
        { header: 'Patentes', value: 'plates', fmt: 'int' },
        { header: 'Modelos', value: 'models', width: 40 },
        { header: 'Tipo de OT más común', value: 'type' },
        { header: 'Último uso', value: 'last', fmt: 'date' },
      ], rows, { freezeCols: 2, note: `${rows.length} códigos · complete la columna amarilla "Clase" y deje el archivo en la carpeta SAP` }),
    ],
  }, rows.length)
}

// ------------------------------------------------------- informe mensual
export function exportMonthly(report, monthName) {
  const s = report.summary
  const types = report.byType.map((t) => [t.type, t.total])
  const branches = report.branches.filter((b) => b.total > 0).slice(0, 12)
  const top = report.topVehicles.slice(0, 10)
  const open = report.open
  return save(`WEST_IA_informe_${report.month}.xlsx`, {
    title: `Informe mensual de flota · ${monthName}`,
    subtitle: subtitleOf(),
    sheets: [
      {
        name: 'Resumen',
        kind: 'dashboard',
        kpis: [
          { label: 'Gasto del mes', value: s.spend, fmt: 'clp', hint: `${s.closed} OT cerradas` },
          { label: 'Preventivo', value: s.spend ? s.preventive / s.spend : 0, fmt: 'pct', hint: 'del gasto', color: 'FF22C55E' },
          { label: 'OT recibidas', value: s.received, fmt: 'int', color: 'FF3B82F6' },
          { label: 'Disponibilidad hoy', value: s.availability, fmt: 'pct', hint: `flota operativa: ${s.fleet}`, color: 'FF22C55E' },
          { label: 'OT abiertas hoy', value: s.openNow, fmt: 'int', color: 'FFF97316' },
          { label: 'Más de 15 días', value: s.stalledNow, fmt: 'int', color: 'FFEF4444' },
          { label: 'Mantenciones por hacer', value: report.maintenance.length, fmt: 'int', hint: 'vencidas o a menos de 1.000 km', color: 'FF94A3B8' },
          { label: 'Preparación (aparte)', value: s.preparation, fmt: 'clp', hint: 'unidades para clientes · no es falla', color: 'FFEAB308' },
        ],
        charts: [
          { type: 'doughnut', title: 'Gasto por tipo de intervención', fmt: 'clp', categories: cats(types), series: [series('Gasto', types)] },
          { type: 'bar', title: 'Antigüedad de las OT abiertas hoy', fmt: 'int', labels: true, categories: cats(dayBuckets(open)), series: [series('OT', dayBuckets(open), 'F97316')] },
          { type: 'barH', title: 'Gasto del mes por sucursal', wide: true, rows: 15, fmt: 'clpM', labels: true, categories: branches.map((b) => b.branch), series: [{ name: 'Gasto', values: branches.map((b) => b.total) }] },
          {
            type: 'barH', title: 'Los 10 vehículos que más gastaron', wide: true, rows: 15, stacked: true, fmt: 'clpM', categories: top.map((r) => `${r.plate} · ${r.vehicle}`),
            series: [{ name: 'Preventivo', values: top.map((r) => r.preventive), color: '22C55E' }, { name: 'Correctivo', values: top.map((r) => r.corrective), color: 'FFC400' }, { name: 'Siniestros / DYP', values: top.map((r) => r.accident), color: 'EF4444' }],
          },
        ],
      },
      detail('Sucursales', 'Indicadores por sucursal', [
        { header: 'Sucursal', value: 'branch', bold: true },
        { header: 'Vehículos', value: 'vehicles', fmt: 'int', total: 'sum' },
        { header: 'Disponibilidad hoy', value: 'availability', fmt: 'pct', scale: 'good-high' },
        { header: 'En taller hoy', value: 'workshop', fmt: 'int', total: 'sum' },
        { header: 'Días prom. en taller', value: (r) => (r.avgDays == null ? null : Math.round(r.avgDays * 10) / 10), fmt: 'dec1', scale: 'bad-high' },
        { header: 'OT > 15 días', value: 'stalled', fmt: 'int', total: 'sum' },
        { header: 'OT del mes', value: 'orders', fmt: 'int', total: 'sum' },
        { header: 'Gasto del mes', value: 'total', fmt: 'clp', total: 'sum', bar: true },
        { header: 'Gasto por vehículo', value: (r) => (r.perVehicle == null ? null : Math.round(r.perVehicle)), fmt: 'clp' },
      ], report.branches),
      detail('Vehículos que más gastan', 'Vehículos que más gastaron en el mes', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Vehículo', value: 'vehicle' },
        { header: 'Año', value: 'year' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Km', value: 'mileage', fmt: 'km' },
        { header: 'OT', value: 'orders', fmt: 'int', total: 'sum' },
        { header: 'Preventivo', value: 'preventive', fmt: 'clp', total: 'sum' },
        { header: 'Correctivo', value: 'corrective', fmt: 'clp', total: 'sum' },
        { header: 'Siniestros / DYP', value: 'accident', fmt: 'clp', total: 'sum' },
        { header: 'Gasto (sin preparación)', value: 'spend', fmt: 'clp', total: 'sum', bar: true },
        { header: 'Preparación', value: 'preparation', fmt: 'clp', total: 'sum' },
        { header: 'Sugerencia', value: (r) => ADVICE[r.advice] ?? '', bold: true },
      ], report.topVehicles),
      detail('OT abiertas', 'OT abiertas al día de hoy', [
        { header: 'OT', value: 'workOrder' },
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Vehículo', value: 'vehicle' },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Días en taller', value: 'daysOpen', fmt: 'days', total: 'avg', scale: 'bad-high' },
        { header: 'Tipo', value: 'interventionType' },
        { header: 'Responsable', value: (o) => o.management.responsible },
        { header: 'Estado real', value: (o) => o.management.realStatus },
        { header: 'Motivo', value: 'reason', wrap: true, width: 50 },
      ], open),
      detail('Mantenciones', 'Mantenciones por hacer', [
        { header: 'Patente', value: 'plate', bold: true },
        { header: 'Vehículo', value: (v) => `${v.brand} ${v.model}` },
        { header: 'Sucursal', value: 'branch' },
        { header: 'Km actual', value: 'mileage', fmt: 'km' },
        { header: 'Mantención a los', value: 'nextMaintenanceKm', fmt: 'km' },
        { header: 'Km restantes (negativo = vencida)', value: 'kmToMaintenance', fmt: 'int', scale: 'good-high' },
      ], report.maintenance),
    ],
  }, open.length + report.topVehicles.length)
}
