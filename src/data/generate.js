// Generador determinista de datos FICTICIOS. Misma semilla => mismos datos.
// La forma de cada registro sigue las tablas de WEST IA de escritorio
// (sap_fleet, sap_work_orders, sap_ot_lines, open_ot_management, branch_visits)
// para reemplazar este archivo por llamadas a la API sin tocar las pantallas.
import { BRANCHES } from './branches'
import { MODELS, VEHICLE_DOCUMENTS } from './catalog'
import { COMPANIES, PERSONS, RESPONSIBLES } from './people'

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20261005)
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min
const pick = (list) => list[Math.floor(rand() * list.length)]
const chance = (p) => rand() < p
function weighted(items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0)
  let r = rand() * total
  for (const it of items) {
    r -= weightOf(it)
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

export const TODAY = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()
export const iso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const addDays = (d, n) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// --------------------------------------------------------------- vehículos
const PLATE_LETTERS = 'BCDFGHJKLPRSTVWXYZ'
const usedPlates = new Set()
function newPlate() {
  for (;;) {
    const p = Array.from({ length: 4 }, () => pick(PLATE_LETTERS)).join('') + '-' + String(int(10, 99))
    if (!usedPlates.has(p)) {
      usedPlates.add(p)
      return p
    }
  }
}

const branchWeight = (b) => {
  if (b.hq) return 4
  if (b.zone === 'norte') return b.name.startsWith('APT') ? 3 : 4
  if (b.name.startsWith('APT')) return 2.4
  return 1.6
}

const STATUS_PLAN = [
  ...Array(9).fill('workshop'),
  ...Array(3).fill('out'),
  ...Array(24).fill('rented'),
  ...Array(5).fill('reserved'),
  ...Array(4).fill('cleaning'),
  ...Array(15).fill('available'),
]

function vinFor(i) {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  return '9BR' + Array.from({ length: 14 }, (_, k) => chars[(i * 31 + k * 17 + int(0, 32)) % chars.length]).join('')
}

export const VEHICLES = STATUS_PLAN.map((status, i) => {
  const branch = weighted(BRANCHES, branchWeight)
  const model = weighted(MODELS, (m) => m.weight * (branch.zone === 'norte' ? m.north : 1))
  const year = int(2020, 2025)
  const age = TODAY.getFullYear() - year + rand()
  const yearlyKm = model.category.startsWith('pickup') ? int(32_000, 52_000) : int(16_000, 30_000)
  const mileage = Math.round(Math.max(1_200, age * yearlyKm) / 10) * 10
  const interval = model.fuel === 'Diésel' ? 10_000 : 10_000
  let nextMaintenanceKm = Math.ceil(mileage / interval) * interval
  if (chance(0.12)) nextMaintenanceKm -= interval // mantención vencida
  const company = model.category.startsWith('pickup') && chance(branch.zone === 'norte' ? 0.75 : 0.35)
    ? pick(COMPANIES.filter((c) => c.zone === branch.zone || c.zone === 'centro') || COMPANIES)
    : null
  // Las unidades en taller también tienen cliente: quedaron detenidas durante un arriendo.
  const client = company ?? (['rented', 'reserved', 'workshop', 'out'].includes(status) && chance(0.85) ? pick(PERSONS) : null)
  const documents = VEHICLE_DOCUMENTS.map((name) => ({
    name,
    expiresAt: iso(addDays(TODAY, int(-25, 330))),
  }))
  return {
    plate: newPlate(),
    vin: vinFor(i),
    brand: model.brand,
    model: model.model,
    category: model.category,
    year,
    transmission: model.transmission,
    fuel: model.fuel,
    branchId: branch.id,
    status,
    mileage,
    nextMaintenanceKm,
    dailyRate: model.price,
    clientId: client?.id ?? null,
    area: company ? 'LOP' : 'RAC',
    documents,
  }
})

// --------------------------------------------------------- órdenes de trabajo
const LINES = {
  Preventiva: [
    ['ACE-1040', 'Aceite motor 10W40 (litro)', 9_800, [5, 7]],
    ['FIL-0001', 'Filtro de aceite', 14_500, [1, 1]],
    ['FIL-0102', 'Filtro de aire', 21_900, [1, 1]],
    ['FIL-0215', 'Filtro de combustible', 32_400, [1, 1]],
    ['MO-0001', 'Mano de obra mantención', 48_000, [1, 1]],
    ['SRV-0040', 'Revisión 40 puntos', 25_000, [1, 1]],
  ],
  Correctiva: [
    ['FRE-0220', 'Pastillas de freno delanteras', 64_900, [1, 1]],
    ['FRE-0310', 'Disco de freno delantero', 89_000, [2, 2]],
    ['EMB-0310', 'Kit de embrague', 418_000, [1, 1]],
    ['SUS-0110', 'Amortiguador delantero', 97_500, [2, 2]],
    ['BAT-0075', 'Batería 12V 75Ah', 119_900, [1, 1]],
    ['ELE-0210', 'Alternador', 386_000, [1, 1]],
    ['ROD-0042', 'Rodamiento de rueda', 74_300, [1, 2]],
    ['INY-0007', 'Inyector diésel', 298_000, [1, 2]],
    ['DIR-0150', 'Terminal de dirección', 46_800, [2, 2]],
    ['MO-0002', 'Mano de obra mecánica', 62_000, [1, 3]],
  ],
  DYP: [
    ['DYP-0010', 'Desabolladura panel', 85_000, [1, 3]],
    ['DYP-0020', 'Pintura panel', 120_000, [1, 3]],
    ['DYP-0105', 'Parachoque delantero', 210_000, [1, 1]],
    ['MO-0003', 'Mano de obra DyP', 70_000, [1, 2]],
  ],
  'Taller externo': [
    ['EXT-0001', 'Servicio taller externo', 260_000, [1, 1]],
    ['EXT-0002', 'Diagnóstico en concesionario', 85_000, [1, 1]],
    ['VID-0001', 'Parabrisas', 340_000, [1, 1]],
  ],
  'Compañía de seguros': [
    ['SEG-0001', 'Reparación siniestro (liquidación)', 980_000, [1, 1]],
    ['SEG-0002', 'Deducible', 250_000, [1, 1]],
  ],
  Lavado: [['LAV-0001', 'Lavado y sanitización', 18_000, [1, 1]]],
  'Equipamiento unidades nuevas': [
    ['EQM-0010', 'Barra antivuelco interior', 640_000, [1, 1]],
    ['EQM-0020', 'Baliza ámbar', 89_000, [1, 1]],
    ['EQM-0030', 'Pértiga con banderín', 54_000, [1, 1]],
    ['EQM-0040', 'Extintor y botiquín', 68_000, [1, 1]],
  ],
}

const REASONS = {
  Preventiva: (km) => [`Mantención ${Math.max(10, Math.round(km / 10_000) * 10)}.000 km`, 'Mantención según pauta del fabricante'],
  Correctiva: () => ['Ruido en frenos delanteros', 'Pérdida de potencia', 'Testigo de motor encendido', 'Vibración al frenar', 'Falla en partida', 'Embrague patina', 'Fuga de aceite', 'Ruido en suspensión'],
  DYP: () => ['Choque leve parachoque trasero', 'Rayón en puerta lateral', 'Abolladura por granizo'],
  'Taller externo': () => ['Cambio de parabrisas por piedra', 'Diagnóstico electrónico en concesionario', 'Garantía de fábrica'],
  'Compañía de seguros': () => ['Siniestro con tercero, en liquidación', 'Choque en estacionamiento, liquidación en curso'],
  Lavado: () => ['Lavado profundo post arriendo'],
  'Equipamiento unidades nuevas': () => ['Instalación de kit minero'],
  'Preventiva + Correctiva': (km) => [`Mantención ${Math.max(10, Math.round(km / 10_000) * 10)}.000 km y ruido en frenos`, 'Mantención y cambio de batería'],
}

function buildLines(type) {
  const source =
    type === 'Preventiva + Correctiva'
      ? [...LINES.Preventiva.slice(0, 3), pick(LINES.Correctiva), LINES.Correctiva[9]]
      : type === 'Preventiva'
        ? LINES.Preventiva.filter(() => chance(0.85))
        : LINES[type].filter((_, k) => k === 0 || chance(0.55))
  const lines = (source.length ? source : [LINES[type === 'Preventiva + Correctiva' ? 'Preventiva' : type][0]]).map(
    ([code, description, unit, [qmin, qmax]]) => {
      const qty = int(qmin, qmax)
      const unitCost = Math.round((unit * (0.9 + rand() * 0.25)) / 100) * 100
      return { code, description, qty, unitCost, total: qty * unitCost }
    },
  )
  return lines
}

function typeFor(vehicle) {
  const pickups = vehicle.category.startsWith('pickup')
  return weighted(
    [
      ['Preventiva', 38],
      ['Correctiva', pickups ? 26 : 18],
      ['Preventiva + Correctiva', 10],
      ['DYP', 8],
      ['Taller externo', 6],
      ['Compañía de seguros', 3],
      ['Lavado', 4],
      ['Equipamiento unidades nuevas', vehicle.category === 'pickup-mining' ? 4 : 0],
    ],
    ([, w]) => w,
  )[0]
}

let otCounter = 4_501_200
const newOT = () => `${(otCounter += int(3, 37))}-01`

function makeWorkOrder(vehicle, date, sapStatus, mileage, branchId) {
  const type = typeFor(vehicle)
  const lines = buildLines(type)
  const recoverable = type === 'DYP' || type === 'Compañía de seguros'
  const recovery = recoverable ? (chance(0.6) ? 'A cobro' : 'Por revisar') : 'No recuperable'
  const closed = sapStatus === 'Finalizada' || sapStatus === 'Facturada'
  return {
    workOrder: newOT(),
    plate: vehicle.plate,
    branchId,
    clientId: vehicle.clientId,
    area: vehicle.area,
    receivedDate: iso(date),
    closedDate: closed ? iso(new Date(Math.min(addDays(date, int(0, 6)), TODAY))) : '',
    sapStatus,
    mileage,
    interventionType: type,
    reason: pick(REASONS[type](mileage)),
    lines,
    totalCost: lines.reduce((s, l) => s + l.total, 0),
    recovery,
  }
}

export const WORK_ORDERS = []
for (const v of VEHICLES) {
  const ageDays = Math.max(120, (TODAY.getFullYear() - v.year) * 365)
  // Cantidad de OT proporcional a la antigüedad (≈ una cada 4–5 meses).
  const count = int(2, Math.min(9, 2 + Math.round(ageDays / 150)))
  const days = Array.from({ length: count }, () => int(3, Math.min(ageDays, 720))).sort((a, b) => b - a)
  days.forEach((d, k) => {
    const km = Math.max(500, Math.round(v.mileage * (1 - d / ageDays) * 0.98 / 10) * 10)
    const sap = d < 25 && chance(0.4) ? 'Finalizada' : 'Facturada'
    WORK_ORDERS.push(makeWorkOrder(v, addDays(TODAY, -d), sap, km || 1_000 + k * 5_000, v.branchId))
  })
  if (v.status === 'workshop' || v.status === 'out') {
    const daysOpen = v.status === 'out' ? int(21, 58) : int(0, 19)
    WORK_ORDERS.push(
      makeWorkOrder(v, addDays(TODAY, -daysOpen), chance(0.35) ? 'No iniciada' : 'Proceso', v.mileage, v.branchId),
    )
  }
}

// Ingresos a taller de hoy (para el panel "Hoy").
const activeToday = WORK_ORDERS.filter((o) => o.sapStatus === 'No iniciada' || o.sapStatus === 'Proceso')
activeToday.slice(0, 2).forEach((o) => {
  o.receivedDate = iso(TODAY)
  o.sapStatus = 'No iniciada'
})

// ----------------------------------------------------- gestión WEST de OT activas
const NEXT_ACTIONS = {
  'Esperando repuesto': 'Confirmar fecha de llegada con proveedor',
  'Trabajando en taller': 'Prueba de ruta y control de calidad',
  'En concesionario': 'Solicitar avance al concesionario',
  'Unidad en taller externo': 'Coordinar retiro desde taller externo',
  'En reparación por cía. de seguros': 'Seguimiento con liquidador',
  'A espera de ingreso a taller': 'Asignar box y mecánico',
  'Solo pendiente cierre de OT': 'Cerrar OT en SAP',
  'Unidad liberada': 'Informar a sucursal para arriendo',
  'Pendiente de documentos': 'Solicitar documentos al cliente',
}

export const MANAGEMENT = {}
activeToday.forEach((o, k) => {
  const zone = BRANCHES.find((b) => b.id === o.branchId)?.zone ?? 'centro'
  if (k % 4 === 3) return // sin gestión registrada
  const realStatus = pick([
    'Esperando repuesto', 'Esperando repuesto', 'Trabajando en taller', 'Trabajando en taller', 'En concesionario',
    'Unidad en taller externo', 'A espera de ingreso a taller', 'Solo pendiente cierre de OT', 'En reparación por cía. de seguros',
    'Unidad liberada', 'Pendiente de documentos',
  ])
  const blocker =
    realStatus === 'Esperando repuesto' ? 'Repuesto'
      : realStatus === 'En concesionario' ? 'Garantía / concesionario'
        : realStatus === 'Unidad en taller externo' ? 'Taller externo'
          : realStatus === 'En reparación por cía. de seguros' ? 'Seguro'
            : realStatus === 'Unidad liberada' || realStatus === 'Solo pendiente cierre de OT' ? 'Sin bloqueo / liberable'
              : realStatus === 'Pendiente de documentos' ? 'Documentación'
                : pick(['Diagnóstico', 'Mano de obra', 'Sin definir'])
  MANAGEMENT[o.workOrder] = {
    realStatus,
    responsible: pick(RESPONSIBLES[zone]),
    commitmentDate: chance(0.75) ? iso(addDays(TODAY, int(-6, 9))) : '',
    priority: weighted([['Crítica', 2], ['Alta', 3], ['Media', 4], ['Baja', 1]], ([, w]) => w)[0],
    blocker,
    nextAction: NEXT_ACTIONS[realStatus] ?? '',
    note: '',
    updatedAt: iso(addDays(TODAY, -int(0, 4))),
  }
})
// Dos compromisos de liberación para hoy (en OT que no ingresaron hoy)
Object.entries(MANAGEMENT)
  .filter(([ot]) => activeToday.find((o) => o.workOrder === ot)?.receivedDate !== iso(TODAY))
  .slice(0, 2)
  .forEach(([, m]) => (m.commitmentDate = iso(TODAY)))

// ------------------------------------------------------------------- visitas
export const VISITS = []
export const STALLED_WITHOUT_OT = []
// Unidades que hoy no tienen OT abierta (sirven como "ya liberadas" en visitas pasadas).
const platesWithOpenOT = new Set(activeToday.map((o) => o.plate))
const idleIn = (branchId) => VEHICLES.filter((v) => v.branchId === branchId && !platesWithOpenOT.has(v.plate))
;['calama', 'antofagasta', 'la-serena'].forEach((branchId, idx) => {
  const ots = activeToday.filter((o) => o.branchId === branchId)
  const zone = BRANCHES.find((b) => b.id === branchId)?.zone ?? 'norte'
  const fake = idleIn(branchId).slice(0, 2).map((v) => ({
    workOrder: newOT(), plate: v.plate, daysOpen: int(6, 25), realStatus: 'Trabajando en taller', responsible: pick(RESPONSIBLES[zone]),
  }))
  VISITS.push({
    id: idx + 1,
    branchId,
    date: iso(addDays(TODAY, -(14 + idx * 3))),
    visitor: 'Mario Zepeda',
    notes: 'Revisión de unidades detenidas con jefatura de sucursal.',
    status: 'Cerrada',
    items: [
      ...fake,
      ...ots.map((o) => ({
        workOrder: o.workOrder,
        plate: o.plate,
        daysOpen: Math.max(0, Math.round((addDays(TODAY, -(14 + idx * 3)) - new Date(o.receivedDate)) / 864e5)),
        realStatus: MANAGEMENT[o.workOrder]?.realStatus ?? 'Pendiente actualizar',
        responsible: MANAGEMENT[o.workOrder]?.responsible ?? '',
      })).filter((it) => it.daysOpen >= 0),
    ].map((it) => ({ ...it, reviewed: true, result: 'NUEVA' })),
  })
})
STALLED_WITHOUT_OT.push({
  id: 1,
  // Una unidad sin OT abierta y que no aparece en la visita (Calama o su aeropuerto).
  plate: [...idleIn('calama').slice(2), ...idleIn('apt-calama'), ...VEHICLES.filter((v) => !platesWithOpenOT.has(v.plate))][0].plate,
  branchId: 'calama',
  detectedAt: iso(addDays(TODAY, -3)),
  reason: 'Detenida por neumático dañado, sin OT creada en SAP',
  responsible: 'Rodrigo Carrasco',
  commitmentDate: iso(addDays(TODAY, 1)),
  status: 'Pendiente',
  visitId: 1,
})
