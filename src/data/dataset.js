// Origen de los datos: SAP real (si existe public/data/west-real.json) o demostración.
import * as demo from './generate'
import { REAL } from './realData'

const expandLines = (o) => ({
  ...o,
  lines: o.lines.map(([code, description, qty, unitCost, total, prev]) => ({ code, description, qty, unitCost, total, prev: Boolean(prev) })),
})

export const { TODAY, iso, addDays } = demo
export const META = REAL ? REAL.meta : { source: 'demo' }
export const VEHICLES = REAL ? REAL.vehicles : demo.VEHICLES
export const WORK_ORDERS = REAL ? REAL.workOrders.map(expandLines) : demo.WORK_ORDERS
export const MANAGEMENT = REAL ? {} : demo.MANAGEMENT
export const VISITS = REAL ? [] : demo.VISITS
export const STALLED_WITHOUT_OT = REAL ? [] : demo.STALLED_WITHOUT_OT
export const RESPONSIBLES_BY_BRANCH = REAL?.responsibles ?? null
