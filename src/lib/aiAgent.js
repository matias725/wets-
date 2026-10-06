// Analista IA: Claude (vía el servidor local) + herramientas que consultan los
// datos de WEST IA en el navegador. A Claude solo le llegan los resultados de
// las consultas que pide, no el Excel completo.
import {
  ALL_BRANCHES, BRANCHES, META, TODAY, branchName, getBranchComparison, getCostRanking, getMaintenanceForecast,
  getOpenWorkOrders, getVehicle, getVehicles, iso, isPreparation, isPreventiveLine,
} from '@/data/api'
import { WORK_ORDERS } from '@/data/dataset'
import { CATEGORY_BY_ID, VEHICLE_STATUS } from '@/data/catalog'

// la IA local tiene menos memoria de trabajo: resultados más cortos
const MAX_RESULT_CHARS = { claude: 40_000, local: 9_000 }
const MAX_STEPS = 24
const DAY = 864e5

// ------------------------------------------------------------------ utilidades
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
const has = (value, needle) => !needle || norm(value).includes(norm(needle))
const round = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n))
const days = (a, b) => (a && b ? Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY) : null)

function findBranch(text) {
  if (!text) return null
  const t = norm(text)
  return BRANCHES.find((b) => b.id === text || norm(b.name) === t) ?? BRANCHES.find((b) => norm(b.name).includes(t) || t.includes(norm(b.city)))
}
const branchOf = (o) => (o.branchId ? branchName(o.branchId) : o.branchRaw || 'Sin sucursal')
const clientOf = (o) => o.clientName || 'Sin cliente'

function vehicleIndex() {
  return new Map(getVehicles(ALL_BRANCHES, { includeSold: true }).map((v) => [v.plate, v]))
}

/** Filtro común de OT. Devuelve [lista, aviso]. */
function filterOrders(input, vIndex) {
  const branch = input.sucursal ? findBranch(input.sucursal) : null
  if (input.sucursal && !branch) return [[], `No existe la sucursal "${input.sucursal}". Sucursales: ${BRANCHES.map((b) => b.name).join(', ')}`]
  const types = input.tipo_intervencion?.length ? new Set(input.tipo_intervencion.map(norm)) : null
  const list = WORK_ORDERS.filter((o) => {
    const v = vIndex.get(o.plate)
    if (input.desde && (!o.receivedDate || o.receivedDate < input.desde)) return false
    if (input.hasta && (!o.receivedDate || o.receivedDate > input.hasta)) return false
    if (branch && o.branchId !== branch.id) return false
    if (input.cliente && !has(o.clientName, input.cliente) && !has(o.clientFull, input.cliente)) return false
    if (input.patente && norm(o.plate).replace(/[^a-z0-9]/g, '') !== norm(input.patente).replace(/[^a-z0-9]/g, '')) return false
    if (input.marca && !has(v?.brand, input.marca)) return false
    if (input.modelo && !has(v?.model, input.modelo)) return false
    if (input.area && norm(o.area) !== norm(input.area)) return false
    if (types && !types.has(norm(o.interventionType))) return false
    const open = ['no iniciada', 'proceso'].includes(norm(o.sapStatus))
    if (input.estado === 'abiertas' && !open) return false
    if (input.estado === 'cerradas' && open) return false
    if (input.excluir_preparacion && isPreparation(o)) return false
    if (input.texto) {
      const t = norm(input.texto)
      if (!norm(o.reason).includes(t) && !o.lines.some((l) => norm(l.description).includes(t) || norm(l.code).includes(t))) return false
    }
    return true
  })
  return [list, null]
}

function groupKey(by, o, v) {
  switch (by) {
    case 'sucursal':
      return branchOf(o)
    case 'cliente':
      return clientOf(o)
    case 'tipo_intervencion':
      return o.interventionType || 'Sin tipo'
    case 'mes':
      return o.receivedDate?.slice(0, 7) || 'Sin fecha'
    case 'patente':
      return o.plate
    case 'marca':
      return v?.brand || 'Sin dato'
    case 'modelo':
      return v ? `${v.brand} ${v.model}` : 'Sin dato'
    case 'area':
      return o.area || 'Sin área'
    case 'categoria':
      return v ? (CATEGORY_BY_ID[v.category]?.label ?? v.category) : 'Sin dato'
    case 'creado_por':
      return o.createdBy || 'Sin dato'
    default:
      return 'Total'
  }
}

function otRow(o, v) {
  return {
    ot: o.workOrder,
    patente: o.plate,
    vehiculo: v ? `${v.brand} ${v.model}` : '',
    sucursal: branchOf(o),
    cliente: clientOf(o),
    ingreso: o.receivedDate,
    cierre: o.closedDate || null,
    estado_sap: o.sapStatus,
    tipo: o.interventionType,
    preparacion: isPreparation(o) || undefined,
    motivo: o.reason,
    km: o.mileage || null,
    costo: round(o.totalCost),
    dias_taller: days(o.receivedDate, o.closedDate || iso(TODAY)),
  }
}

const sortBy = (list, key) => list.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
const limitOf = (input, def = 25, max = 200) => Math.min(Math.max(1, Number(input.limite) || def), max)

// ---------------------------------------------------------------- herramientas
const OT_FILTERS = {
  desde: { type: 'string', description: 'Fecha de ingreso desde (AAAA-MM-DD), inclusive' },
  hasta: { type: 'string', description: 'Fecha de ingreso hasta (AAAA-MM-DD), inclusive' },
  sucursal: { type: 'string', description: 'Nombre (o parte) de la sucursal' },
  cliente: { type: 'string', description: 'Nombre (o parte) del cliente' },
  patente: { type: 'string', description: 'Patente exacta, p. ej. ABCD-12' },
  marca: { type: 'string' },
  modelo: { type: 'string', description: 'Parte del modelo, p. ej. "HILUX"' },
  area: { type: 'string', description: 'Área de negocio: LOP (leasing operativo), RAC (arriendo corto plazo), USADOS, GERENCIA, OPERACIONES, OTROS' },
  tipo_intervencion: {
    type: 'array',
    items: { type: 'string', enum: ['Correctiva', 'Preventiva', 'Preventiva + Correctiva', 'Equipamiento unidades nuevas', 'DYP', 'Compañía de seguros', 'Revisión técnica', 'Lavado', 'Otros'] },
  },
  estado: { type: 'string', enum: ['abiertas', 'cerradas', 'todas'], description: 'abiertas = No iniciada o Proceso en SAP' },
  texto: { type: 'string', description: 'Busca en el motivo de la OT y en la descripción o código de sus líneas (repuestos y mano de obra)' },
  excluir_preparacion: { type: 'boolean', description: 'Excluye OT de preparación/equipamiento de unidades para clientes (no son fallas)' },
}

export const TOOLS = [
  {
    name: 'consultar_ot',
    description:
      'Busca y agrega órdenes de trabajo (OT) del taller. Con agrupar_por devuelve por grupo: cantidad de OT, costo total, costo promedio, patentes distintas y días promedio en taller. Sin agrupar devuelve el listado de OT (más caras primero, o más recientes con orden="fecha"). Úsala para gasto, frecuencia de fallas, comparaciones y tendencias.',
    input_schema: {
      type: 'object',
      properties: {
        ...OT_FILTERS,
        agrupar_por: { type: 'string', enum: ['ninguno', 'sucursal', 'cliente', 'tipo_intervencion', 'mes', 'patente', 'marca', 'modelo', 'area', 'categoria', 'creado_por'] },
        orden: { type: 'string', enum: ['costo', 'cantidad', 'fecha'], description: 'Orden de grupos o filas (por defecto costo)' },
        limite: { type: 'integer', description: 'Máximo de grupos o filas (por defecto 25, máx. 200)' },
      },
    },
  },
  {
    name: 'consultar_repuestos',
    description:
      'Analiza las líneas de las OT (repuestos, insumos y mano de obra): cantidades, gasto y costo unitario, agrupado por descripción, código, patente, modelo, sucursal o mes. Sirve para saber qué piezas se cambian más, cuánto cuestan y en qué vehículos.',
    input_schema: {
      type: 'object',
      properties: {
        ...OT_FILTERS,
        texto_linea: { type: 'string', description: 'Filtra solo las líneas cuya descripción o código contiene este texto (p. ej. "pastilla", "embrague")' },
        tipo_linea: { type: 'string', enum: ['todas', 'preventivas', 'correctivas'] },
        agrupar_por: { type: 'string', enum: ['descripcion', 'codigo', 'patente', 'modelo', 'sucursal', 'mes', 'ninguno'] },
        orden: { type: 'string', enum: ['costo', 'cantidad'] },
        limite: { type: 'integer' },
      },
    },
  },
  {
    name: 'detalle_vehiculo',
    description: 'Expediente completo de una patente: datos del maestro, estado, cliente, kilometraje, ritmo de uso, próxima mantención estimada, gasto acumulado e historial de OT con sus líneas.',
    input_schema: { type: 'object', properties: { patente: { type: 'string' } }, required: ['patente'] },
  },
  {
    name: 'consultar_flota',
    description:
      'Lista o cuenta vehículos del maestro con filtros (sucursal, estado, marca, modelo, categoría, cliente, área, año). Por defecto excluye vendidos (USADOS). Con agrupar_por devuelve conteos por grupo.',
    input_schema: {
      type: 'object',
      properties: {
        sucursal: { type: 'string' },
        estado: { type: 'string', enum: Object.keys(VEHICLE_STATUS), description: 'available=disponible, workshop=en taller, out=fuera de servicio/pérdida total, sold=vendido' },
        marca: { type: 'string' },
        modelo: { type: 'string' },
        categoria: { type: 'string' },
        cliente: { type: 'string' },
        area: { type: 'string' },
        anio_desde: { type: 'integer' },
        anio_hasta: { type: 'integer' },
        incluir_vendidos: { type: 'boolean' },
        agrupar_por: { type: 'string', enum: ['ninguno', 'sucursal', 'estado', 'marca', 'modelo', 'categoria', 'cliente', 'anio', 'area'] },
        limite: { type: 'integer' },
      },
    },
  },
  {
    name: 'ot_abiertas',
    description:
      'Vehículos actualmente en taller (OT abiertas en SAP) con días detenidos, motivo, sucursal y la gestión registrada en la app (estado real, responsable, prioridad, bloqueo, compromiso) y alertas (crítica, sin gestión, compromiso vencido, espera repuesto).',
    input_schema: { type: 'object', properties: { sucursal: { type: 'string' }, min_dias: { type: 'integer' }, limite: { type: 'integer' } } },
  },
  {
    name: 'mantenciones',
    description: 'Mantenciones preventivas vencidas o que tocan en los próximos N días, estimadas con el ritmo de uso (km/día) de cada vehículo.',
    input_schema: { type: 'object', properties: { sucursal: { type: 'string' }, dias: { type: 'integer', description: 'Horizonte en días (por defecto 30)' }, limite: { type: 'integer' } } },
  },
  {
    name: 'ranking_gasto',
    description:
      'Vehículos que más gastan en un período, con desglose preventivo/correctivo/siniestros, gasto vs. promedio de su categoría y sugerencia (evaluar venta / revisar). La preparación se muestra aparte y no cuenta como gasto.',
    input_schema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' }, sucursal: { type: 'string' }, limite: { type: 'integer' } } },
  },
  {
    name: 'comparar_sucursales',
    description: 'Indicadores por sucursal en un período: vehículos, disponibilidad, en taller, días promedio en taller, OT detenidas >15 días, OT del período, gasto total, correctivo y gasto por vehículo.',
    input_schema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } } },
  },
  {
    name: 'analisis_avanzado',
    description: `Ejecuta JavaScript sobre todos los datos cuando las otras herramientas no alcanzan (cruces, estadísticas, correlaciones, series a medida). El código es el cuerpo de una función que recibe:
- ot: arreglo de OT { ot, patente, sucursal, cliente, area, ingreso, cierre, estado_sap, abierta, tipo, preparacion, motivo, km, costo, creado_por, lineas: [{ codigo, descripcion, cantidad, costo_unitario, total, preventiva }] }
- vehiculos: arreglo { patente, marca, modelo, categoria, anio, combustible, sucursal, estado, cliente, area, km, km_estimado_hoy, km_por_dia, proxima_mantencion_km, dias_para_mantencion }
- hoy: 'AAAA-MM-DD'
Debe terminar con "return <resultado>" (objeto o arreglo serializable, idealmente pequeño y ya resumido). Sin acceso a red ni a la página. Límite: 15 segundos.`,
    input_schema: {
      type: 'object',
      properties: { descripcion: { type: 'string', description: 'Qué calcula, en una frase (se muestra al usuario)' }, codigo: { type: 'string' } },
      required: ['descripcion', 'codigo'],
    },
  },
  {
    name: 'mostrar_grafico',
    description:
      'Muestra un gráfico al usuario junto a la respuesta. Úsalo cuando una comparación o tendencia se entiende mejor visualmente (máx. 2 por respuesta). Los datos deben venir de consultas ya hechas.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['barras', 'barras_horizontales', 'lineas', 'torta'] },
        titulo: { type: 'string' },
        etiquetas: { type: 'array', items: { type: 'string' }, description: 'Categorías del eje X (o porciones de la torta)' },
        series: {
          type: 'array',
          items: { type: 'object', properties: { nombre: { type: 'string' }, valores: { type: 'array', items: { type: 'number' } } }, required: ['nombre', 'valores'] },
        },
        formato: { type: 'string', enum: ['clp', 'numero', 'porcentaje', 'dias', 'km'] },
      },
      required: ['tipo', 'titulo', 'etiquetas', 'series'],
    },
  },
]

// ------------------------------------------------------------- ejecución
function consultarOt(input) {
  const vIndex = vehicleIndex()
  const [list, warn] = filterOrders(input, vIndex)
  if (warn) return { error: warn }
  const total = list.reduce((s, o) => s + o.totalCost, 0)
  const by = input.agrupar_por && input.agrupar_por !== 'ninguno' ? input.agrupar_por : null
  const limit = limitOf(input)
  if (!by) {
    const rows = list.map((o) => otRow(o, vIndex.get(o.plate)))
    if (input.orden === 'fecha') rows.sort((a, b) => (b.ingreso ?? '').localeCompare(a.ingreso ?? ''))
    else sortBy(rows, input.orden === 'cantidad' ? 'dias_taller' : 'costo')
    return { total_ot: list.length, costo_total: round(total), mostradas: Math.min(limit, rows.length), ot: rows.slice(0, limit) }
  }
  const groups = new Map()
  for (const o of list) {
    const v = vIndex.get(o.plate)
    const k = groupKey(by, o, v)
    let g = groups.get(k)
    if (!g) groups.set(k, (g = { grupo: k, ot: 0, costo: 0, plates: new Set(), daysSum: 0, daysN: 0, prep: 0 }))
    g.ot += 1
    g.costo += o.totalCost
    g.plates.add(o.plate)
    if (isPreparation(o)) g.prep += 1
    const d = o.closedDate ? days(o.receivedDate, o.closedDate) : null
    if (d != null && d >= 0) {
      g.daysSum += d
      g.daysN += 1
    }
  }
  const rows = [...groups.values()].map((g) => ({
    grupo: g.grupo,
    ot: g.ot,
    costo: round(g.costo),
    costo_promedio_ot: round(g.costo / g.ot),
    patentes: g.plates.size,
    dias_promedio_taller_cerradas: g.daysN ? Math.round((g.daysSum / g.daysN) * 10) / 10 : null,
    ot_preparacion: g.prep || undefined,
  }))
  if (by === 'mes') rows.sort((a, b) => a.grupo.localeCompare(b.grupo))
  else sortBy(rows, input.orden === 'cantidad' ? 'ot' : 'costo')
  return { total_ot: list.length, costo_total: round(total), grupos_totales: rows.length, grupos: rows.slice(0, by === 'mes' ? 200 : limit) }
}

function consultarRepuestos(input) {
  const vIndex = vehicleIndex()
  const [list, warn] = filterOrders(input, vIndex)
  if (warn) return { error: warn }
  const by = input.agrupar_por || 'descripcion'
  const groups = new Map()
  let total = 0
  let lines = 0
  for (const o of list) {
    const v = vIndex.get(o.plate)
    for (const l of o.lines) {
      if (input.texto_linea && !has(l.description, input.texto_linea) && !has(l.code, input.texto_linea)) continue
      const prev = isPreventiveLine(l)
      if (input.tipo_linea === 'preventivas' && !prev) continue
      if (input.tipo_linea === 'correctivas' && prev) continue
      const k =
        by === 'descripcion' ? l.description || l.code
        : by === 'codigo' ? l.code
        : by === 'patente' ? o.plate
        : by === 'modelo' ? (v ? `${v.brand} ${v.model}` : 'Sin dato')
        : by === 'sucursal' ? branchOf(o)
        : by === 'mes' ? o.receivedDate?.slice(0, 7) || 'Sin fecha'
        : 'Total'
      let g = groups.get(k)
      if (!g) groups.set(k, (g = { grupo: k, codigo: by === 'descripcion' ? l.code : undefined, cantidad: 0, total: 0, ots: new Set(), plates: new Set() }))
      g.cantidad += l.qty || 0
      g.total += l.total || 0
      g.ots.add(o.workOrder)
      g.plates.add(o.plate)
      total += l.total || 0
      lines += 1
    }
  }
  const rows = [...groups.values()].map((g) => ({
    grupo: g.grupo,
    codigo: g.codigo,
    cantidad: Math.round(g.cantidad * 100) / 100,
    total: round(g.total),
    costo_unitario_promedio: g.cantidad ? round(g.total / g.cantidad) : null,
    ot: g.ots.size,
    patentes: g.plates.size,
  }))
  if (by === 'mes') rows.sort((a, b) => a.grupo.localeCompare(b.grupo))
  else sortBy(rows, input.orden === 'cantidad' ? 'cantidad' : 'total')
  const limit = limitOf(input, 30)
  return { ot_consideradas: list.length, lineas: lines, total: round(total), grupos_totales: rows.length, grupos: rows.slice(0, by === 'mes' ? 200 : limit) }
}

function detalleVehiculo({ patente }) {
  const plate = String(patente || '').toUpperCase().replace(/\s+/g, '').replace(/^([A-Z]{2,4})-?(\d{2,4})$/, '$1-$2')
  const v = getVehicle(plate)
  if (!v) {
    const hist = WORK_ORDERS.filter((o) => o.plate === plate)
    if (!hist.length) return { error: `No existe la patente ${plate} en el maestro ni en las OT.` }
    return { aviso: 'La patente no está en el maestro de vehículos; solo tiene OT.', ot: hist.map((o) => ({ ...otRow(o, null), lineas: o.lines.slice(0, 15).map(lineRow) })) }
  }
  return {
    patente: v.plate,
    vin: v.vin,
    vehiculo: `${v.brand} ${v.model}`,
    tipo: v.kind,
    categoria: v.categoryLabel,
    anio: v.year,
    combustible: v.fuel,
    color: v.color,
    sucursal: v.branch,
    estado: v.statusLabel,
    cliente: v.client,
    area: v.area,
    propiedad: v.owner,
    centro_costo: v.costCenter,
    observacion: v.note || undefined,
    km_registrado: v.mileage,
    km_estimado_hoy: v.estMileage,
    km_por_dia: v.kmPerDay ? Math.round(v.kmPerDay) : null,
    proxima_mantencion_km: v.nextMaintenanceKm,
    km_restantes_segun_registro: v.kmToMaintenance,
    dias_para_mantencion_estimados: v.estDaysToMaintenance,
    fecha_mantencion_estimada: v.estDueDate,
    gasto_acumulado: round(v.totalCost),
    costo_por_km: v.costPerKm ? Math.round(v.costPerKm * 10) / 10 : null,
    total_ot: v.history.length,
    historial: v.history.slice(0, 40).map((o) => ({ ...otRow(o, v), lineas: o.lines.slice(0, 15).map(lineRow) })),
  }
}

const lineRow = (l) => ({ codigo: l.code, descripcion: l.description, cantidad: l.qty, total: round(l.total), preventiva: isPreventiveLine(l) })

function consultarFlota(input) {
  const branch = input.sucursal ? findBranch(input.sucursal) : null
  if (input.sucursal && !branch) return { error: `No existe la sucursal "${input.sucursal}".` }
  const list = getVehicles(branch?.id ?? ALL_BRANCHES, { includeSold: input.incluir_vendidos || input.estado === 'sold' }).filter(
    (v) =>
      (!input.estado || v.status === input.estado) &&
      has(v.brand, input.marca) &&
      has(v.model, input.modelo) &&
      (!input.categoria || has(v.categoryLabel, input.categoria) || has(v.category, input.categoria)) &&
      has(v.client, input.cliente) &&
      (!input.area || norm(v.area) === norm(input.area) || norm(v.areaRaw) === norm(input.area)) &&
      (!input.anio_desde || (v.year && v.year >= input.anio_desde)) &&
      (!input.anio_hasta || (v.year && v.year <= input.anio_hasta)),
  )
  const by = input.agrupar_por && input.agrupar_por !== 'ninguno' ? input.agrupar_por : null
  if (by) {
    const key = (v) =>
      ({ sucursal: v.branch, estado: v.statusLabel, marca: v.brand, modelo: `${v.brand} ${v.model}`, categoria: v.categoryLabel, cliente: v.client || 'Sin cliente', anio: String(v.year ?? 'Sin año'), area: v.area })[by]
    const m = new Map()
    list.forEach((v) => m.set(key(v), (m.get(key(v)) ?? 0) + 1))
    const rows = [...m.entries()].map(([grupo, vehiculos]) => ({ grupo, vehiculos })).sort((a, b) => b.vehiculos - a.vehiculos)
    return { total: list.length, grupos: rows.slice(0, limitOf(input, 40)) }
  }
  const limit = limitOf(input, 40)
  return {
    total: list.length,
    mostrados: Math.min(limit, list.length),
    vehiculos: list.slice(0, limit).map((v) => ({
      patente: v.plate,
      vehiculo: `${v.brand} ${v.model}`,
      anio: v.year,
      categoria: v.categoryLabel,
      sucursal: v.branch,
      estado: v.statusLabel,
      cliente: v.client,
      km: v.mileage,
      km_estimado_hoy: v.estMileage,
    })),
  }
}

function otAbiertas(input) {
  const branch = input.sucursal ? findBranch(input.sucursal) : null
  if (input.sucursal && !branch) return { error: `No existe la sucursal "${input.sucursal}".` }
  const list = getOpenWorkOrders(branch?.id ?? ALL_BRANCHES).filter((o) => o.daysOpen >= (input.min_dias || 0))
  const limit = limitOf(input, 60)
  const m = (o) => o.management
  return {
    total: list.length,
    criticas: list.filter((o) => o.flags.critical).length,
    sin_gestion: list.filter((o) => o.flags.noManagement).length,
    compromiso_vencido: list.filter((o) => o.flags.overdue).length,
    esperando_repuesto: list.filter((o) => o.flags.parts).length,
    mostradas: Math.min(limit, list.length),
    ot: list.slice(0, limit).map((o) => ({
      ot: o.workOrder,
      patente: o.plate,
      vehiculo: o.vehicle,
      sucursal: o.branch,
      cliente: o.client,
      dias: o.daysOpen,
      estado_sap: o.sapStatus,
      motivo: o.reason,
      costo_a_la_fecha: round(o.totalCost),
      estado_real: m(o).realStatus,
      responsable: m(o).responsible || null,
      prioridad: m(o).priority,
      bloqueo: m(o).blocker,
      compromiso: m(o).commitmentDate || null,
      proxima_accion: m(o).nextAction || null,
      alertas: Object.entries(o.flags).filter(([, x]) => x).map(([k]) => k),
    })),
  }
}

function mantenciones(input) {
  const branch = input.sucursal ? findBranch(input.sucursal) : null
  const list = getMaintenanceForecast(branch?.id ?? ALL_BRANCHES, input.dias || 30)
  const limit = limitOf(input, 50)
  return {
    vencidas: list.filter((v) => v.due === 'late').length,
    proximas: list.filter((v) => v.due === 'soon').length,
    mostradas: Math.min(limit, list.length),
    vehiculos: list.slice(0, limit).map((v) => ({
      patente: v.plate,
      vehiculo: `${v.brand} ${v.model}`,
      sucursal: v.branch,
      cliente: v.client,
      situacion: v.due === 'late' ? 'vencida' : 'próxima',
      km_registrado: v.mileage,
      km_estimado_hoy: v.estMileage,
      km_por_dia: v.kmPerDay ? Math.round(v.kmPerDay) : null,
      mantencion_a_los_km: v.nextMaintenanceKm,
      fecha_estimada: v.estDueDate,
      dias: v.estDaysToMaintenance,
      km_restantes_segun_registro: v.kmToMaintenance,
    })),
  }
}

function rankingGasto(input) {
  const branch = input.sucursal ? findBranch(input.sucursal) : null
  const rows = getCostRanking(branch?.id ?? ALL_BRANCHES, { from: input.desde, to: input.hasta })
  const limit = limitOf(input, 25)
  return {
    vehiculos_con_gasto: rows.length,
    gasto_total: round(rows.reduce((s, r) => s + r.spend, 0)),
    preparacion_total: round(rows.reduce((s, r) => s + r.preparation, 0)),
    vehiculos: rows.slice(0, limit).map((r) => ({
      patente: r.plate,
      vehiculo: r.vehicle,
      anio: r.year,
      km: r.mileage,
      sucursal: r.branch,
      categoria: r.category,
      ot: r.orders,
      ot_correctivas: r.correctiveOrders,
      gasto: round(r.spend),
      preventivo: round(r.preventive),
      correctivo: round(r.corrective),
      siniestros: round(r.accident),
      preparacion: round(r.preparation),
      veces_promedio_categoria: Math.round(r.ratio * 10) / 10,
      sugerencia: r.advice === 'sell' ? 'Evaluar venta' : r.advice === 'review' ? 'Revisar' : null,
    })),
  }
}

function compararSucursales(input) {
  return {
    sucursales: getBranchComparison({ from: input.desde, to: input.hasta }).map((r) => ({
      sucursal: r.branch,
      vehiculos: r.vehicles,
      disponibilidad: r.availability == null ? null : Math.round(r.availability * 1000) / 10,
      en_taller: r.workshop,
      ot_abiertas: r.openOrders,
      dias_promedio_abiertas: r.avgDays == null ? null : Math.round(r.avgDays * 10) / 10,
      ot_mas_15_dias: r.stalled,
      ot_periodo: r.orders,
      gasto_periodo: round(r.total),
      correctivo_periodo: round(r.corrective),
      gasto_por_vehiculo: round(r.perVehicle),
    })),
  }
}

// ----------------------------------------------- análisis libre (Web Worker)
const WORKER_SRC = `
let DATA = null
self.onmessage = (e) => {
  const m = e.data
  if (m.type === 'data') { DATA = m.data; return }
  try {
    const fn = new Function('ot', 'vehiculos', 'hoy', '"use strict";\\n' + m.code)
    const out = fn(DATA.ot, DATA.vehiculos, DATA.hoy)
    self.postMessage({ id: m.id, ok: true, result: JSON.parse(JSON.stringify(out === undefined ? null : out)) })
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.stack || err).slice(0, 1500) })
  }
}`

let worker = null
let seq = 0
function analysisData() {
  const vIndex = vehicleIndex()
  return {
    hoy: iso(TODAY),
    ot: WORK_ORDERS.map((o) => ({
      ot: o.workOrder,
      patente: o.plate,
      sucursal: branchOf(o),
      cliente: clientOf(o),
      area: o.area,
      ingreso: o.receivedDate,
      cierre: o.closedDate || null,
      estado_sap: o.sapStatus,
      abierta: ['no iniciada', 'proceso'].includes(norm(o.sapStatus)),
      tipo: o.interventionType,
      preparacion: isPreparation(o),
      motivo: o.reason,
      km: o.mileage || null,
      costo: o.totalCost,
      creado_por: o.createdBy,
      lineas: o.lines.map((l) => ({ codigo: l.code, descripcion: l.description, cantidad: l.qty, costo_unitario: l.unitCost, total: l.total, preventiva: isPreventiveLine(l) })),
    })),
    vehiculos: [...vIndex.values()].map((v) => ({
      patente: v.plate,
      marca: v.brand,
      modelo: v.model,
      categoria: v.categoryLabel,
      anio: v.year,
      combustible: v.fuel,
      sucursal: v.branch,
      estado: v.statusLabel,
      cliente: v.client,
      area: v.area,
      km: v.mileage,
      km_estimado_hoy: v.estMileage,
      km_por_dia: v.kmPerDay,
      proxima_mantencion_km: v.nextMaintenanceKm,
      dias_para_mantencion: v.estDaysToMaintenance,
    })),
  }
}

function getWorker() {
  if (!worker) {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })))
    worker.postMessage({ type: 'data', data: analysisData() })
  }
  return worker
}

function analisisAvanzado({ codigo }) {
  return new Promise((resolve) => {
    const w = getWorker()
    const id = ++seq
    const timer = setTimeout(() => {
      w.terminate()
      worker = null
      resolve({ error: 'El análisis tardó más de 15 segundos y se detuvo. Simplifique el cálculo.' })
    }, 15_000)
    const onMsg = (e) => {
      if (e.data.id !== id) return
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      resolve(e.data.ok ? { resultado: e.data.result } : { error: e.data.error })
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ id, code: String(codigo || '') })
  })
}

// ------------------------------------------------------------- despacho
const STEP_LABEL = {
  consultar_ot: 'Consultando órdenes de trabajo',
  consultar_repuestos: 'Analizando repuestos y mano de obra',
  detalle_vehiculo: 'Revisando el expediente',
  consultar_flota: 'Consultando la flota',
  ot_abiertas: 'Revisando vehículos en taller',
  mantenciones: 'Revisando mantenciones',
  ranking_gasto: 'Calculando ranking de gasto',
  comparar_sucursales: 'Comparando sucursales',
  analisis_avanzado: 'Ejecutando análisis',
  mostrar_grafico: 'Preparando gráfico',
}

function describeStep(name, input) {
  const base = STEP_LABEL[name] ?? name
  if (name === 'analisis_avanzado' && input.descripcion) return `${base}: ${input.descripcion}`
  if (name === 'detalle_vehiculo') return `${base} de ${input.patente}`
  const bits = [input.patente, input.sucursal, input.cliente, input.modelo, input.texto || input.texto_linea, input.desde && `desde ${input.desde}`, input.hasta && `hasta ${input.hasta}`]
    .filter(Boolean)
    .join(' · ')
  const by = input.agrupar_por && input.agrupar_por !== 'ninguno' ? ` por ${input.agrupar_por.replace('_', ' ')}` : ''
  return `${base}${by}${bits ? ` (${bits})` : ''}`
}

function clip(result, max) {
  let text = JSON.stringify(result)
  if (text.length <= max) return text
  // recorta el arreglo más largo hasta que quepa
  const copy = structuredClone(result)
  const arrKey = Object.keys(copy).filter((k) => Array.isArray(copy[k])).sort((a, b) => copy[b].length - copy[a].length)[0]
  while (arrKey && copy[arrKey].length > 1 && text.length > max) {
    copy[arrKey] = copy[arrKey].slice(0, Math.floor(copy[arrKey].length * 0.7))
    copy.aviso = `Resultado recortado a ${copy[arrKey].length} elementos de "${arrKey}" por tamaño. Use filtros o agrupe para precisar.`
    text = JSON.stringify(copy)
  }
  return text.length > max ? text.slice(0, max) + '…[recortado]' : text
}

export async function runTool(name, input, charts = []) {
  switch (name) {
    case 'consultar_ot':
      return consultarOt(input)
    case 'consultar_repuestos':
      return consultarRepuestos(input)
    case 'detalle_vehiculo':
      return detalleVehiculo(input)
    case 'consultar_flota':
      return consultarFlota(input)
    case 'ot_abiertas':
      return otAbiertas(input)
    case 'mantenciones':
      return mantenciones(input)
    case 'ranking_gasto':
      return rankingGasto(input)
    case 'comparar_sucursales':
      return compararSucursales(input)
    case 'analisis_avanzado':
      return analisisAvanzado(input)
    case 'mostrar_grafico': {
      if (!Array.isArray(input.etiquetas) || !Array.isArray(input.series) || !input.series.length) return { error: 'Faltan etiquetas o series' }
      charts.push(input)
      return { ok: true, mensaje: 'Gráfico mostrado al usuario.' }
    }
    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

// ------------------------------------------------------------- instrucciones
function systemPrompt() {
  return `Eres el Analista Técnico de WEST IA, la herramienta de gestión de flota de West, empresa chilena de arriendo de vehículos (leasing operativo LOP y arriendo de corto plazo RAC) con taller central en La Serena y sucursales en el norte y centro de Chile. Hablas con el equipo de flota y taller: jefaturas, encargados de sucursal y gerencia.

Tu trabajo es responder con análisis serios y accionables sobre la flota, el taller y el gasto, usando SIEMPRE las herramientas para obtener los números. Nunca inventes cifras, patentes ni OT: si un dato no está en las herramientas, dilo.

Cómo trabajar:
- Antes de concluir, consulta lo necesario. Cruza fuentes cuando aporte (p. ej. gasto + repuestos + historial) y haz varias consultas en paralelo si son independientes.
- Si la pregunta es ambigua en período o alcance, asume lo razonable (por defecto el año en curso) y dilo en una línea.
- Distingue hechos (datos) de interpretaciones (hipótesis). Señala cuando una muestra es chica o un promedio engaña.
- Para cálculos que las herramientas no cubren, usa analisis_avanzado con código simple y resultados resumidos.
- Usa mostrar_grafico cuando una tendencia o comparación se entienda mejor visualmente.

Conceptos de los datos:
- OT = orden de trabajo del SAP. "Fecha de ingreso" es cuando el vehículo entra al taller. Abiertas = estado SAP "No iniciada" o "Proceso".
- Costos en pesos chilenos (CLP), suma de las líneas de la OT tal como vienen del SAP.
- Tipos de intervención: Correctiva, Preventiva, Preventiva + Correctiva, DYP (desabolladura y pintura), Compañía de seguros, Revisión técnica, Lavado, Equipamiento unidades nuevas, Otros.
- Las OT de preparación o equipamiento para clientes y faenas NO son fallas: el SAP a veces las marca como correctivas. Exclúyelas (excluir_preparacion) al analizar fallas o gasto de mantención, y menciónalo.
- Mantención preventiva cada 10.000 km. El km del maestro es el de la última OT; el km de hoy se estima con el ritmo de uso.
- Vehículos vendidos (USADOS) y pérdida total no son flota operativa.

Formato de respuesta (español de Chile, trato de usted, tono profesional y directo):
- Empieza con la conclusión en 1-2 frases. Luego el respaldo con cifras clave.
- Usa tablas markdown para listados o comparaciones; negritas solo para lo esencial. Sin relleno.
- Montos en formato $1.234.567 (punto de miles). Para millones puedes usar "$12,3 MM".
- Enlaza patentes como [ABCD-12](/flota/ABCD-12) y OT como [OT 1234567-01](/ot?ot=1234567-01).
- Cierra, cuando aplique, con 1-3 recomendaciones concretas (qué hacer, con qué vehículo o sucursal).

Datos cargados: ${META.source === 'sap' ? `SAP (${META.fileName}), OT del ${META.from} al ${META.to}, ${META.vehicles} vehículos en el maestro y ${META.workOrders} OT` : 'datos de demostración (ficticios)'}.
Sucursales: ${BRANCHES.map((b) => b.name).join('; ')}.`
}

// ------------------------------------------------------------- servidor
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status} del servidor`)
  return data
}

export async function getAiStatus() {
  try {
    const res = await fetch('/api/ia/estado')
    if (!res.ok) return { available: false }
    return { available: true, ...(await res.json()) }
  } catch {
    return { available: false }
  }
}

export const saveApiKey = (apiKey) => post('/api/ia/clave', { apiKey })
export const setProvider = (provider) => post('/api/ia/proveedor', { provider })

/**
 * Para la IA local: los resultados de preguntas anteriores se resumen a una
 * marca, así la conversación cabe en su memoria (si no, Ollama corta el inicio
 * y se pierden las instrucciones).
 */
function compactForLocal(history, turnStart) {
  return history.map((m, i) =>
    i >= turnStart || m.role !== 'user' || typeof m.content === 'string'
      ? m
      : { ...m, content: m.content.map((b) => (b.type === 'tool_result' ? { ...b, content: '[resultado de una pregunta anterior, omitido]' } : b)) },
  )
}

/**
 * Responde una pregunta. history = mensajes de la API de turnos anteriores
 * (se modifica agregando los de este turno). onStep(texto) informa el avance.
 */
export async function askAnalyst({ question, history, branchId, provider = 'claude', onStep, signal }) {
  const turnStart = history.length
  const branch = branchId && branchId !== ALL_BRANCHES ? branchName(branchId) : null
  history.push({
    role: 'user',
    content: `[Hoy es ${iso(TODAY)}. ${branch ? `En la app está seleccionada la sucursal ${branch}; úsela como alcance por defecto si la pregunta no indica otra.` : 'En la app están seleccionadas todas las sucursales.'}]\n\n${question}`,
  })
  const system = systemPrompt()
  const charts = []
  const steps = []
  let usd = 0
  for (let i = 0; i < MAX_STEPS; i++) {
    if (signal?.aborted) throw new Error('Consulta cancelada')
    const messages = provider === 'local' ? compactForLocal(history, turnStart) : history
    const res = await post('/api/ia/mensaje', { system, tools: TOOLS, messages })
    usd += res.usd || 0
    history.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'refusal') {
      return { text: 'No puedo responder esa consulta. Intente reformularla.', charts, steps, usd }
    }
    const calls = res.content.filter((b) => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !calls.length) {
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim()
      const cut = res.stop_reason === 'max_tokens' ? '\n\n_(La respuesta se cortó por largo. Pida que continúe o precise la pregunta.)_' : ''
      return { text: (text || 'Sin respuesta.') + cut, charts, steps, usd }
    }
    const results = await Promise.all(
      calls.map(async (c) => {
        const input = c.input && typeof c.input === 'object' ? c.input : {}
        const label = describeStep(c.name, input)
        steps.push(label)
        onStep?.(label, steps.length)
        try {
          const out = await runTool(c.name, input, charts)
          return { type: 'tool_result', tool_use_id: c.id, content: clip(out, MAX_RESULT_CHARS[provider] ?? MAX_RESULT_CHARS.claude), ...(out?.error ? { is_error: true } : {}) }
        } catch (e) {
          return { type: 'tool_result', tool_use_id: c.id, content: `Error: ${e?.message || e}`, is_error: true }
        }
      }),
    )
    history.push({ role: 'user', content: results })
  }
  return { text: 'El análisis requirió demasiados pasos y se detuvo. Intente una pregunta más acotada.', charts, steps, usd }
}

export const SUGGESTIONS = [
  '¿Qué vehículos debería evaluar vender y por qué?',
  '¿Qué repuestos se cambian más en las Hilux y cuánto nos cuestan?',
  'Compara las sucursales del norte en gasto y días en taller este año',
  '¿Qué clientes generan más gasto correctivo por vehículo?',
  'Tendencia mensual del gasto correctivo vs. preventivo',
  '¿Qué unidades en taller requieren acción urgente hoy?',
]
