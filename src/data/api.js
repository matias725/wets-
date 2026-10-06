// Capa de acceso a datos. Las pantallas solo usan estas funciones.
// Para conectar WEST IA real, reemplazar el contenido de cada función por una
// llamada al puente FastAPI (api_bridge.py) manteniendo la misma forma de datos.
import { toast } from 'sonner'
import { date, num } from '@/lib/format'
import { BRANCHES, BRANCH_BY_ID, ALL_BRANCHES } from './branches'
import { ACTIVE_SAP_STATUS, CATEGORY_BY_ID, KANBAN_COLUMNS, VEHICLE_STATUS } from './catalog'
import { COMPANIES, PERSONS, RESPONSIBLES, FALLBACK_RESPONSIBLE } from './people'
import {
  GESTION, META, MANAGEMENT, RESPONSIBLES_BY_BRANCH, STALLED_WITHOUT_OT, TODAY, VEHICLES as BASE_VEHICLES, VISITS, WORK_ORDERS, addDays, iso,
} from './dataset'

export { TODAY, iso, addDays, META }
export const isRealData = META.source === 'sap'

// ------------------------------------------------------------ estado + persistencia
// Claves separadas para datos reales y demostración: la gestión de uno no se mezcla con el otro.
const STORAGE_KEY = isRealData ? 'westia.sap.v1' : 'westia.demo.v2'
const state = {
  management: { ...MANAGEMENT },
  recovery: {},
  visits: VISITS.map((v) => ({ ...v, items: v.items.map((i) => ({ ...i })) })),
  stalled: STALLED_WITHOUT_OT.map((s) => ({ ...s })),
}
// Con datos reales, la gestión vive en este computador (servidor) y el navegador
// guarda solo una copia. Lo que estaba solo en el navegador se traspasa una vez.
const SERVER_STATE = isRealData ? (globalThis.__WEST_WEB_STATE__ ?? null) : null
const isNewer = (a, b) => String(a?.updatedAt ?? '') > String(b?.updatedAt ?? '')
let pendingMigration = false
if (SERVER_STATE) {
  Object.assign(state.management, SERVER_STATE.management || {})
  Object.assign(state.recovery, SERVER_STATE.recovery || {})
  if (Array.isArray(SERVER_STATE.visits)) state.visits = SERVER_STATE.visits
  if (Array.isArray(SERVER_STATE.stalled)) state.stalled = SERVER_STATE.stalled
}
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  if (saved) {
    for (const [ot, m] of Object.entries(saved.management || {})) {
      if (!state.management[ot] || isNewer(m, state.management[ot])) {
        state.management[ot] = m
        pendingMigration = true
      }
    }
    for (const [ot, r] of Object.entries(saved.recovery || {})) {
      if (!(ot in state.recovery)) {
        state.recovery[ot] = r
        pendingMigration = true
      }
    }
    if (Array.isArray(saved.visits) && !Array.isArray(SERVER_STATE?.visits)) {
      state.visits = saved.visits
      pendingMigration = true
    }
    if (Array.isArray(saved.stalled) && !Array.isArray(SERVER_STATE?.stalled)) {
      state.stalled = saved.stalled
      pendingMigration = true
    }
  }
} catch {
  /* almacenamiento no disponible: se trabaja solo en memoria */
}

// Gestión del Excel editable de OT abiertas: se usa salvo que en esta página se
// haya guardado una gestión más nueva que la fecha de corte del Excel.
if (GESTION?.items) {
  const cut = (GESTION.cut || GESTION.processedAt || '').slice(0, 10)
  for (const [ot, item] of Object.entries(GESTION.items)) {
    const local = state.management[ot]
    if (local?.updatedAt && local.updatedAt >= cut) continue
    const { photos: _photos, ...fields } = item
    if (Object.keys(fields).length) state.management[ot] = { ...local, ...fields, updatedAt: cut, source: 'Excel editable' }
  }
}
export const gestionInfo = () => (GESTION ? { file: GESTION.file, cut: GESTION.cut, processedAt: GESTION.processedAt } : null)
export const photosOf = (workOrder) => (GESTION?.items?.[workOrder]?.photos ?? []).map((f) => `/data/fotos/${f}`)

// ------------------------------------------------------------------ flota
// La flota parte con los datos de demostración y puede reemplazarse por una
// importada desde Excel (ver lib/fleetExcel.js). Se guarda aparte porque puede
// ser grande y porque representa datos reales, no gestión de la demo.
const FLEET_KEY = isRealData ? 'westia.fleet.sap.v1' : 'westia.fleet.v1'
const baseMeta = isRealData
  ? { source: 'sap', count: BASE_VEHICLES.length, fileName: META.fileName, importedAt: META.generatedAt, from: META.from, to: META.to, loadedFrom: META.loadedFrom ?? 'file' }
  : { source: 'demo', count: BASE_VEHICLES.length }
let fleet = BASE_VEHICLES
let fleetMeta = baseMeta
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
function notify() {
  version += 1
  listeners.forEach((l) => l())
}
function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* sin persistencia */
  }
  notify()
  schedulePush()
}

// ------------------------------------------------- guardado en el computador
let pushTimer = null
let retryTimer = null
let failedOnce = false
function schedulePush(delay = 400) {
  if (!SERVER_STATE) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, delay)
}
/** Trae lo que guardaron otros navegadores (gana lo más reciente de cada OT). */
function applyServer(remote) {
  let changed = false
  for (const [ot, m] of Object.entries(remote?.management || {})) {
    if (!state.management[ot] || isNewer(m, state.management[ot])) {
      state.management[ot] = m
      changed = true
    }
  }
  for (const [ot, r] of Object.entries(remote?.recovery || {})) {
    if (state.recovery[ot] !== r) {
      state.recovery[ot] = r
      changed = true
    }
  }
  if (changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* sin copia local */
    }
    notify()
  }
}
async function push() {
  clearTimeout(retryTimer)
  try {
    const res = await fetch('/api/estado-web', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    applyServer(await res.json())
    if (failedOnce) {
      failedOnce = false
      toast.success('Gestión guardada en el computador', { description: 'Se recuperó la conexión con el servidor de WEST IA' })
    }
  } catch {
    if (!failedOnce) {
      failedOnce = true
      toast.warning('La gestión quedó solo en este navegador', { description: 'No hay conexión con el servidor de WEST IA; se reintentará sola' })
    }
    retryTimer = setTimeout(push, 15_000)
  }
}
async function pull() {
  try {
    const res = await fetch('/api/estado-web', { cache: 'no-store' })
    if (res.ok) applyServer(await res.json())
  } catch {
    /* sin servidor por ahora */
  }
}
if (SERVER_STATE) {
  if (pendingMigration) schedulePush(1500)
  setInterval(pull, 60_000)
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

/** Nombres usados como responsable en la gestión de OT, ordenados por uso. */
export function knownResponsibles() {
  const count = {}
  Object.values(state.management).forEach((m) => m?.responsible && (count[m.responsible] = (count[m.responsible] ?? 0) + 1))
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([n]) => n)
}

export function responsiblesFor(branchId) {
  // Con datos SAP: quienes generan OT en esa sucursal.
  if (RESPONSIBLES_BY_BRANCH) return [...(RESPONSIBLES_BY_BRANCH[branchId] ?? []), FALLBACK_RESPONSIBLE]
  const zone = BRANCH_BY_ID[branchId]?.zone ?? 'centro'
  return [...RESPONSIBLES[zone], FALLBACK_RESPONSIBLE]
}

// Índice de OT por patente: evita recorrer miles de OT por cada vehículo.
const ordersByPlate = new Map()
WORK_ORDERS.forEach((o) => {
  if (!ordersByPlate.has(o.plate)) ordersByPlate.set(o.plate, [])
  ordersByPlate.get(o.plate).push(o)
})

/**
 * Ritmo de uso (km por día) según el kilometraje de sus OT: entre la primera y
 * la última con al menos 30 días de diferencia. Sin dos OT así, o con un ritmo
 * imposible (error de digitación), no hay estimación.
 */
const usageByPlate = new Map()
ordersByPlate.forEach((list, plate) => {
  const ots = list.filter((o) => o.mileage > 0 && o.receivedDate).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))
  const last = ots.at(-1)
  if (!last) return
  const lastDate = new Date(last.receivedDate + 'T00:00:00')
  const first = ots.find((o) => (lastDate - new Date(o.receivedDate + 'T00:00:00')) / DAY >= 30)
  if (!first) return
  const kmPerDay = (last.mileage - first.mileage) / ((lastDate - new Date(first.receivedDate + 'T00:00:00')) / DAY)
  if (kmPerDay > 0 && kmPerDay < 1500) usageByPlate.set(plate, { kmPerDay, lastKmDate: last.receivedDate })
})

// ---------------------------------------------------------------------- flota
/**
 * Vehículos de la flota. Por defecto excluye los usados / en venta, que no
 * forman parte de la flota operativa (sí se ven en Flota con includeSold).
 */
export function getVehicles(branchId = ALL_BRANCHES, { includeSold = false } = {}) {
  return fleet.filter(inBranch(branchId)).filter((v) => includeSold || v.status !== 'sold').map(enrichVehicle)
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
  fleet = BASE_VEHICLES
  fleetIndex = new Map(fleet.map((v) => [v.plate, v]))
  fleetMeta = baseMeta
  try {
    localStorage.removeItem(FLEET_KEY)
  } catch {
    /* nada */
  }
  commit()
}

/** Km de hoy y días para la mantención, estimados con el ritmo de uso (null si no hay ritmo). */
function usageForecast(v) {
  const u = usageByPlate.get(v.plate)
  if (!u || !v.mileage) return { kmPerDay: null, estMileage: null, estDaysToMaintenance: null, estDueDate: null }
  const estMileage = Math.max(v.mileage, Math.round(v.mileage + u.kmPerDay * daysBetween(u.lastKmDate)))
  const days = Math.round((v.nextMaintenanceKm - estMileage) / u.kmPerDay)
  return { kmPerDay: u.kmPerDay, estMileage, estDaysToMaintenance: days, estDueDate: iso(new Date(TODAY.getTime() + days * DAY)) }
}

function enrichVehicle(v) {
  return {
    ...usageForecast(v),
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
  const history = (ordersByPlate.get(plate) ?? [])
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
    branch: o.branchId ? branchName(o.branchId) : o.branchRaw || 'Sin sucursal',
    client: o.clientId ? clientName(o.clientId) : o.clientName || 'Sin cliente',
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
        photos: photosOf(o.workOrder),
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
    source: 'WEST IA web',
    // fecha y hora: si dos personas editan la misma OT, gana el cambio más reciente
    updatedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 19),
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
      let tires = 0
      let equipment = 0
      // SAP: cada línea trae su clase del catálogo de repuestos (o si es preventiva); demo: por código.
      o.lines.forEach((l) => {
        if (l.cls === 'N') tires += l.total
        else if (l.cls === 'E') equipment += l.total
        else if (l.prev ?? PREVENTIVE_CODES.test(l.code)) preventive += l.total
        else corrective += l.total
      })
      const charge = recovery === 'A cobro' ? o.totalCost : 0
      if (charge) {
        preventive = 0
        corrective = 0
        tires = 0
        equipment = 0
      }
      const v = vehicleByPlate(o.plate)
      return {
        workOrder: o.workOrder,
        plate: o.plate,
        date: o.closedDate || o.receivedDate,
        month: (o.closedDate || o.receivedDate).slice(0, 7),
        branchId: o.branchId,
        branch: o.branchId ? branchName(o.branchId) : o.branchRaw || 'Sin sucursal',
        client: o.clientId ? clientName(o.clientId) : o.clientName || 'Sin cliente',
        area: o.area,
        interventionType: o.interventionType,
        reason: o.reason,
        category: v?.category,
        // preparación o equipamiento de unidades para clientes y faenas: no es falla
        preparation: isPreparation(o),
        total: o.totalCost,
        preventive,
        corrective,
        tires,
        equipment,
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

// ---------------------------------------------------------- alertas y rankings
export const isPreventiveLine = (l) => l.prev ?? PREVENTIVE_CODES.test(l.code)
const inRange = (d, from, to) => Boolean(d) && (!from || d >= from) && (!to || d <= to)
const ACCIDENT_TYPES = new Set(['DYP', 'Compañía de seguros'])
// OT de preparación / equipamiento para un cliente o faena (grúas, kits mineros,
// unidad nueva). Es inversión, no falla: no cuenta para sugerir la venta.
const PREPARATION_RE = /\b(PREPARACI[OÓ]N|EQUIPAMIENTO|HABILITACI[OÓ]N|IMPLEMENTACI[OÓ]N|ALISTAMIENTO)\b/i
export const isPreparation = (o) => o.interventionType === 'Equipamiento unidades nuevas' || PREPARATION_RE.test(o.reason)

/** OT abiertas con N días o más, con su responsable (el registrado o el sugerido de la sucursal). */
export function getStalledOrders(branchId = ALL_BRANCHES, minDays = 15) {
  return getOpenWorkOrders(branchId)
    .filter((o) => o.daysOpen >= minDays)
    .map((o) => ({
      ...o,
      owner: o.management.responsible || responsiblesFor(o.branchId)[0],
      ownerSuggested: !o.management.responsible,
    }))
}

/** Vehículos operativos a los que les toca (o ya se les pasó) la mantención preventiva. */
export function getMaintenanceDue(branchId = ALL_BRANCHES, withinKm = 1000) {
  return getVehicles(branchId)
    .filter((v) => v.status !== 'out' && v.mileage > 0 && v.kmToMaintenance <= withinKm)
    .sort((a, b) => a.kmToMaintenance - b.kmToMaintenance)
}

/**
 * Mantenciones de los próximos N días. Con ritmo de uso se estima la fecha;
 * sin él, se usa el kilometraje registrado (faltan 1.000 km o menos).
 * due: 'late' (ya se pasó) · 'soon' (dentro del plazo).
 */
export function getMaintenanceForecast(branchId = ALL_BRANCHES, withinDays = 30) {
  return getVehicles(branchId)
    .filter((v) => v.status !== 'out' && v.mileage > 0)
    .map((v) => {
      const estimated = v.estDaysToMaintenance != null
      const late = estimated ? v.estDaysToMaintenance < 0 : v.kmToMaintenance < 0
      const soon = estimated ? v.estDaysToMaintenance <= withinDays : v.kmToMaintenance <= 1000
      return { ...v, estimated, due: late ? 'late' : soon ? 'soon' : null }
    })
    .filter((v) => v.due)
    .sort((a, b) => (a.estDaysToMaintenance ?? a.kmToMaintenance / 100) - (b.estDaysToMaintenance ?? b.kmToMaintenance / 100))
}

/**
 * Gasto por vehículo en el período (OT recibidas entre from y to).
 * advice: 'sell' (evaluar venta) · 'review' (revisar) · '' — comparando con el
 * promedio de su categoría en toda la flota.
 */
export function getCostRanking(branchId = ALL_BRANCHES, { from, to } = {}) {
  const map = new Map()
  for (const o of WORK_ORDERS) {
    if (!inRange(o.receivedDate, from, to)) continue
    const v = vehicleByPlate(o.plate)
    if (!v || v.status === 'sold' || v.status === 'out') continue
    let r = map.get(o.plate)
    if (!r) map.set(o.plate, (r = { plate: o.plate, v, orders: 0, correctiveOrders: 0, total: 0, preventive: 0, corrective: 0, tires: 0, equipment: 0, accident: 0, preparation: 0, spend: 0 }))
    r.orders += 1
    r.total += o.totalCost
    if (isPreparation(o)) {
      r.preparation += o.totalCost
      continue
    }
    r.spend += o.totalCost
    if (ACCIDENT_TYPES.has(o.interventionType)) r.accident += o.totalCost
    else
      o.lines.forEach((l) => {
        if (l.cls === 'N') r.tires += l.total
        else if (l.cls === 'E') r.equipment += l.total
        else if (isPreventiveLine(l)) r.preventive += l.total
        else r.corrective += l.total
      })
    if (o.interventionType.includes('Correctiva')) r.correctiveOrders += 1
  }
  const all = [...map.values()]
  const avg = {}
  all.forEach((r) => {
    const a = (avg[r.v.category] ??= { sum: 0, n: 0 })
    a.sum += r.spend
    a.n += 1
  })
  const year = TODAY.getFullYear()
  return all
    .filter((r) => inBranch(branchId)(r.v))
    .map((r) => {
      const ev = enrichVehicle(r.v)
      const categoryAvg = avg[r.v.category].sum / avg[r.v.category].n
      const ratio = categoryAvg ? r.spend / categoryAvg : 0
      const age = r.v.year ? year - r.v.year : null
      const worn = (age != null && age >= 4) || r.v.mileage >= 150_000
      const advice = ratio >= 3 && worn ? 'sell' : ratio >= 3 || r.correctiveOrders >= 8 ? 'review' : ''
      const { v: _v, ...rest } = r
      return {
        ...rest,
        vehicle: `${ev.brand} ${ev.model}`,
        year: r.v.year,
        age,
        mileage: r.v.mileage,
        branchId: r.v.branchId,
        branch: ev.branch,
        category: ev.categoryLabel,
        categoryAvg,
        ratio,
        costPerKm: r.v.mileage > 0 ? r.spend / r.v.mileage : 0,
        advice,
      }
    })
    .sort((a, b) => b.spend - a.spend || b.total - a.total)
}

/**
 * Días detenido en taller por vehículo en un período. Une los períodos de sus OT
 * (ingreso → cierre, o hoy si sigue abierta) para no contar dos veces los días
 * en que tuvo más de una OT a la vez. Por defecto sin OT de preparación.
 */
export function getWorkshopDays(branchId = ALL_BRANCHES, { from, to, includePreparation = false } = {}) {
  const start = new Date((from || '2000-01-01') + 'T00:00:00').getTime()
  const end = Math.min(new Date((to || iso(TODAY)) + 'T00:00:00').getTime() + DAY, TODAY.getTime() + DAY)
  const periodDays = Math.max(1, Math.round((end - start) / DAY))
  const rows = []
  for (const [plate, list] of ordersByPlate) {
    const v = vehicleByPlate(plate)
    if (!v || v.status === 'sold' || !inBranch(branchId)(v)) continue
    const spans = []
    let orders = 0
    let open = null
    let trimmed = 0
    const ots = list.filter((o) => o.receivedDate && (includePreparation || !isPreparation(o)))
    for (const o of ots) {
      const active = ACTIVE_SAP_STATUS.has(o.sapStatus)
      // terminada en SAP pero sin fecha de cierre: no se sabe cuánto duró
      if (!active && !o.closedDate) continue
      const from0 = new Date(o.receivedDate + 'T00:00:00').getTime()
      let to0 = active ? TODAY.getTime() + DAY : new Date(o.closedDate + 'T00:00:00').getTime()
      let cut = false
      // OT que siguió abierta en SAP mientras el vehículo circulaba: si en ese lapso
      // el vehículo vuelve a ingresar con más km, la estadía terminó antes
      if (o.mileage > 0) {
        const back = ots.find((p) => p !== o && p.receivedDate > o.receivedDate && p.mileage > o.mileage + 300 && new Date(p.receivedDate + 'T00:00:00').getTime() < to0)
        if (back) {
          to0 = new Date(back.receivedDate + 'T00:00:00').getTime()
          trimmed += 1
          cut = true
        }
      }
      const a = Math.max(from0, start)
      const b = Math.min(to0, end)
      if (b <= a) continue
      spans.push([a, b])
      orders += 1
      if (active && !cut && (!open || o.receivedDate < open.receivedDate)) open = o
    }
    if (!spans.length) continue
    spans.sort((x, y) => x[0] - y[0])
    const merged = [spans[0].slice()]
    for (const [a, b] of spans.slice(1)) {
      const last = merged.at(-1)
      if (a <= last[1]) last[1] = Math.max(last[1], b)
      else merged.push([a, b])
    }
    const lengths = merged.map(([a, b]) => Math.round((b - a) / DAY))
    const days = lengths.reduce((s, d) => s + d, 0)
    const ev = enrichVehicle(v)
    rows.push({
      plate,
      vehicle: `${v.brand} ${v.model}`,
      branchId: v.branchId,
      branch: ev.branch,
      client: ev.client,
      category: ev.categoryLabel,
      orders,
      stays: merged.length,
      days,
      share: days / periodDays,
      longest: Math.max(...lengths),
      avgStay: days / merged.length,
      inWorkshop: Boolean(open),
      openSince: open?.receivedDate ?? null,
      openDays: open ? daysBetween(open.receivedDate) : null,
      // OT recortadas porque el vehículo volvió con más km (OT abierta en SAP sin estar detenido)
      trimmed,
    })
  }
  return { periodDays, rows: rows.sort((a, b) => b.days - a.days) }
}

/**
 * OT que habría que cerrar (o revisar) en SAP, con el motivo y la evidencia.
 * Sirve para que los talleres ordenen el SAP: sin esto, los días en taller y
 * los reportes salen inflados.
 */
export const CLOSE_REASONS = {
  released: { label: 'Unidad liberada según gestión', action: 'Cerrar la OT en SAP', priority: 1 },
  finished: { label: 'Finalizada sin fecha de cierre', action: 'Cerrar / facturar en SAP', priority: 2 },
  superseded: { label: 'El vehículo tuvo otra OT después', action: 'Revisar y cerrar si ya salió', priority: 3 },
  stale: { label: 'Más de 60 días abierta y sin costo', action: 'Revisar si sigue vigente', priority: 4 },
}
export function getOrdersToClose(branchId = ALL_BRANCHES) {
  const rows = []
  for (const o of WORK_ORDERS) {
    if (!inBranch(branchId)(o)) continue
    const active = ACTIVE_SAP_STATUS.has(o.sapStatus)
    const m = { ...EMPTY_MANAGEMENT, ...(state.management[o.workOrder] || {}) }
    let reason = null
    let evidence = ''
    if (active && ['unidad liberada', 'solo pendiente cierre de ot'].includes(m.realStatus.toLowerCase())) {
      reason = 'released'
      evidence = `Estado real: ${m.realStatus}${m.updatedAt ? ` (${date(m.updatedAt)})` : ''}`
    } else if (o.sapStatus === 'Finalizada' && !o.closedDate) {
      reason = 'finished'
      evidence = 'Estado SAP "Finalizada" sin fecha de cierre'
    } else if (active) {
      const later = (ordersByPlate.get(o.plate) ?? []).filter((p) => p !== o && p.receivedDate > o.receivedDate && p.closedDate && !ACTIVE_SAP_STATUS.has(p.sapStatus))
      const back = later.find((p) => o.mileage > 0 && p.mileage > o.mileage + 300) ?? later.at(-1)
      if (back) {
        reason = 'superseded'
        evidence = `OT ${back.workOrder}: ingresó ${date(back.receivedDate)} y se cerró ${date(back.closedDate)}${back.mileage > o.mileage + 300 && o.mileage > 0 ? ` con ${num(back.mileage - o.mileage)} km más` : ''}`
      } else if (o.totalCost === 0 && daysBetween(o.receivedDate) > 60) {
        reason = 'stale'
        evidence = `${daysBetween(o.receivedDate)} días abierta sin repuestos ni mano de obra cargados`
      }
    }
    if (!reason) continue
    const v = vehicleByPlate(o.plate)
    rows.push({
      reason,
      reasonLabel: CLOSE_REASONS[reason].label,
      action: CLOSE_REASONS[reason].action,
      priority: CLOSE_REASONS[reason].priority,
      evidence,
      workOrder: o.workOrder,
      plate: o.plate,
      vehicle: v ? `${v.brand} ${v.model}` : '',
      branch: o.branchId ? branchName(o.branchId) : o.branchRaw || 'Sin sucursal',
      client: o.clientName || '',
      sapStatus: o.sapStatus,
      receivedDate: o.receivedDate,
      daysOpen: daysBetween(o.receivedDate),
      createdBy: o.createdBy || '',
      responsible: m.responsible || '',
      totalCost: o.totalCost,
      reasonText: o.reason,
    })
  }
  return rows.sort((a, b) => a.priority - b.priority || a.branch.localeCompare(b.branch) || b.daysOpen - a.daysOpen)
}

/**
 * Repuestos correctivos cambiados otra vez en el mismo vehículo en poco tiempo.
 * - 'warranty': componente que no debería volver a fallar pronto, repetido en
 *   ≤ 90 días → posible re-trabajo o garantía (proveedor / mano de obra).
 * - 'wear': pieza de desgaste repetida en ≤ 30 días → desgaste acelerado.
 * Se cuenta la segunda OT cuando su ingreso cae en el período.
 */
const WEAR_PART = /PASTILLA|BALATA|TUERCA|PERNO|CHAVETA|REPAR\.? NEUM|PARCHE|PLUMILLA|AMPOLLETA|FUSIBLE|GOLILLA|ABRAZADERA|BROCHE|SEGURO|TORNILLO/i
const SERVICE_CODE = /^(SERV|MO|INGRESO|HH|LAV|TRASLADO|FLETE)/i
export function getRepeatRepairs(branchId = ALL_BRANCHES, { from, to } = {}) {
  const pairs = []
  for (const [plate, list] of ordersByPlate) {
    const byPart = new Map()
    for (const o of list) {
      if (!o.receivedDate || isPreparation(o)) continue
      for (const l of o.lines) {
        const corrective = l.cls ? l.cls === 'C' : !isPreventiveLine(l)
        if (!corrective || l.total <= 0 || SERVICE_CODE.test(l.code) || /^SERV/i.test(l.description)) continue
        const key = String(l.code).toUpperCase()
        if (!byPart.has(key)) byPart.set(key, new Map())
        const seen = byPart.get(key)
        // una entrada por OT (si la OT trae la pieza en varias líneas, se suman)
        const prev = seen.get(o.workOrder)
        seen.set(o.workOrder, prev ? { ...prev, total: prev.total + l.total, qty: prev.qty + (l.qty || 0) } : { o, l, total: l.total, qty: l.qty || 0 })
      }
    }
    for (const [code, seen] of byPart) {
      const items = [...seen.values()].sort((a, b) => a.o.receivedDate.localeCompare(b.o.receivedDate))
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1]
        const b = items[i]
        if (!inRange(b.o.receivedDate, from, to)) continue
        const days = Math.round((new Date(b.o.receivedDate + 'T00:00:00') - new Date(a.o.receivedDate + 'T00:00:00')) / DAY)
        const wear = WEAR_PART.test(b.l.description)
        if (days <= 0 || days > (wear ? 30 : 90)) continue
        const v = vehicleByPlate(plate)
        if (!inBranch(branchId)(b.o)) continue
        pairs.push({
          kind: wear ? 'wear' : 'warranty',
          plate,
          vehicle: v ? `${v.brand} ${v.model}` : '',
          code,
          part: b.l.description,
          days,
          km: a.o.mileage > 0 && b.o.mileage > a.o.mileage ? b.o.mileage - a.o.mileage : null,
          firstOrder: a.o.workOrder,
          firstDate: a.o.receivedDate,
          firstBranch: a.o.branchId ? branchName(a.o.branchId) : a.o.branchRaw,
          firstCost: a.total,
          secondOrder: b.o.workOrder,
          secondDate: b.o.receivedDate,
          branch: b.o.branchId ? branchName(b.o.branchId) : b.o.branchRaw,
          branchId: b.o.branchId,
          cost: b.total,
          client: b.o.clientName || '',
        })
      }
    }
  }
  pairs.sort((x, y) => y.cost - x.cost)
  // repuestos que más se repiten (posible pieza defectuosa o causa de fondo sin resolver)
  const parts = new Map()
  for (const p of pairs) {
    let r = parts.get(p.code)
    if (!r) parts.set(p.code, (r = { code: p.code, part: p.part, kind: p.kind, repeats: 0, cost: 0, plates: new Set(), branches: {}, days: 0 }))
    r.repeats += 1
    r.cost += p.cost
    r.days += p.days
    r.plates.add(p.plate)
    r.branches[p.branch] = (r.branches[p.branch] ?? 0) + 1
  }
  const partRows = [...parts.values()]
    .map((r) => ({
      ...r,
      plates: r.plates.size,
      avgDays: r.days / r.repeats,
      branches: Object.entries(r.branches).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} (${n})`).join(', '),
    }))
    .sort((a, b) => b.cost - a.cost)
  return { pairs, parts: partRows }
}

/** Indicadores por sucursal para compararlas entre sí (no depende del filtro de sucursal). */
export function getBranchComparison({ from, to } = {}) {
  const spend = {}
  for (const o of WORK_ORDERS) {
    if (!o.branchId || !inRange(o.receivedDate, from, to)) continue
    const s = (spend[o.branchId] ??= { orders: 0, total: 0, corrective: 0 })
    s.orders += 1
    s.total += o.totalCost
    if (!ACCIDENT_TYPES.has(o.interventionType)) o.lines.forEach((l) => !isPreventiveLine(l) && !['N', 'E'].includes(l.cls) && (s.corrective += l.total))
  }
  return BRANCHES.map((b) => {
    const list = fleet.filter((v) => v.branchId === b.id && v.status !== 'sold')
    const workshop = list.filter((v) => v.status === 'workshop').length
    const out = list.filter((v) => v.status === 'out').length
    const open = getOpenWorkOrders(b.id)
    const s = spend[b.id] ?? { orders: 0, total: 0, corrective: 0 }
    return {
      branchId: b.id,
      branch: b.name,
      vehicles: list.length,
      workshop,
      availability: list.length ? (list.length - workshop - out) / list.length : null,
      orders: s.orders,
      total: s.total,
      corrective: s.corrective,
      perVehicle: list.length ? s.total / list.length : null,
      openOrders: open.length,
      avgDays: open.length ? open.reduce((x, o) => x + o.daysOpen, 0) / open.length : null,
      stalled: open.filter((o) => o.daysOpen >= 15).length,
    }
  }).filter((r) => r.vehicles || r.orders)
}

/**
 * Códigos de repuesto / servicio que no están en ningún catálogo de repuestos,
 * agrupados y ordenados por monto (para clasificarlos).
 */
export function getUnclassifiedParts() {
  const map = new Map()
  let total = 0
  for (const o of WORK_ORDERS) {
    for (const l of o.lines) {
      if (l.cls) continue
      const key = String(l.code ?? '').toUpperCase().replace(/\s+/g, '')
      let r = map.get(key)
      if (!r) map.set(key, (r = { code: l.code, descriptions: {}, amount: 0, qty: 0, lines: 0, orders: new Set(), plates: new Set(), models: {}, types: {}, last: '' }))
      r.descriptions[l.description] = (r.descriptions[l.description] ?? 0) + 1
      r.amount += l.total
      r.qty += l.qty || 0
      r.lines += 1
      r.orders.add(o.workOrder)
      r.plates.add(o.plate)
      const v = vehicleByPlate(o.plate)
      if (v) r.models[`${v.brand} ${v.model}`] = (r.models[`${v.brand} ${v.model}`] ?? 0) + 1
      r.types[o.interventionType] = (r.types[o.interventionType] ?? 0) + 1
      if ((o.receivedDate ?? '') > r.last) r.last = o.receivedDate
      total += l.total
    }
  }
  const top = (obj, n = 1) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  let acc = 0
  return [...map.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((r) => {
      acc += r.amount
      return {
        code: r.code,
        description: top(r.descriptions)[0] ?? '',
        amount: r.amount,
        qty: r.qty,
        orders: r.orders.size,
        plates: r.plates.size,
        models: top(r.models, 2).join(' · '),
        type: top(r.types)[0] ?? '',
        last: r.last,
        share: total ? r.amount / total : 0,
        cumulative: total ? acc / total : 0,
      }
    })
}

/** Meses con OT (AAAA-MM), del más reciente al más antiguo. */
export function getAvailableMonths() {
  const set = new Set()
  WORK_ORDERS.forEach((o) => {
    if (o.receivedDate) set.add(o.receivedDate.slice(0, 7))
    if (o.closedDate) set.add(o.closedDate.slice(0, 7))
  })
  return [...set].sort().reverse()
}

/** Datos del informe mensual para gerencia. */
export function getMonthlyReport(month) {
  const from = `${month}-01`
  const to = `${month}-31`
  const received = WORK_ORDERS.filter((o) => inRange(o.receivedDate, from, to))
  const closed = WORK_ORDERS.filter((o) => !ACTIVE_SAP_STATUS.has(o.sapStatus) && inRange(o.closedDate, from, to))
  const monthRows = getExpenseRows(ALL_BRANCHES).filter((e) => e.month === month)
  // la preparación de unidades no es gasto de mantención: se informa aparte
  const expenses = monthRows.filter((e) => !e.preparation)
  const vehicles = getVehicles(ALL_BRANCHES)
  const down = vehicles.filter((v) => v.status === 'workshop' || v.status === 'out').length
  const open = getOpenWorkOrders(ALL_BRANCHES)
  const byType = {}
  expenses.forEach((e) => (byType[e.interventionType] = (byType[e.interventionType] ?? 0) + e.total))
  return {
    month,
    generatedAt: iso(TODAY),
    source: META.source === 'sap' ? META.fileName : 'Datos de demostración',
    summary: {
      fleet: vehicles.length,
      availability: vehicles.length ? (vehicles.length - down) / vehicles.length : 0,
      received: received.length,
      closed: closed.length,
      spend: expenses.reduce((s, e) => s + e.total, 0),
      preventive: expenses.reduce((s, e) => s + e.preventive, 0),
      corrective: expenses.reduce((s, e) => s + e.corrective, 0),
      preparation: monthRows.filter((e) => e.preparation).reduce((s, e) => s + e.total, 0),
      openNow: open.length,
      stalledNow: open.filter((o) => o.daysOpen >= 15).length,
    },
    byType: Object.entries(byType).map(([type, total]) => ({ type, total })).sort((a, b) => b.total - a.total),
    branches: getBranchComparison({ from, to }).sort((a, b) => b.total - a.total),
    topVehicles: getCostRanking(ALL_BRANCHES, { from, to }).slice(0, 20),
    open,
    maintenance: getMaintenanceDue(ALL_BRANCHES, 1000),
  }
}

// --------------------------------------------------------------- notificaciones
export function getNotifications(branchId = ALL_BRANCHES) {
  const open = getOpenWorkOrders(branchId)
  const list = []
  const overdue = open.filter((o) => o.flags.overdue)
  if (overdue.length) list.push({ id: 'overdue', tone: 'danger', title: `${overdue.length} compromisos vencidos`, detail: 'OT con fecha de compromiso cumplida y unidad aún detenida', to: '/ot?filtro=overdue' })
  const long = open.filter((o) => o.daysOpen > 30)
  if (long.length) list.push({ id: 'long', tone: 'danger', title: `${long.length} unidades con más de 30 días en taller`, detail: 'Ver responsables por sucursal', to: '/alertas?vista=ot' })
  const noMg = open.filter((o) => o.flags.noManagement)
  if (noMg.length) list.push({ id: 'nomg', tone: 'warning', title: `${noMg.length} OT sin gestión`, detail: 'Sin responsable, prioridad ni estado real', to: '/ot?filtro=noManagement' })
  const maint = fleet.filter(inBranch(branchId)).filter((v) => v.status !== 'sold' && v.mileage > 0 && v.nextMaintenanceKm - v.mileage < 0)
  if (maint.length) list.push({ id: 'maint', tone: 'warning', title: `${maint.length} mantenciones vencidas por kilometraje`, detail: 'Programar ingreso preventivo', to: '/alertas?vista=mant' })
  const highCost = getCostRanking(branchId, { from: `${TODAY.getFullYear()}-01-01` }).filter((r) => r.advice === 'sell')
  if (highCost.length) list.push({ id: 'sell', tone: 'warning', title: `${highCost.length} vehículos para evaluar venta`, detail: 'Gasto del año muy sobre el promedio de su categoría', to: '/alertas?vista=gasto' })
  const docs = fleet.filter(inBranch(branchId)).flatMap((v) => (v.documents ?? []).filter((d) => d.expiresAt < iso(TODAY)))
  if (docs.length) list.push({ id: 'docs', tone: 'danger', title: `${docs.length} documentos vencidos`, detail: 'Revisión técnica, permiso, SOAP o seguro', to: '/flota?documentos=vencidos' })
  return list
}

export { BRANCHES, ALL_BRANCHES, COMPANIES, PERSONS }
