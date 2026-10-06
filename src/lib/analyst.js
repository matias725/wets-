// Motor local de respuestas del Analista Técnico (demostración).
// En producción se reemplaza por el puente de WEST IA (contexto local + OpenAI).
import {
  ALL_BRANCHES, TODAY, addDays, getExpenseRows, getOpenWorkOrders, getVehicle, getVehicles, iso,
} from '@/data/api'
import { clp, date, km, num } from '@/lib/format'

const PLATE_RE = /\b([A-Za-z]{4})[-\s]?(\d{2})\b/

export const SUGGESTIONS = [
  '¿Qué unidades están críticas?',
  'Resumen de gasto de los últimos 30 días',
  '¿Qué unidades tienen fallas recurrentes?',
  '¿Qué mantenciones están vencidas?',
]

function vehicleAnswer(plate) {
  const v = getVehicle(plate)
  if (!v) return { title: `No encontré la patente ${plate}`, lines: ['Revise el formato (ABCD-12) o búsquela en Flota.'] }
  const since = iso(addDays(TODAY, -365))
  const corrective = v.history.filter((o) => o.receivedDate >= since && o.interventionType.includes('Correctiva'))
  const lines = [
    `${v.brand} ${v.model} ${v.year} · ${v.categoryLabel} · ${v.branch}`,
    `Estado actual: ${v.statusLabel}${v.client ? ` · cliente ${v.client}` : ''}`,
    `Kilometraje ${km(v.mileage)} · ${v.history.length} OT históricas · costo acumulado ${clp(v.totalCost)} (${clp(v.costPerKm)}/km)`,
  ]
  if (v.active.length) {
    const o = v.active[0]
    lines.push(`En taller hace ${o.daysOpen} días por “${o.reason}” (OT ${o.workOrder}).`)
  }
  lines.push(
    v.kmToMaintenance < 0
      ? `Mantención vencida por ${num(-v.kmToMaintenance)} km: conviene programar ingreso preventivo.`
      : `Próxima mantención en ${num(v.kmToMaintenance)} km.`,
  )
  if (corrective.length >= 2) lines.push(`Atención: ${corrective.length} OT correctivas en los últimos 12 meses. Revisar si comparten causa.`)
  const recent = v.history.slice(0, 3).map((o) => `${date(o.receivedDate)} · ${o.reason} · ${clp(o.totalCost)}`)
  return { title: `Expediente ${v.plate}`, lines, list: { label: 'Últimas intervenciones', items: recent }, link: { to: `/flota/${v.plate}`, label: 'Abrir expediente completo' } }
}

function criticalAnswer(branchId) {
  const open = getOpenWorkOrders(branchId)
  const critical = open.filter((o) => o.flags.critical || o.daysOpen > 20)
  return {
    title: `${critical.length} unidades críticas de ${open.length} en taller`,
    lines: [
      'Criterio: prioridad crítica, términos de seguridad (frenos, dirección) o más de 20 días detenidas.',
      `${open.filter((o) => o.flags.overdue).length} tienen el compromiso de liberación vencido.`,
    ],
    list: { label: 'Prioridad de revisión', items: critical.slice(0, 6).map((o) => `${o.plate} · ${o.daysOpen} días · ${o.branch} · ${o.reason}`) },
    link: { to: '/ot?filtro=critical', label: 'Ver en Control OT' },
  }
}

function spendAnswer(branchId) {
  const since = iso(addDays(TODAY, -30))
  const rows = getExpenseRows(branchId).filter((r) => r.date > since)
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0)
  const total = sum((r) => r.total)
  const top = [...rows].sort((a, b) => b.total - a.total).slice(0, 3)
  return {
    title: `Gasto últimos 30 días: ${clp(total)}`,
    lines: [
      `Correctivo ${clp(sum((r) => r.corrective))} · preventivo ${clp(sum((r) => r.preventive))} · a cobro ${clp(sum((r) => r.charge))}`,
      `${rows.length} OT cerradas · ${rows.filter((r) => r.recovery === 'Por revisar').length} pendientes de definir recuperabilidad.`,
    ],
    list: { label: 'OT de mayor monto', items: top.map((r) => `${r.plate} · ${r.reason} · ${clp(r.total)}`) },
    link: { to: '/gastos', label: 'Abrir Control de Gastos' },
  }
}

function recurrenceAnswer(branchId) {
  const since = iso(addDays(TODAY, -365))
  const list = getVehicles(branchId)
    .map((v) => getVehicle(v.plate))
    .map((v) => ({ v, n: v.history.filter((o) => o.receivedDate >= since && o.interventionType.includes('Correctiva')).length }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n)
  return {
    title: `${list.length} unidades con fallas repetidas en 12 meses`,
    lines: ['Varias OT correctivas permiten detectar un patrón, pero no prueban por sí solas una misma causa. Conviene revisar el detalle de cada OT.'],
    list: { label: 'Unidades a revisar', items: list.slice(0, 6).map(({ v, n }) => `${v.plate} · ${n} correctivas · ${v.brand} ${v.model} · ${v.branch}`) },
    link: { to: '/salud', label: 'Ver ranking de recurrencia' },
  }
}

function maintenanceAnswer(branchId) {
  const due = getVehicles(branchId).filter((v) => v.kmToMaintenance < 0).sort((a, b) => a.kmToMaintenance - b.kmToMaintenance)
  const soon = getVehicles(branchId).filter((v) => v.kmToMaintenance >= 0 && v.kmToMaintenance < 1500)
  return {
    title: `${due.length} mantenciones vencidas · ${soon.length} próximas (< 1.500 km)`,
    lines: ['Se calcula con el kilometraje actual y la pauta cada 10.000 km.'],
    list: { label: 'Vencidas', items: due.slice(0, 6).map((v) => `${v.plate} · ${v.brand} ${v.model} · vencida por ${num(-v.kmToMaintenance)} km · ${v.branch}`) },
    link: { to: '/flota?mantencion=vencida', label: 'Ver en Flota' },
  }
}

export function answer(question, branchId = ALL_BRANCHES) {
  const q = question.toLowerCase()
  const plate = question.match(PLATE_RE)
  if (plate) return vehicleAnswer(`${plate[1].toUpperCase()}-${plate[2]}`)
  if (/cr[ií]tic|detenid|taller|atenci/.test(q)) return criticalAnswer(branchId)
  if (/gast|cost|cobro|plata|monto/.test(q)) return spendAnswer(branchId)
  if (/recurren|repet|falla/.test(q)) return recurrenceAnswer(branchId)
  if (/mantenci|preventiv|kilometr|pauta/.test(q)) return maintenanceAnswer(branchId)
  return {
    title: 'Puedo ayudarle con la flota',
    lines: ['Pregunte por una patente (por ejemplo, el expediente de una unidad), unidades críticas, gasto, fallas recurrentes o mantenciones vencidas.'],
  }
}
