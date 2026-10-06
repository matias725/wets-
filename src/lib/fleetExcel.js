// Importación y exportación de la flota en Excel (.xlsx).
// Reconoce los mismos nombres de columna que el importador SAP de WEST IA de
// escritorio (sap_import.py · FLEET_ALIASES), más algunos propios de la web.
import { BRANCHES } from '@/data/branches'
import { CATEGORIES, MODELS, VEHICLE_DOCUMENTS, VEHICLE_STATUS } from '@/data/catalog'
import { COMPANIES, PERSONS } from '@/data/people'

const loadExcel = () => import('exceljs').then((m) => m.default ?? m)

// ------------------------------------------------------------------ columnas
export const FIELDS = [
  { key: 'plate', label: 'Patente', required: true, aliases: ['patente', 'ppu', 'placa', 'matricula'] },
  { key: 'brand', label: 'Marca', aliases: ['marca', 'marca/estilo'] },
  { key: 'model', label: 'Modelo', aliases: ['modelo', 'modelo sap', 'estilo', 'version', 'versión'] },
  { key: 'year', label: 'Año', aliases: ['ano', 'año', 'ano fabricacion', 'año fabricacion', 'ano fabricación', 'año fabricación', 'ano modelo', 'año modelo', 'modelo ano', 'modelo año', 'year', 'model year'] },
  { key: 'category', label: 'Categoría', aliases: ['categoria', 'categoría', 'tipo vehiculo', 'tipo de vehiculo', 'segmento', 'clase'] },
  { key: 'transmission', label: 'Transmisión', aliases: ['transmision', 'transmisión', 'caja', 'tipo transmision', 'tipo de transmision'] },
  { key: 'fuel', label: 'Combustible', aliases: ['combustible', 'tipo combustible', 'tipo de combustible'] },
  { key: 'branch', label: 'Sucursal', aliases: ['sucursal', 'sucursal actual', 'faena', 'centro', 'ubicacion', 'ubicación'] },
  { key: 'status', label: 'Estado', aliases: ['estado', 'estado vehiculo', 'estado vehículo', 'estado operacional', 'situacion', 'situación'] },
  { key: 'mileage', label: 'Kilometraje', aliases: ['kilometraje', 'kms', 'km', 'odometro', 'odómetro', 'kilometraje actual'] },
  { key: 'nextMaintenanceKm', label: 'Próxima mantención (km)', aliases: ['proxima mantencion', 'próxima mantención', 'proxima mantencion km', 'próxima mantención (km)', 'km proxima mantencion', 'prox mantencion'] },
  { key: 'client', label: 'Cliente', aliases: ['cliente', 'alias cliente', 'ultimo cliente', 'último cliente', 'nombre sn'] },
  { key: 'area', label: 'Área (RAC / LOP)', aliases: ['area', 'área', 'area negocio', 'área negocio', 'area de negocio', 'área de negocio', 'area (rac / lop)', 'área (rac / lop)'] },
  { key: 'vin', label: 'VIN / chasis', aliases: ['vin', 'chasis', 'numero chasis', 'número chasis', 'n° chasis', 'n.chasis', 'n chasis', 'vin / chasis'] },
  { key: 'color', label: 'Color', aliases: ['color', 'color vehiculo', 'color vehículo'] },
  { key: 'costCenter', label: 'Centro de costo', aliases: ['centro de costo', 'c.costo', 'ccosto', 'ultimo centro de costo', 'último centro de costo', 'nombre c.costo'] },
  { key: 'doc_rt', label: 'Venc. revisión técnica', doc: 'Revisión técnica', aliases: ['revision tecnica', 'revisión técnica', 'venc. revision tecnica', 'venc. revisión técnica', 'vencimiento revision tecnica'] },
  { key: 'doc_permit', label: 'Venc. permiso de circulación', doc: 'Permiso de circulación', aliases: ['permiso de circulacion', 'permiso circulacion', 'venc. permiso de circulacion', 'venc. permiso de circulación', 'vencimiento permiso de circulacion'] },
  { key: 'doc_soap', label: 'Venc. SOAP', doc: 'SOAP', aliases: ['soap', 'venc. soap', 'vencimiento soap'] },
  { key: 'doc_insurance', label: 'Venc. seguro', doc: 'Seguro', aliases: ['seguro', 'venc. seguro', 'vencimiento seguro', 'poliza', 'póliza'] },
]
const DOC_FIELDS = FIELDS.filter((f) => f.doc)

export const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')

const ALIAS_INDEX = FIELDS.map((f) => ({ key: f.key, set: new Set(f.aliases.map(normalize)) }))

/** Asigna cada campo a la primera columna cuyo encabezado coincide con un alias. */
export function detectMapping(headers) {
  const mapping = {}
  const used = new Set()
  ALIAS_INDEX.forEach(({ key, set }) => {
    const idx = headers.findIndex((h, i) => !used.has(i) && set.has(normalize(h)))
    if (idx >= 0) {
      mapping[key] = idx
      used.add(idx)
    }
  })
  return mapping
}

// Columnas propias de un reporte de OT: si aparecen, la hoja no es un maestro de flota.
const OT_MARKERS = new Set(['no ot', 'n° ot', 'nº ot', 'n.º ot', 'nro ot', 'numero ot', 'orden de trabajo', 'costo total', 'costo unitario'].map(normalize))

// --------------------------------------------------------------- lectura celdas
function cellValue(v) {
  if (v == null) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result)
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('')
    if ('text' in v) return String(v.text)
    if ('error' in v) return ''
  }
  return v
}

/** Lee el archivo y devuelve las hojas que parecen un maestro de flota. */
export async function readWorkbook(file) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const sheets = []
  wb.eachSheet((ws) => {
    const rows = []
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const values = Array.isArray(row.values) ? row.values.slice(1).map(cellValue) : []
      rows[n - 1] = values
    })
    for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = []
    // Encabezado: primera fila (de las 30 primeras) con patente + al menos 2 campos más.
    let best = null
    for (let r = 0; r < Math.min(rows.length, 30); r += 1) {
      const headers = rows[r].map((h) => String(h ?? '').trim())
      const mapping = detectMapping(headers)
      if (mapping.plate === undefined) continue
      const isOT = headers.some((h) => OT_MARKERS.has(normalize(h)))
      const score = Object.keys(mapping).length - (isOT ? 10 : 0)
      if (score >= 3 && (!best || score > best.score)) best = { headerRow: r, headers, mapping, score }
    }
    if (best) {
      sheets.push({
        name: ws.name,
        headerRow: best.headerRow,
        headers: best.headers,
        mapping: best.mapping,
        score: best.score,
        rows: rows.slice(best.headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== '')),
      })
    }
  })
  return sheets.sort((a, b) => b.score - a.score)
}

// ------------------------------------------------------------ normalización
export function normalizePlate(value) {
  const raw = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z]{4}\d{2}$/.test(raw)) return { plate: `${raw.slice(0, 4)}-${raw.slice(4)}`, standard: true }
  if (/^[A-Z]{2}\d{4}$/.test(raw)) return { plate: `${raw.slice(0, 2)}-${raw.slice(2)}`, standard: true }
  return { plate: raw, standard: false }
}

function toNumber(value) {
  if (typeof value === 'number') return value
  const text = String(value ?? '').replace(/km/i, '').replace(/\s/g, '')
  if (!text) return NaN
  // 12.345 / 12,345 / 12.345,6 → miles con punto o coma
  const cleaned = /^\d{1,3}([.,]\d{3})+$/.test(text) ? text.replace(/[.,]/g, '') : text.replace(/\./g, '').replace(',', '.')
  return Number(cleaned)
}

const pad = (n) => String(n).padStart(2, '0')
function toIsoDate(value) {
  if (!value && value !== 0) return ''
  if (value instanceof Date && !Number.isNaN(value)) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = new Date(Math.round((value - 25569) * 864e5))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = String(value).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  return null
}

const BRANCH_LOOKUP = BRANCHES.flatMap((b) => {
  const keys = new Set([normalize(b.name), normalize(b.id.replace(/-/g, ' '))])
  if (b.name.startsWith('APT ')) {
    keys.add(normalize(`aeropuerto ${b.city}`))
    keys.add(normalize(`apt. ${b.city}`))
  }
  if (b.id === 'la-serena') ['la serena', 'casa matriz', 'taller central'].forEach((k) => keys.add(k))
  if (b.id === 'manquehue') ['manquehue', 'santiago'].forEach((k) => keys.add(k))
  return [...keys].map((k) => [k, b.id])
})
const BRANCH_MAP = new Map(BRANCH_LOOKUP)
function matchBranch(text) {
  const n = normalize(text)
  if (!n) return null
  return BRANCH_MAP.get(n) ?? null
}

const STATUS_RULES = [
  [/arrend|en arriendo|rentad/, 'rented'],
  [/reserv/, 'reserved'],
  [/limpie|lavad/, 'cleaning'],
  [/fuera|baja|siniestr|inactiv|no operativ|detenid/, 'out'],
  [/taller|manten|repar|servicio tecnico/, 'workshop'],
  [/disponib|activo|operativ|libre/, 'available'],
]
function matchStatus(text) {
  const n = normalize(text)
  if (!n) return { status: 'available', known: false, empty: true }
  const byLabel = Object.entries(VEHICLE_STATUS).find(([, s]) => normalize(s.label) === n)
  if (byLabel) return { status: byLabel[0], known: true }
  const rule = STATUS_RULES.find(([re]) => re.test(n))
  return rule ? { status: rule[1], known: true } : { status: 'available', known: false }
}

function matchModel(brand, model) {
  const text = normalize(`${brand} ${model}`)
  return MODELS.slice()
    .sort((a, b) => b.model.length - a.model.length)
    .find((m) => text.includes(normalize(m.model)) && (!brand || normalize(brand).includes(normalize(m.brand)) || text.includes(normalize(m.brand))))
}

function matchCategory(text, brand, model) {
  const n = normalize(text)
  if (n) {
    const exact = CATEGORIES.find((c) => normalize(c.label) === n || c.id === n)
    if (exact) return exact.id
    if (/miner/.test(n)) return 'pickup-mining'
    if (/4x4|4 x 4/.test(n)) return 'pickup-4x4'
    if (/4x2|4 x 2|camioneta|pick ?up/.test(n)) return 'pickup-4x2'
    if (/suv|todo terreno|jeep/.test(n)) return 'suv'
    if (/sedan|berlina/.test(n)) return 'sedan'
    if (/city|hatch|compacto/.test(n)) return 'citycar'
  }
  const known = matchModel(brand, model)
  if (known) return known.category
  const m = normalize(`${model}`)
  if (/miner/.test(m)) return 'pickup-mining'
  if (/4x4/.test(m)) return 'pickup-4x4'
  if (/hilux|ranger|l200|navara|d max|dmax|landtrek|amarok|np300|frontier|bt 50/.test(m)) return 'pickup-4x2'
  return 'other'
}

function normalizeFuel(text, known) {
  const n = normalize(text)
  if (/dies|petrol/.test(n)) return 'Diésel'
  if (/bencin|gasolin|nafta/.test(n)) return 'Bencina'
  if (/hibri/.test(n)) return 'Híbrido'
  if (/electr/.test(n)) return 'Eléctrico'
  return text ? String(text).trim() : known?.fuel ?? ''
}
function normalizeTransmission(text, known) {
  const n = normalize(text)
  if (/auto|at\b|cvt/.test(n)) return 'Automática'
  if (/manu|mt\b|mecanic/.test(n)) return 'Manual'
  return text ? String(text).trim() : known?.transmission ?? ''
}

const CLIENTS = [...COMPANIES, ...PERSONS].map((c) => [normalize(c.name), c.id])
const CLIENT_MAP = new Map(CLIENTS)
const CLIENT_NAME_BY_ID = new Map([...COMPANIES, ...PERSONS].map((c) => [c.id, c.name]))

// ------------------------------------------------------------------ parseo
/**
 * Convierte las filas de la hoja en vehículos.
 * issues: [{ row, level: 'error'|'warning', message }]
 */
export function parseRows(rows, mapping, headerRow = 0) {
  const get = (row, key) => (mapping[key] === undefined || mapping[key] === '' ? '' : cellValue(row[mapping[key]]))
  const thisYear = new Date().getFullYear()
  const issues = []
  const byPlate = new Map()
  let duplicates = 0
  const unknownBranches = new Map()

  rows.forEach((row, i) => {
    const excelRow = headerRow + 2 + i // número de fila visible en Excel
    const { plate, standard } = normalizePlate(get(row, 'plate'))
    if (!plate) {
      issues.push({ row: excelRow, level: 'error', message: 'Fila sin patente: se omite' })
      return
    }
    if (!standard) issues.push({ row: excelRow, level: 'warning', message: `Patente “${plate}” no tiene el formato ABCD-12 ni AB-1234` })

    let brand = String(get(row, 'brand') ?? '').trim()
    let model = String(get(row, 'model') ?? '').trim()
    if (brand && !model && brand.includes(' ')) {
      // Columna SAP "Marca/Estilo": primera palabra = marca, resto = modelo
      ;[brand, ...model] = brand.split(/\s+/)
      model = model.join(' ')
    }
    const known = matchModel(brand, model)

    const yearRaw = get(row, 'year')
    let year = Number(toNumber(yearRaw))
    if (yearRaw !== '' && (!Number.isInteger(year) || year < 1990 || year > thisYear + 1)) {
      issues.push({ row: excelRow, level: 'warning', message: `${plate}: año “${yearRaw}” no válido` })
      year = null
    } else if (yearRaw === '') year = null

    const kmRaw = get(row, 'mileage')
    let mileage = toNumber(kmRaw)
    if (kmRaw !== '' && (!Number.isFinite(mileage) || mileage < 0)) {
      issues.push({ row: excelRow, level: 'warning', message: `${plate}: kilometraje “${kmRaw}” no válido, se usa 0` })
      mileage = 0
    }
    if (!Number.isFinite(mileage)) mileage = 0
    mileage = Math.round(mileage)

    const nextRaw = get(row, 'nextMaintenanceKm')
    let nextMaintenanceKm = toNumber(nextRaw)
    if (!Number.isFinite(nextMaintenanceKm) || nextMaintenanceKm <= 0) nextMaintenanceKm = Math.max(10_000, Math.ceil((mileage + 1) / 10_000) * 10_000)

    const branchText = String(get(row, 'branch') ?? '').trim()
    const branchId = matchBranch(branchText)
    if (branchText && !branchId) unknownBranches.set(branchText, (unknownBranches.get(branchText) || 0) + 1)

    const statusText = get(row, 'status')
    const st = matchStatus(statusText)
    if (!st.known && !st.empty) issues.push({ row: excelRow, level: 'warning', message: `${plate}: estado “${statusText}” no reconocido, queda como Disponible` })

    const clientText = String(get(row, 'client') ?? '').trim()
    const areaText = normalize(get(row, 'area'))
    const documents = DOC_FIELDS.flatMap((f) => {
      const raw = get(row, f.key)
      if (raw === '' || raw == null) return []
      const d = toIsoDate(raw)
      if (!d) {
        issues.push({ row: excelRow, level: 'warning', message: `${plate}: fecha de ${f.doc} “${raw}” no válida` })
        return []
      }
      return [{ name: f.doc, expiresAt: d }]
    })

    if (byPlate.has(plate)) {
      duplicates += 1
      issues.push({ row: excelRow, level: 'warning', message: `${plate} aparece repetida: se usa la última fila` })
    }
    byPlate.set(plate, {
      plate,
      vin: String(get(row, 'vin') ?? '').trim(),
      brand: brand || known?.brand || '',
      model: model || '',
      category: matchCategory(get(row, 'category'), brand, model),
      year,
      transmission: normalizeTransmission(get(row, 'transmission'), known),
      fuel: normalizeFuel(get(row, 'fuel'), known),
      branchId,
      branchRaw: branchText,
      status: st.status,
      mileage,
      nextMaintenanceKm: Math.round(nextMaintenanceKm),
      clientId: CLIENT_MAP.get(normalize(clientText)) ?? null,
      clientName: clientText,
      area: areaText.includes('lop') || areaText.includes('leasing') ? 'LOP' : 'RAC',
      color: String(get(row, 'color') ?? '').trim(),
      costCenter: String(get(row, 'costCenter') ?? '').trim(),
      documents,
      dailyRate: known?.price ?? 0,
    })
  })

  unknownBranches.forEach((count, name) =>
    issues.push({ row: null, level: 'warning', message: `Sucursal “${name}” (${count} vehículo${count > 1 ? 's' : ''}) no está en la lista de sucursales: se muestra con su nombre original` }),
  )
  return { vehicles: [...byPlate.values()], issues, duplicates }
}

/** Compara con la flota actual: nuevas, actualizadas y sin cambios. */
export function compareFleet(vehicles, current) {
  const byPlate = new Map(current.map((v) => [v.plate, v]))
  // Sucursal y cliente se comparan por su identidad ya reconocida, no por cómo venían escritos.
  const branchKey = (v) => v.branchId || normalize(v.branchRaw)
  const clientKey = (v) => normalize(v.clientName || CLIENT_NAME_BY_ID.get(v.clientId) || '')
  const fields = ['brand', 'model', 'year', 'category', 'status', 'mileage', 'nextMaintenanceKm', 'vin', 'fuel', 'transmission', 'area']
  let added = 0
  let updated = 0
  let unchanged = 0
  vehicles.forEach((v) => {
    const prev = byPlate.get(v.plate)
    if (!prev) added += 1
    else if (fields.some((f) => (v[f] ?? '') !== (prev[f] ?? '')) || branchKey(v) !== branchKey(prev) || clientKey(v) !== clientKey(prev)) updated += 1
    else unchanged += 1
  })
  return { added, updated, unchanged, removed: current.filter((v) => !vehicles.some((n) => n.plate === v.plate)).length }
}

// ------------------------------------------------------------- escritura
const BRAND_YELLOW = 'FFFFC400'
const INK = 'FF2A2723'

function styleHeader(row) {
  row.height = 22
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: INK } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_YELLOW } }
    c.alignment = { vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: INK } } }
  })
}

const EXPORT_COLUMNS = [
  ['Patente', (v) => v.plate, 12],
  ['Marca', (v) => v.brand, 14],
  ['Modelo', (v) => v.model, 30],
  ['Año', (v) => v.year ?? '', 8],
  ['Categoría', (v) => v.categoryLabel, 28],
  ['Transmisión', (v) => v.transmission, 13],
  ['Combustible', (v) => v.fuel, 13],
  ['Sucursal', (v) => v.branch, 26],
  ['Estado', (v) => v.statusLabel, 18],
  ['Kilometraje', (v) => v.mileage, 13],
  ['Próxima mantención (km)', (v) => v.nextMaintenanceKm, 22],
  ['Cliente', (v) => v.client, 30],
  ['Área (RAC / LOP)', (v) => v.area, 16],
  ['VIN / chasis', (v) => v.vin, 22],
  ['Color', (v) => v.color ?? '', 12],
  ['Centro de costo', (v) => v.costCenter ?? '', 16],
  ...VEHICLE_DOCUMENTS.map((doc) => [
    `Venc. ${doc === 'Seguro' || doc === 'SOAP' ? doc : doc.toLowerCase()}`,
    (v) => {
      const d = (v.documents ?? []).find((x) => x.name === doc)?.expiresAt
      return d ? new Date(`${d}T12:00:00`) : ''
    },
    20,
  ]),
]

function addFleetSheet(wb, vehicles) {
  const ws = wb.addWorksheet('Flota', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = EXPORT_COLUMNS.map(([header, , width]) => ({ header, width }))
  vehicles.forEach((v) => ws.addRow(EXPORT_COLUMNS.map(([, get]) => get(v))))
  styleHeader(ws.getRow(1))
  ws.getColumn(10).numFmt = '#,##0'
  ws.getColumn(11).numFmt = '#,##0'
  for (let i = EXPORT_COLUMNS.length - 3; i <= EXPORT_COLUMNS.length; i += 1) ws.getColumn(i).numFmt = 'dd-mm-yyyy'
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } }
  return ws
}

async function download(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer()
  downloadBuffer(buffer, filename)
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Exporta la flota (ya enriquecida con etiquetas) a .xlsx; se puede volver a importar. */
export async function buildFleetWorkbook(vehicles) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WEST IA'
  addFleetSheet(wb, vehicles)
  return wb.xlsx.writeBuffer()
}

export async function exportFleetExcel(vehicles, filename) {
  downloadBuffer(await buildFleetWorkbook(vehicles), filename)
}

/** Plantilla con dos filas de ejemplo y una hoja de instrucciones. */
export async function downloadTemplate() {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WEST IA'
  const examples = [
    { plate: 'ABCD-12', brand: 'Toyota', model: 'Hilux 2.4 4x4', year: 2024, categoryLabel: 'Camioneta 4x4', transmission: 'Manual', fuel: 'Diésel', branch: 'Calama', statusLabel: 'Disponible', mileage: 45210, nextMaintenanceKm: 50000, client: '', area: 'RAC', vin: '8AJBA3CD1R0000001', color: 'Blanco', costCenter: '', documents: [{ name: 'Revisión técnica', expiresAt: '2027-03-15' }, { name: 'Permiso de circulación', expiresAt: '2027-03-31' }, { name: 'SOAP', expiresAt: '2027-03-31' }, { name: 'Seguro', expiresAt: '2027-01-10' }] },
    { plate: 'WXYZ-34', brand: 'Kia', model: 'Morning', year: 2025, categoryLabel: 'Citycar', transmission: 'Manual', fuel: 'Bencina', branch: 'APT Santiago', statusLabel: 'Arrendado', mileage: 18350, nextMaintenanceKm: 20000, client: 'Empresa Ejemplo SpA', area: 'LOP', vin: '', color: 'Gris', costCenter: '', documents: [] },
  ]
  const ws = addFleetSheet(wb, examples)
  ws.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } }
  ws.getRow(3).font = { italic: true, color: { argb: 'FF64748B' } }

  const help = wb.addWorksheet('Instrucciones')
  help.columns = [{ width: 32 }, { width: 90 }]
  const lines = [
    ['WEST IA · Plantilla de flota', ''],
    ['', ''],
    ['Cómo usarla', 'Reemplace las filas de ejemplo (en cursiva) por su flota, una fila por vehículo, y súbala en Flota → Importar Excel.'],
    ['Columna obligatoria', 'Patente (formato ABCD-12 o AB-1234). Las demás son opcionales.'],
    ['Nombres de columna', 'También se reconocen los nombres del reporte SAP: PPU, Marca/Estilo, Año fabricación, Kms, Faena, Chasis, etc.'],
    ['Categoría', CATEGORIES.map((c) => c.label).join(' · ') + '. Si se deja vacía, se deduce del modelo.'],
    ['Estado', Object.values(VEHICLE_STATUS).map((s) => s.label).join(' · ')],
    ['Transmisión', 'Manual · Automática'],
    ['Combustible', 'Bencina · Diésel · Híbrido · Eléctrico'],
    ['Área', 'RAC (arriendo diario) · LOP (leasing operativo)'],
    ['Fechas', 'Formato fecha de Excel o dd-mm-aaaa.'],
    ['Sucursales', BRANCHES.map((b) => b.name).join(' · ')],
  ]
  lines.forEach((l) => help.addRow(l))
  help.getRow(1).font = { bold: true, size: 14 }
  help.getColumn(1).font = { bold: true }
  help.getRow(1).getCell(1).font = { bold: true, size: 14 }
  help.getColumn(2).alignment = { wrapText: true, vertical: 'top' }
  await download(wb, 'WEST_IA_plantilla_flota.xlsx')
}
