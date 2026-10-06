// Origen de los datos: SAP real (si existe public/data/west-real.json) o demostración.
import * as demo from './generate'
import { REAL } from './realData'

const expandLines = (o) => ({
  ...o,
  lines: o.lines.map(([code, description, qty, unitCost, total, prev, cls]) => ({ code, description, qty, unitCost, total, prev: Boolean(prev), cls: cls || '' })),
})

export const { TODAY, iso, addDays } = demo
export const META = REAL ? REAL.meta : { source: 'demo' }
export const VEHICLES = REAL ? REAL.vehicles : demo.VEHICLES
export const WORK_ORDERS = REAL ? REAL.workOrders.map(expandLines) : demo.WORK_ORDERS
export const MANAGEMENT = REAL ? {} : demo.MANAGEMENT
export const VISITS = REAL ? [] : demo.VISITS
export const STALLED_WITHOUT_OT = REAL ? [] : demo.STALLED_WITHOUT_OT
export const RESPONSIBLES_BY_BRANCH = REAL?.responsibles ?? null
// gestión y fotos del Excel editable de OT abiertas (carpeta del SAP)
export const GESTION = REAL ? (globalThis.__WEST_GESTION__ ?? null) : null
