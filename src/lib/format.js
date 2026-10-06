const clpFormatter = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const numberFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const clp = (n) => clpFormatter.format(Math.round(n || 0))
export const num = (n) => numberFormatter.format(Math.round(n || 0))
export const km = (n) => `${numberFormatter.format(Math.round(n || 0))} km`
export const pct = (n, digits = 0) => `${(n * 100).toFixed(digits).replace('.', ',')}%`

// Montos grandes en formato corto: $ 12,4 M
export function clpShort(n) {
  const abs = Math.abs(n || 0)
  if (abs >= 1e9) return `$ ${(n / 1e9).toFixed(1).replace('.', ',')} MM`
  if (abs >= 1e6) return `$ ${(n / 1e6).toFixed(1).replace('.', ',')} M`
  if (abs >= 1e3) return `$ ${Math.round(n / 1e3)} mil`
  return clp(n)
}

export function date(isoDate) {
  if (!isoDate) return '—'
  const [y, m, d] = isoDate.slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}
export function dateShort(isoDate) {
  if (!isoDate) return '—'
  const [, m, d] = isoDate.slice(0, 10).split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}
export const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`
export const monthLong = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
export const todayLong = (d = new Date()) => `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`

export const cx = (...parts) => parts.filter(Boolean).join(' ')
