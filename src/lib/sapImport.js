// Convierte el Excel completo del SAP (maestro de unidades + líneas de OT) en
// los datos que usa WEST IA. Mismas reglas que scripts/convertir_sap.py, pero
// se ejecuta en el navegador: el archivo nunca sale del computador.
// Sin imports con "@/" para poder probarlo también fuera del navegador.
import { readXlsx } from './xlsxReader.js'
import { partKey } from './sapExtras.js'

// Coordenadas aproximadas por sucursal / faena: [nombre, lat, lng, zona]
const PLACES = {
  'taller central': ['Taller Central (La Serena)', -29.9045, -71.2489, 'centro'],
  'la serena': ['La Serena', -29.9045, -71.2489, 'centro'],
  'san geronimo': ['San Gerónimo', -29.93, -71.07, 'centro'],
  teck: ['Teck (Andacollo)', -30.2333, -71.0833, 'centro'],
  andacollo: ['Andacollo', -30.2333, -71.0833, 'centro'],
  hmc: ['HMC (Punitaqui)', -30.8333, -71.2667, 'centro'],
  punitaqui: ['Punitaqui', -30.8333, -71.2667, 'centro'],
  salamanca: ['Salamanca', -31.7797, -70.9636, 'centro'],
  vallenar: ['Vallenar', -28.5708, -70.7581, 'norte'],
  copiapo: ['Copiapó', -27.3668, -70.3322, 'norte'],
  calama: ['Calama', -22.4567, -68.9237, 'norte'],
  antofagasta: ['Antofagasta', -23.6509, -70.3975, 'norte'],
  'san pedro atacama': ['San Pedro de Atacama', -22.9087, -68.1997, 'norte'],
  iquique: ['Iquique', -20.2141, -70.1524, 'norte'],
  arica: ['Arica', -18.4783, -70.3126, 'norte'],
  santiago: ['Santiago', -33.4489, -70.6693, 'centro'],
  concepcion: ['Concepción', -36.827, -73.0503, 'sur'],
  'los angeles': ['Los Ángeles', -37.4693, -72.3527, 'sur'],
  temuco: ['Temuco', -38.7359, -72.5904, 'sur'],
  pucon: ['Pucón', -39.2819, -71.9544, 'sur'],
  'puerto montt': ['Puerto Montt', -41.4693, -72.9424, 'sur'],
}

const ACTIVE = new Set(['no iniciada', 'proceso'])

export const norm = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const text = (v) => (v == null ? '' : typeof v === 'number' && Number.isInteger(v) ? String(v) : String(v).trim())

function num(v) {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}

const pad = (n) => String(n).padStart(2, '0')
function isoDate(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10)
  const s = String(v)
  let m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  m = s.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

function plateOf(v) {
  const raw = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z]{4}\d{2}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4)}`
  if (/^[A-Z]{2}\d{4}$/.test(raw)) return `${raw.slice(0, 2)}-${raw.slice(2)}`
  if (/^[A-Z]{3}\d{3}$/.test(raw)) return `${raw.slice(0, 3)}-${raw.slice(3)}`
  return raw
}

const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-sucursal'
const titleCase = (s) => s.toLowerCase().replace(/(^|[^a-záéíóúñü])([a-záéíóúñü])/g, (_, a, b) => a + b.toUpperCase())

function findHeader(sheet, required, maxRows = 30) {
  for (let i = 0; i < Math.min(maxRows, sheet.rows.length); i++) {
    const heads = Array.from(sheet.rows[i] ?? [], norm)
    if (required.every((r) => heads.includes(r))) {
      const map = {}
      heads.forEach((h, j) => {
        if (h && !(h in map)) map[h] = j
      })
      return { row: i, map }
    }
  }
  return null
}

function categoryOf(desc, model) {
  const d = norm(desc)
  const m = norm(model)
  if ((d + ' ').includes('camioneta 4x4 ') && String(desc).includes('-')) return 'pickup-mining'
  if (d.includes('4x4') || (d.includes('camioneta') && m.includes('4x4'))) return 'pickup-4x4'
  if (d.includes('camioneta')) return 'pickup-4x2'
  if (['minibus', 'bus', 'furgon', 'vans', 'taxibus'].some((k) => d.includes(k))) return 'bus'
  if (d.includes('camion')) return 'truck'
  if (d.includes('station') || d.includes('jeep')) return 'suv'
  if (d.includes('automovil')) return 'sedan'
  return 'other'
}

function classify(lines) {
  const groups = new Set(lines.map((l) => norm(l.group)))
  const descs = lines.map((l) => norm(l.description)).join(' ')
  if (groups.has('s seguro vehiculo') || descs.includes('deducible') || descs.includes('siniestro')) return 'Compañía de seguros'
  if (groups.has('s desabolladura y pintura')) return 'DYP'
  const sub = lines.filter((l) => norm(l.code) !== 'ingresotaller')
  if (!sub.length) return 'Otros'
  if (sub.every((l) => norm(l.group) === 's revision tecnica')) return 'Revisión técnica'
  if (sub.every((l) => norm(l.group).includes('lavado'))) return 'Lavado'
  const prev = sub.some((l) => l.prev)
  const corr = sub.some((l) => !l.prev && ['a repuestos', 'a neumaticos', 'a baterias', 's mano de obra terceros'].includes(norm(l.group)))
  if (prev && corr) return 'Preventiva + Correctiva'
  if (prev) return 'Preventiva'
  if (corr) return 'Correctiva'
  if (sub.every((l) => ['a accesorios', 'a control de unidades', 'a epp'].includes(norm(l.group)))) return 'Equipamiento unidades nuevas'
  return 'Otros'
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * sheets: hojas leídas con readXlsx ([{ name, rows }]). catalog: códigos preventivos (mayúsculas).
 * onProgress(texto, fracción 0..1). Devuelve el mismo objeto que el script de Python.
 */
export async function convertSapSheets(sheets, { fileName = 'SAP.xlsx', catalog = [], parts = {}, onProgress = () => {} } = {}) {
  const cat = new Set(catalog)

  // ------------------------------------------------------------ líneas de OT
  let otWs = null
  let hdr = null
  for (const ws of sheets) {
    const h = findHeader(ws, ['no ot', 'patente', 'costo total'])
    if (h) {
      otWs = ws
      hdr = h
      break
    }
  }
  if (!otWs) throw new Error('No se encontró la hoja de OT (columnas "No OT", "Patente" y "Costo Total").')
  const H = hdr.map
  const col = (r, name) => (name in H ? (r[H[name]] ?? null) : null)
  const descKey = ['descripcion articulo/serv.', 'descripcion articulo/serv', 'descripcion'].find((k) => k in H) ?? Object.keys(H).find((k) => k.startsWith('descripci'))

  // clase de cada línea: el catálogo de repuestos manda (P preventivo, C correctivo,
  // N neumáticos, E equipamiento); si el código no está, la regla anterior
  const lineClass = (code, desc) => {
    const c = parts[partKey(code)]?.c ?? ''
    return { cls: c, prev: c ? c === 'P' : cat.size ? cat.has(code.toUpperCase()) : /filtro|aceite|mantenc|pauta/.test(norm(desc)) }
  }
  const orders = new Map()
  const total = otWs.rows.length
  for (let i = hdr.row + 1; i < total; i++) {
    if (i % 4000 === 0) {
      onProgress(`Agrupando líneas de OT… ${i.toLocaleString('es-CL')} de ${total.toLocaleString('es-CL')}`, 0.7 + 0.05 * (i / total))
      await tick()
    }
    const r = otWs.rows[i]
    if (!r) continue
    const otRaw = col(r, 'no ot')
    if (otRaw == null || otRaw === '') continue
    const ot = text(otRaw)
    let o = orders.get(ot)
    if (!o) {
      o = {
        workOrder: ot,
        plate: plateOf(col(r, 'patente')),
        branchRaw: text(col(r, 'sucursal')),
        clientName: text(col(r, 'alias cliente')) || text(col(r, 'cliente')),
        clientFull: text(col(r, 'cliente')),
        area: text(col(r, 'situacion')) || 'RAC',
        costCenter: text(col(r, 'c.costo')),
        receivedDate: isoDate(col(r, 'fec. recepcion')) || isoDate(col(r, 'fec. contab.')),
        closedDate: isoDate(col(r, 'fec. cierre')),
        sapStatus: text(col(r, 'estado ot')),
        mileage: Math.trunc(num(col(r, 'kilometraje'))),
        reason: text(col(r, 'comentarios')),
        createdBy: text(col(r, 'genera ot')),
        brandStyle: text(col(r, 'marca/estilo')),
        lines: [],
      }
      orders.set(ot, o)
    }
    const code = text(col(r, 'codigo'))
    const desc = descKey ? text(col(r, descKey)) : ''
    o.lines.push({
      code,
      description: desc,
      qty: num(col(r, 'cantidad')),
      unitCost: Math.round(num(col(r, 'costo unitario'))),
      total: Math.round(num(col(r, 'costo total'))),
      group: text(col(r, 'grupo')),
      ...lineClass(code, desc),
    })
  }
  if (!orders.size) throw new Error('La hoja de OT no tiene filas con número de OT.')
  onProgress('Clasificando órdenes de trabajo…', 0.75)
  await tick()

  // ------------------------------------------------------------- sucursales
  const counts = new Map()
  orders.forEach((o) => o.branchRaw && counts.set(o.branchRaw, (counts.get(o.branchRaw) ?? 0) + 1))
  const branchIds = {}
  const branches = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([raw]) => {
      const [name, lat, lng, zone] = PLACES[norm(raw)] ?? [raw, null, null, 'centro']
      const id = slug(raw)
      branchIds[raw] = id
      return { id, name, city: name, lat, lng, zone, hq: norm(raw) === 'taller central' }
    })

  const workOrders = []
  const responsibles = {}
  orders.forEach((o) => {
    o.branchId = branchIds[o.branchRaw] ?? null
    o.totalCost = o.lines.reduce((s, l) => s + l.total, 0)
    o.interventionType = classify(o.lines)
    o.recovery = ['Compañía de seguros', 'DYP'].includes(o.interventionType) ? 'Por revisar' : 'No recuperable'
    if (!o.reason) o.reason = o.lines.find((l) => norm(l.code) !== 'ingresotaller')?.description || 'Ingreso a taller'
    if (o.createdBy && o.branchId) {
      const c = (responsibles[o.branchId] ??= {})
      c[o.createdBy] = (c[o.createdBy] ?? 0) + 1
    }
    o.lines = o.lines.map((l) => [l.code, l.description, l.qty, l.unitCost, l.total, l.prev ? 1 : 0, l.cls])
    workOrders.push(o)
  })
  workOrders.sort((a, b) => (a.receivedDate < b.receivedDate ? -1 : a.receivedDate > b.receivedDate ? 1 : 0))

  // ---------------------------------------------------------------- maestro
  const byPlate = new Map()
  workOrders.forEach((o) => {
    if (!byPlate.has(o.plate)) byPlate.set(o.plate, [])
    byPlate.get(o.plate).push(o)
  })
  let mWs = null
  let mh = null
  for (const ws of sheets) {
    if (ws === otWs) continue
    const h = findHeader(ws, ['patente', 'marca'])
    if (h) {
      mWs = ws
      mh = h
      break
    }
  }
  onProgress('Leyendo maestro de vehículos…', 0.85)
  await tick()
  // sucursal del vehículo: la oficina de su centro de costo en el maestro
  // ("RAC OFC. (SAN PEDRO)", "RAC AEROPUERTO (CALAMA)"…); si no indica una
  // sucursal conocida, la de su última OT
  const branchByPlace = {}
  Object.keys(branchIds).forEach((raw) => (branchByPlace[norm(raw)] = raw))
  const tc = Object.keys(branchIds).find((raw) => norm(raw) === 'taller central')
  if (tc) branchByPlace['la serena'] ??= tc
  const teckRaw = Object.keys(branchIds).find((raw) => norm(raw) === 'teck')
  if (teckRaw) branchByPlace.andacollo ??= teckRaw
  const ALIAS = { 'san pedro': 'san pedro atacama', 'san pedro de atacama': 'san pedro atacama' }
  const branchOfCostCenter = (name) => {
    const m = norm(name).match(/^(?:rac ofc\.?|rac aeropuerto|lop|operaciones)\s*\(([^)]+)\)/)
    if (!m) return null
    const place = m[1].replace(/^faena /, '').trim()
    return branchByPlace[ALIAS[place] ?? place] ?? null
  }
  // ciudad de una sucursal escrita dentro del nombre ("CMP ELECTRO COPIAPO")
  const placeNames = Object.keys(branchByPlace).sort((a, b) => b.length - a.length)
  const branchInName = (name) => {
    const n = ` ${norm(name).replace(/[^a-z0-9]+/g, ' ')} `
    const place = placeNames.find((p) => n.includes(` ${p} `))
    return place ? branchByPlace[place] : null
  }
  const vehicles = []
  const seen = new Set()
  const ccOf = new Map()
  const thisYear = new Date().getFullYear()
  if (mWs) {
    const M = mh.map
    const mc = (r, name) => (name in M ? (r[M[name]] ?? null) : null)
    for (let i = mh.row + 1; i < mWs.rows.length; i++) {
      const r = mWs.rows[i]
      if (!r || !mc(r, 'patente')) continue
      const plate = plateOf(mc(r, 'patente'))
      if (seen.has(plate)) continue
      seen.add(plate)
      const area = text(mc(r, 'area negocio')).toUpperCase()
      const ots = byPlate.get(plate) ?? []
      const last = ots.at(-1)
      const active = ots.some((o) => ACTIVE.has(norm(o.sapStatus)))
      const km = ots.reduce((m, o) => Math.max(m, o.mileage), 0)
      const prevs = ots.filter((o) => o.interventionType.startsWith('Preventiva') && o.mileage)
      const nextKm = prevs.length ? prevs.at(-1).mileage + 10_000 : km ? Math.ceil((km + 1) / 10_000) * 10_000 : 10_000
      const status = active ? 'workshop' : area === 'USADOS' ? 'sold' : area === 'PERDIDA TOTAL' ? 'out' : 'available'
      const year = Math.trunc(num(mc(r, 'ano')))
      const fuel = norm(mc(r, 'combustible'))
      const ccName = text(mc(r, 'nombre c.costo'))
      ccOf.set(plate, ccName)
      const ccBranch = branchOfCostCenter(ccName)
      const branchRaw = ccBranch ?? last?.branchRaw ?? ''
      vehicles.push({
        plate,
        vin: text(mc(r, 'n.chasis')),
        brand: titleCase(text(mc(r, 'marca'))),
        model: text(mc(r, 'modelo sap')),
        kind: text(mc(r, 'descripcion')),
        category: categoryOf(text(mc(r, 'descripcion')), text(mc(r, 'modelo sap'))),
        year: year > 1980 && year <= thisYear + 1 ? year : null,
        transmission: '',
        fuel: fuel.includes('diesel') || fuel.includes('petroleo') ? 'Diésel' : fuel.includes('bencina') || fuel.includes('gasolina') ? 'Bencina' : titleCase(text(mc(r, 'combustible'))),
        color: titleCase(text(mc(r, 'color vehiculo'))),
        branchId: branchIds[branchRaw] ?? null,
        branchRaw,
        status,
        mileage: km,
        nextMaintenanceKm: nextKm,
        clientId: null,
        // si el maestro no trae cliente, se usa el de su última OT
        clientName: text(mc(r, 'nombre sn')) || text(mc(r, 'alias cc/cliente')) || last?.clientName || '',
        area: area === 'LOP' ? 'LOP' : area === 'RAC' ? 'RAC' : titleCase(area) || 'RAC',
        areaRaw: area,
        owner: text(mc(r, 'propiedad')),
        costCenter: text(mc(r, 'ultimo centro de costo')),
        note: text(mc(r, 'observacion')),
        documents: [],
        dailyRate: 0,
      })
    }
  }
  // sin oficina ni OT propia: la sucursal donde se atiende su centro de costo
  // (si una concentra ≥ 75 % de al menos 20 OT de esos vehículos) o la ciudad
  // que aparece en el nombre del centro de costo
  const ccBranches = {}
  vehicles.forEach((v) => {
    const cc = ccOf.get(v.plate)
    if (!cc) return
    const c = (ccBranches[cc] ??= {})
    ;(byPlate.get(v.plate) ?? []).forEach((o) => o.branchRaw && (c[o.branchRaw] = (c[o.branchRaw] ?? 0) + 1))
  })
  const ccMain = {}
  Object.entries(ccBranches).forEach(([cc, c]) => {
    const total = Object.values(c).reduce((s, n) => s + n, 0)
    const [raw, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] ?? []
    if (total >= 20 && n / total >= 0.75) ccMain[cc] = raw
  })
  vehicles.forEach((v) => {
    if (v.branchId) return
    const cc = ccOf.get(v.plate)
    const raw = cc ? branchInName(cc) ?? ccMain[cc] : null
    if (raw && branchIds[raw]) {
      v.branchId = branchIds[raw]
      v.branchRaw = raw
      v.branchEstimated = true
    }
  })
  if (!vehicles.length) throw new Error('No se encontró la hoja del maestro de vehículos (columnas "Patente" y "Marca").')

  const clients = [...new Set([...vehicles.map((v) => v.clientName), ...workOrders.map((o) => o.clientName)].filter(Boolean))].sort()
  const dates = workOrders.map((o) => o.receivedDate).filter(Boolean).sort()
  return {
    meta: {
      source: 'sap',
      fileName,
      // hora local, igual que el script de Python
      generatedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 19),
      vehicles: vehicles.length,
      workOrders: workOrders.length,
      lines: workOrders.reduce((s, o) => s + o.lines.length, 0),
      from: dates[0] ?? '',
      to: dates.at(-1) ?? '',
      platesOnlyInOT: [...byPlate.keys()].filter((p) => !seen.has(p)).sort(),
    },
    branches,
    vehicles,
    workOrders,
    responsibles: Object.fromEntries(
      Object.entries(responsibles).map(([b, c]) => [b, Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([n]) => n)]),
    ),
    clients,
  }
}

/** Lee el archivo (ArrayBuffer) y lo convierte. */
export async function convertSapFile(buffer, { onProgress = () => {}, ...opts } = {}) {
  const sheets = await readXlsx(buffer, (f) => onProgress('Descomprimiendo y leyendo el Excel…', 0.05 + 0.65 * f))
  return convertSapSheets(sheets, { ...opts, onProgress })
}
