// Capa de acceso a datos. Las pantallas solo usan estas funciones.
// Para conectar WEST IA real, reemplazar el contenido de cada función por una
// llamada al puente FastAPI (api_bridge.py) manteniendo la misma forma de datos.
import { BRANCHES, BRANCH_BY_ID, ALL_BRANCHES } from './branches'
import { ACTIVE_SAP_STATUS, CATEGORY_BY_ID, KANBAN_COLUMNS, VEHICLE_STATUS } from './catalog'
import { COMPANIES, PERSONS, RESPONSIBLES, FALLBACK_RESPONSIBLE } from './people'
import {
  MANAGEMENT, STALLED_WITHOUT_OT, TODAY, VEHICLES as DEMO_VEHICLES, VISITS, WORK_ORDERS, addDays, iso,
} from './generate'

export { TODAY, iso, addDays }

// ------------------------------------------------------------ estado + persistencia
const STORAGE_KEY = 'westia.demo.v2'
const state = {
  management: { ...MANAGEMENT },
  recovery: {},
  visits: VISITS.map((v) => ({ ...v, items: v.items.map((i) => ({ ...i })) })),
  stalled: STALLED_WITHOUT_OT.map((s) => ({ ...s })),
}
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  if (saved) {
    Object.assign(state.management, saved.management || {})
    Object.assign(state.recovery, saved.recovery || {})
    if (Array.isArray(saved.visits)) state.visits = saved.visits
    if (Array.isArray(saved.stalled)) state.stalled = saved.stalled
  }
} catch {
  /* almacenamiento no disponible: se trabaja solo en memoria */
}

// ------------------------------------------------------------------ flota
// La flota parte con los datos de demostración y puede reemplazarse por una
// importada desde Excel (ver lib/fleetExcel.js). Se guarda aparte porque puede
// ser grande y porque representa datos reales, no gestión de la demo.
const FLEET_KEY = 'westia.fleet.v1'
let fleet = DEMO_VEHICLES
let fleetMeta = { source: 'demo', count: DEMO_VEHICLES.length }
try {
  const saved = JSON.parse(localStorage.getItem(FLEET_KEY) || 'null')
  if (Array.isArray(saved?.vehicles) && saved.vehicles.length) {
    fleet = saved.vehicles
    fleetMeta = saved.meta
  }
} catch {
  /* almacenamiento no disponible */
}
let fleetIndex = new Map(fleet.map((v) => [v.plate, v]))

let version = 0
const listeners = new Set()
function commit() {
  version += 1
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* sin persistencia */
  }
  listeners.forEach((l) => l())
}
export const store = {
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  getVersion: () => version,
}
export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nada */
  }
  window.location.reload()
}

// ------------------------------------------------------------------- utilidades
const DAY = 864e5
export const daysBetween = (fromIso, to = TODAY) => Math.max(0, Math.round((to - new Date(fromIso + 'T00:00:00')) / DAY))
const inBranch = (branchId) => (x) => branchId === ALL_BRANCHES || x.branchId === branchId

export const clientById = Object.fromEntries([...PERSONS, ...COMPANIES].map((c) => [c.id, c]))
export const vehicleByPlate = (plate) => fleetIndex.get(plate)
export const branchName = (id) => BRANCH_BY_ID[id]?.name ?? 'Sin sucursal'
export const clientName = (id) => clientById[id]?.name ?? 'Sin cliente'

export function responsiblesFor(branchId) {
  const zone = BRANCH_BY_ID[branchId]?.zone ?? 'centro'
  return [...RESPONSIBLES[zone], FALLBACK_RESPONSIBLE]
}

// ---------------------------------------------------------------------- flota
export function getVehicles(branchId = ALL_BRANCHES) {
  return fleet.filter(inBranch(branchId)).map(enrichVehicle)
}

export const getFleetMeta = () => fleetMeta
export const getRawFleet = () => fleet

/**
 * Carga la flota importada desde Excel.
 * mode 'merge': actualiza por patente y agrega las nuevas. 'replace': reemplaza todo.
 * Devuelve { persisted } — false si el navegador no tuvo espacio para guardarla.
 */
export function importFleet(vehicles, mode, meta) {
  if (mode === 'replace') {
    fleet = vehicles
  } else {
    const byPlate = new Map(fleet.map((v) => [v.plate, v]))
    vehicles.forEach((v) => {
      const prev = byPlate.get(v.plate)
      byPlate.set(v.plate, prev ? { ...prev, ...v, documents: v.documents?.length ? v.documents : prev.documents } : v)
    })
    fleet = [...byPlate.values()]
  }
  fleetIndex = new Map(fleet.map((v) => [v.plate, v]))
  fleetMeta = { source: 'excel', count: fleet.length, ...meta }
  let persisted = true
  try {
    localStorage.setItem(FLEET_KEY, JSON.stringify({ meta: fleetMeta, vehicles: fleet }))
  } catch {
    persisted = false
  }
  commit()
  return { persisted }
}

export function resetFleet() {
  fleet = DEMO_VEHICLES
  fleetIndex = new Map(fleet.map((v) => [v.plate, v]))
  fleetMeta = { source: 'demo', count: fleet.length }
  try {
    localStorage.removeItem(FLEET_KEY)
  } catch {
    /* nada */
  }
  commit()
}

function enrichVehicle(v) {
  return {
    ...v,
    branch: v.branchId ? branchName(v.branchId) : v.branchRaw || 'Sin sucursal',
    categoryLabel: CATEGORY_BY_ID[v.category]?.label ?? v.category,
    statusLabel: VEHICLE_STATUS[v.status]?.label ?? v.status,
    client: v.clientId ? clientName(v.clientId) : v.clientName || '',
    documents: v.documents ?? [],
    kmToMaintenance: v.nextMaintenanceKm - v.mileage,
  }
}

export function getVehicle(plate) {
  const v = vehicleByPlate(plate)
  if (!v) return null
  const history = WORK_ORDERS.filter((o) => o.plate === plate)
    .map(enrichWorkOrder)
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  const totalCost = history.reduce((s, o) => s + o.totalCost, 0)
  const active = history.filter((o) => o.active)
  return {
    ...enrichVehicle(v),
    history,
    active,
    totalCost,
    costPerKm: v.mileage > 0 ? totalCost / v.mileage : 0,
    documents: (v.documents ?? []).map((d) => ({ ...d, daysLeft: Math.round((new Date(d.expiresAt + 'T00:00:00') - TODAY) / DAY) })),
  }
}

// ------------------------------------------------------------- órdenes de trabajo
function enrichWorkOrder(o) {
  const active = ACTIVE_SAP_STATUS.has(o.sapStatus)
  return {
    ...o,
    active,
    branch: branchName(o.branchId),
    client: clientName(o.clientId),
    daysOpen: active ? daysBetween(o.receivedDate) : null,
  }
}

const EMPTY_MANAGEMENT = {
  realStatus: 'Pendiente actualizar', responsible: '', commitmentDate: '', priority: 'Sin definir',
  blocker: 'Sin definir', nextAction: '', note: '', updatedAt: '',
}

const SAFETY_TERMS = ['freno', 'dirección', 'direccion', 'airbag', 'incendio', 'sobrecalent']

// Mismas reglas de clasificación que el Control OT abiertas de escritorio.
function flagsFor(o, m) {
  const real = m.realStatus.toLowerCase()
  const blocker = m.blocker.toLowerCase()
  const technical = `${o.reason} ${o.interventionType} ${m.note}`.toLowerCase()
  const released = real === 'unidad liberada' || real === 'solo pendiente cierre de ot'
  return {
    critical: m.priority === 'Crítica' || (SAFETY_TERMS.some((t) => technical.includes(t)) && !released),
    noManagement:
      (!real || real === 'pendiente actualizar') && !m.responsible && !m.nextAction &&
      ['', 'sin definir'].includes(m.priority.toLowerCase()) && ['', 'sin definir'].includes(blocker),
    overdue: Boolean(m.commitmentDate) && m.commitmentDate < iso(TODAY) && real !== 'unidad liberada',
    parts: blocker.includes('repuesto') || real.includes('esperando repuesto'),
    external: ['taller externo', 'concesionario', 'dyp', 'seguro'].some((t) => blocker.includes(t) || real.includes(t)),
    releasable: blocker.includes('sin bloqueo') || released,
  }
}

export function getOpenWorkOrders(branchId = ALL_BRANCHES) {
  return WORK_ORDERS.filter((o) => ACTIVE_SAP_STATUS.has(o.sapStatus))
    .filter(inBranch(branchId))
    .map((o) => {
      const e = enrichWorkOrder(o)
      const m = { ...EMPTY_MANAGEMENT, ...(state.management[o.workOrder] || {}) }
      const v = vehicleByPlate(o.plate)
      return {
        ...e,
        management: m,
        flags: flagsFor(e, m),
        vehicle: v ? `${v.brand} ${v.model}` : '',
        category: v?.category,
        kanban: KANBAN_COLUMNS.find((c) => c.statuses.includes(m.realStatus))?.id ?? 'pending',
      }
    })
    .sort((a, b) => b.daysOpen - a.daysOpen)
}

export function saveManagement(workOrder, patch) {
  state.management[workOrder] = {
    ...EMPTY_MANAGEMENT,
    ...(state.management[workOrder] || {}),
    ...patch,
    updatedAt: iso(new Date()),
  }
  commit()
}

// ------------------------------------------------------------------- gastos
const PREVENTIVE_CODES = /^(ACE|FIL|SRV|MO-0001)/

// Una fila por OT cerrada con su desglose correctivo / preventivo / a cobro.
export function getExpenseRows(branchId = ALL_BRANCHES) {
  return WORK_ORDERS.filter((o) => !ACTIVE_SAP_STATUS.has(o.sapStatus))
    .filter(inBranch(branchId))
    .map((o) => {
      const recovery = state.recovery[o.workOrder] ?? o.recovery
      let preventive = 0
      let corrective = 0
      o.lines.forEach((l) => (PREVENTIVE_CODES.test(l.code) ? (preventive += l.total) : (corrective += l.total)))
      const charge = recovery === 'A cobro' ? o.totalCost : 0
      if (charge) {
        preventive = 0
        corrective = 0
      }
      const v = vehicleByPlate(o.plate)
      return {
        workOrder: o.workOrder,
        plate: o.plate,
        date: o.closedDate || o.receivedDate,
        month: (o.closedDate || o.receivedDate).slice(0, 7),
        branchId: o.branchId,
        branch: branchName(o.branchId),
        client: clientName(o.clientId),
        area: o.area,
        interventionType: o.interventionType,
        reason: o.reason,
        category: v?.category,
        total: o.totalCost,
        preventive,
        corrective,
        charge,
        recovery,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function setRecovery(workOrder, recovery) {
  state.recovery[workOrder] = recovery
  commit()
}

// ------------------------------------------------------------------- visitas
export function getVisits(branchId = ALL_BRANCHES) {
  return state.visits.filter(inBranch(branchId)).slice().sort((a, b) => b.date.localeCompare(a.date))
}

export function getStalledWithoutOT(visitId) {
  return state.stalled.filter((s) => visitId == null || s.visitId === visitId)
}

// Toma la "fotografía" de OT abiertas y la compara con la visita anterior.
export function createVisit({ branchId, date, visitor, notes }) {
  const previous = getVisits(branchId)[0]
  const prevKeys = new Set((previous?.items ?? []).map((i) => i.workOrder))
  const items = getOpenWorkOrders(branchId).map((o) => ({
    workOrder: o.workOrder,
    plate: o.plate,
    daysOpen: o.daysOpen,
    realStatus: o.management.realStatus,
    responsible: o.management.responsible,
    priority: o.management.priority,
    reviewed: false,
    result: prevKeys.has(o.workOrder) ? 'CONTINÚA' : 'NUEVA',
  }))
  const visit = {
    id: Math.max(0, ...state.visits.map((v) => v.id)) + 1,
    branchId,
    date,
    visitor,
    notes: notes || '',
    status: 'Abierta',
    items,
  }
  state.visits.push(visit)
  commit()
  return visit
}

export function compareWithPrevious(visit) {
  const older = state.visits
    .filter((v) => v.branchId === visit.branchId && v.date < visit.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const current = new Set(visit.items.map((i) => i.workOrder))
  return {
    previous: older ?? null,
    released: older ? older.items.filter((i) => !current.has(i.workOrder)) : [],
  }
}

export function setVisitItemReviewed(visitId, workOrder, reviewed) {
  const v = state.visits.find((x) => x.id === visitId)
  const item = v?.items.find((i) => i.workOrder === workOrder)
  if (item) {
    item.reviewed = reviewed
    commit()
  }
}

export function closeVisit(visitId) {
  const v = state.visits.find((x) => x.id === visitId)
  if (v) {
    v.status = 'Cerrada'
    commit()
  }
}

export function addStalledWithoutOT(entry) {
  state.stalled.push({ id: Math.max(0, ...state.stalled.map((s) => s.id)) + 1, status: 'Pendiente', ...entry })
  commit()
}

// ------------------------------------------------------------- búsqueda global
export function searchAll(query) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const results = []
  fleet.forEach((v) => {
    if (v.plate.toLowerCase().replace('-', '').includes(q.replace('-', '')) || `${v.brand} ${v.model}`.toLowerCase().includes(q))
      results.push({ type: 'Vehículo', id: v.plate, title: v.plate, subtitle: `${v.brand} ${v.model} · ${v.branchId ? branchName(v.branchId) : v.branchRaw || "Sin sucursal"}`, to: `/flota/${v.plate}` })
  })
  WORK_ORDERS.forEach((o) => {
    if (o.workOrder.includes(q))
      results.push({ type: 'OT', id: o.workOrder, title: `OT ${o.workOrder}`, subtitle: `${o.plate} · ${o.reason}`, to: `/flota/${o.plate}` })
  })
  ;[...COMPANIES, ...PERSONS].forEach((c) => {
    if (c.name.toLowerCase().includes(q) || c.rut.replace(/\./g, '').includes(q.replace(/\./g, '')))
      results.push({ type: 'Cliente', id: c.id, title: c.name, subtitle: `${c.kind} · ${c.rut}`, to: `/flota?cliente=${encodeURIComponent(c.name)}` })
  })
  return results.slice(0, 12)
}

// --------------------------------------------------------------- notificaciones
export function getNotifications(branchId = ALL_BRANCHES) {
  const open = getOpenWorkOrders(branchId)
  const list = []
  const overdue = open.filter((o) => o.flags.overdue)
  if (overdue.length) list.push({ id: 'overdue', tone: 'danger', title: `${overdue.length} compromisos vencidos`, detail: 'OT con fecha de compromiso cumplida y unidad aún detenida', to: '/ot?filtro=overdue' })
  const long = open.filter((o) => o.daysOpen > 20)
  if (long.length) list.push({ id: 'long', tone: 'danger', title: `${long.length} unidades con más de 20 días`, detail: 'Revisar causa de permanencia en taller', to: '/ot?filtro=gt20' })
  const noMg = open.filter((o) => o.flags.noManagement)
  if (noMg.length) list.push({ id: 'nomg', tone: 'warning', title: `${noMg.length} OT sin gestión`, detail: 'Sin responsable, prioridad ni estado real', to: '/ot?filtro=noManagement' })
  const maint = fleet.filter(inBranch(branchId)).filter((v) => v.nextMaintenanceKm - v.mileage < 0)
  if (maint.length) list.push({ id: 'maint', tone: 'warning', title: `${maint.length} mantenciones vencidas por kilometraje`, detail: 'Programar ingreso preventivo', to: '/flota?mantencion=vencida' })
  const docs = fleet.filter(inBranch(branchId)).flatMap((v) => (v.documents ?? []).filter((d) => d.expiresAt < iso(TODAY)))
  if (docs.length) list.push({ id: 'docs', tone: 'danger', title: `${docs.length} documentos vencidos`, detail: 'Revisión técnica, permiso, SOAP o seguro', to: '/flota?documentos=vencidos' })
  return list
}

export { BRANCHES, ALL_BRANCHES, COMPANIES, PERSONS }
