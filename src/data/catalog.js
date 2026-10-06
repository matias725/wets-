// Catálogos de la aplicación. Los valores de gestión OT (estado real, prioridad,
// bloqueo, tipo de intervención) son los mismos que usa WEST IA de escritorio,
// para que la conexión futura con su base de datos sea directa.

export const CATEGORIES = [
  { id: 'citycar', label: 'Citycar', color: '#38bdf8' },
  { id: 'sedan', label: 'Sedán', color: '#818cf8' },
  { id: 'suv', label: 'SUV', color: '#a78bfa' },
  { id: 'pickup-4x2', label: 'Camioneta 4x2', color: '#fbbf24' },
  { id: 'pickup-4x4', label: 'Camioneta 4x4', color: '#f59e0b' },
  { id: 'pickup-mining', label: 'Camioneta equipamiento minero', color: '#fb923c' },
  { id: 'other', label: 'Otra', color: '#94a3b8' },
]
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

// weight: peso relativo en la flota. north: multiplicador en sucursales del norte.
export const MODELS = [
  { brand: 'Kia', model: 'Morning', category: 'citycar', transmission: 'Manual', fuel: 'Bencina', weight: 5, north: 0.5, price: 28_000 },
  { brand: 'Kia', model: 'Soluto', category: 'sedan', transmission: 'Manual', fuel: 'Bencina', weight: 5, north: 0.5, price: 32_000 },
  { brand: 'Suzuki', model: 'Baleno', category: 'sedan', transmission: 'Automática', fuel: 'Bencina', weight: 4, north: 0.5, price: 34_000 },
  { brand: 'Suzuki', model: 'Jimny', category: 'suv', transmission: 'Manual', fuel: 'Bencina', weight: 2, north: 0.8, price: 48_000 },
  { brand: 'Volkswagen', model: 'Nivus', category: 'suv', transmission: 'Automática', fuel: 'Bencina', weight: 3, north: 0.6, price: 46_000 },
  { brand: 'Volkswagen', model: 'T-Cross', category: 'suv', transmission: 'Automática', fuel: 'Bencina', weight: 3, north: 0.6, price: 50_000 },
  { brand: 'Seat', model: 'Ateca', category: 'suv', transmission: 'Automática', fuel: 'Bencina', weight: 2, north: 0.6, price: 56_000 },
  { brand: 'Toyota', model: '4Runner', category: 'suv', transmission: 'Automática', fuel: 'Bencina', weight: 1, north: 1.2, price: 89_000 },
  { brand: 'Peugeot', model: 'Landtrek 4x4', category: 'pickup-4x4', transmission: 'Manual', fuel: 'Diésel', weight: 3, north: 2.2, price: 68_000 },
  { brand: 'Toyota', model: 'Hilux 2.4 4x2', category: 'pickup-4x2', transmission: 'Manual', fuel: 'Diésel', weight: 4, north: 1.8, price: 58_000 },
  { brand: 'Toyota', model: 'Hilux 2.4 4x4', category: 'pickup-4x4', transmission: 'Manual', fuel: 'Diésel', weight: 4, north: 2.6, price: 70_000 },
  { brand: 'Toyota', model: 'Hilux 4x4 equipamiento minero', category: 'pickup-mining', transmission: 'Manual', fuel: 'Diésel', weight: 3, north: 4, price: 92_000 },
]

// Estados del vehículo (prompt) con su color semántico.
export const VEHICLE_STATUS = {
  available: { label: 'Disponible', color: '#22c55e' },
  rented: { label: 'Arrendado', color: '#3b82f6' },
  reserved: { label: 'Reservado', color: '#8b5cf6' },
  cleaning: { label: 'En limpieza', color: '#06b6d4' },
  workshop: { label: 'En taller', color: '#f59e0b' },
  out: { label: 'Fuera de servicio', color: '#ef4444' },
}

// Estados SAP de una OT. Activa = No iniciada o Proceso (regla WEST IA).
export const SAP_OT_STATUS = ['No iniciada', 'Proceso', 'Finalizada', 'Facturada']
export const ACTIVE_SAP_STATUS = new Set(['No iniciada', 'Proceso'])

export const REAL_STATUS = [
  'Pendiente actualizar',
  'A espera de ingreso a taller',
  'Trabajando en taller',
  'Esperando repuesto',
  'En concesionario',
  'Unidad en taller externo',
  'En Taller DyP',
  'En reparación por cía. de seguros',
  'Pendiente de documentos',
  'OT con problema de SAP',
  'Solo pendiente cierre de OT',
  'Unidad liberada',
  'Otro',
]

export const PRIORITIES = ['Crítica', 'Alta', 'Media', 'Baja', 'Sin definir']
export const PRIORITY_COLOR = {
  Crítica: '#ef4444',
  Alta: '#f97316',
  Media: '#f59e0b',
  Baja: '#22c55e',
  'Sin definir': '#64748b',
}

export const BLOCKERS = [
  'Sin bloqueo / liberable',
  'Repuesto',
  'Diagnóstico',
  'Garantía / concesionario',
  'Autorización cliente',
  'Seguro',
  'Mano de obra',
  'Documentación',
  'Prueba de ruta',
  'Taller externo',
  'Otro',
  'Sin definir',
]

export const INTERVENTION_TYPES = [
  { id: 'Preventiva', color: '#22c55e' },
  { id: 'Correctiva', color: '#3b82f6' },
  { id: 'Preventiva + Correctiva', color: '#8b5cf6' },
  { id: 'DYP', color: '#f97316' },
  { id: 'Taller externo', color: '#06b6d4' },
  { id: 'Compañía de seguros', color: '#ec4899' },
  { id: 'Lavado', color: '#94a3b8' },
  { id: 'Equipamiento unidades nuevas', color: '#eab308' },
]
export const INTERVENTION_COLOR = Object.fromEntries(INTERVENTION_TYPES.map((t) => [t.id, t.color]))

// Columnas del tablero de mantenciones. Cada estado real cae en una columna.
export const KANBAN_COLUMNS = [
  {
    id: 'pending',
    label: 'Pendiente',
    hint: 'Sin gestión o esperando ingreso',
    color: '#94a3b8',
    statuses: ['Pendiente actualizar', 'A espera de ingreso a taller', 'Pendiente de documentos', 'OT con problema de SAP', 'Otro'],
    dropStatus: 'A espera de ingreso a taller',
  },
  {
    id: 'workshop',
    label: 'En taller',
    hint: 'Trabajo en curso',
    color: '#f59e0b',
    statuses: ['Trabajando en taller', 'En Taller DyP'],
    dropStatus: 'Trabajando en taller',
  },
  {
    id: 'parts',
    label: 'Esperando repuestos',
    hint: 'Bloqueadas por repuesto',
    color: '#ef4444',
    statuses: ['Esperando repuesto'],
    dropStatus: 'Esperando repuesto',
  },
  {
    id: 'external',
    label: 'Externo',
    hint: 'Concesionario, seguro o taller externo',
    color: '#06b6d4',
    statuses: ['En concesionario', 'Unidad en taller externo', 'En reparación por cía. de seguros'],
    dropStatus: 'Unidad en taller externo',
  },
  {
    id: 'ready',
    label: 'Listo',
    hint: 'Liberada o solo falta cerrar la OT',
    color: '#22c55e',
    statuses: ['Solo pendiente cierre de OT', 'Unidad liberada'],
    dropStatus: 'Unidad liberada',
  },
]

export const EXPENSE_CATEGORIES = [
  { id: 'Correctivo', color: '#3b82f6' },
  { id: 'Preventivo', color: '#64748b' },
  { id: 'A cobro', color: '#22c55e' },
]
export const RECOVERY_STATUS = ['Por revisar', 'No recuperable', 'A cobro']
export const BUSINESS_AREAS = ['RAC', 'LOP']

// Semáforo de días detenida (mismo criterio que WEST IA de escritorio).
export function daysColor(days) {
  if (days <= 2) return '#22c55e'
  if (days <= 10) return '#f59e0b'
  if (days <= 20) return '#f97316'
  return '#ef4444'
}

// Documentos del vehículo: color según días restantes.
export const VEHICLE_DOCUMENTS = ['Revisión técnica', 'Permiso de circulación', 'SOAP', 'Seguro']
export function expiryColor(daysLeft) {
  if (daysLeft < 0) return '#ef4444'
  if (daysLeft < 30) return '#f59e0b'
  return '#22c55e'
}
