// Otros Excel de la carpeta del SAP, además del SAP COMPLETO:
// - Catálogo de repuestos: código → clase (Preventivo, Correctivo, Neumáticos,
//   Equipamiento) y recuperabilidad. Puede haber varios archivos; se juntan.
// - Gestión de OT abiertas (Excel editable de WEST IA escritorio): estado real,
//   responsable, compromiso y observación de cada OT.
// Trabaja sobre hojas leídas con readXlsx ([{ name, rows }]).

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const text = (v) => (v == null ? '' : String(v).trim())
export const partKey = (code) => text(code).toUpperCase().replace(/\s+/g, '')

// clase por nombre de hoja
const CLASS_BY_SHEET = { preventivo: 'P', correctivo: 'C', neumaticos: 'N', equipamiento: 'E' }
export const PART_CLASS_LABEL = { P: 'Preventivo', C: 'Correctivo', N: 'Neumáticos', E: 'Equipamiento' }

function findHeader(rows, test, maxRows = 12) {
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const r = rows[i]
    if (!r) continue
    const cells = r.map(norm)
    const idx = test(cells)
    if (idx) return { row: i, ...idx }
  }
  return null
}

const codeHeader = (cells) => {
  const code = cells.findIndex((c) => c === 'codigo')
  const desc = cells.findIndex((c) => c.startsWith('descripcion'))
  if (code < 0 || desc < 0) return null
  return { code, desc, rec: cells.findIndex((c) => c === 'recuperabilidad') }
}

/** Qué tipo de archivo es: 'sap' | 'repuestos' | 'gestion' | null. */
export function detectKind(sheets) {
  for (const ws of sheets) {
    const h = findHeader(ws.rows, (cells) => (cells.includes('no ot') && cells.includes('patente') && cells.includes('costo total') ? {} : null), 15)
    if (h) return 'sap'
  }
  if (sheets.some((ws) => findHeader(ws.rows, (cells) => (cells.includes('patente') && cells.some((c) => c.startsWith('estado actual real')) ? {} : null)))) return 'gestion'
  if (sheets.some((ws) => CLASS_BY_SHEET[norm(ws.name)] && findHeader(ws.rows, codeHeader))) return 'repuestos'
  return null
}

/** { CODIGO: { c: 'P'|'C'|'N'|'E', r?: 'NO cobrable' } } */
export function parsePartsCatalog(sheets) {
  const out = {}
  for (const ws of sheets) {
    const cls = CLASS_BY_SHEET[norm(ws.name)]
    if (!cls) continue
    const h = findHeader(ws.rows, codeHeader)
    if (!h) continue
    for (let i = h.row + 1; i < ws.rows.length; i++) {
      const r = ws.rows[i]
      const code = partKey(r?.[h.code])
      if (!code) continue
      const rec = h.rec >= 0 ? norm(r[h.rec]) : ''
      out[code] = rec.startsWith('no cobrable') ? { c: cls, r: 'NO cobrable' } : { c: cls }
    }
  }
  return out
}

function isoDate(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10)
  const s = text(v)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

/** { cut: 'AAAA-MM-DDTHH:MM', items: { OT: { realStatus, responsible, commitmentDate, note } } } */
export function parseGestion(sheets) {
  const ws = sheets.find((s) => findHeader(s.rows, (cells) => (cells.includes('patente') && cells.some((c) => c.startsWith('estado actual real')) ? {} : null)))
  if (!ws) return null
  const h = findHeader(ws.rows, (cells) => {
    const at = (p) => cells.findIndex((c) => c.startsWith(p))
    const ot = cells.findIndex((c) => /^n\.?\s*º?\s*ot$|^no ot$|^n° ot$/.test(c))
    const status = at('estado actual real')
    return ot >= 0 && status >= 0 ? { ot, status, resp: at('responsable'), commit: at('fecha compromiso'), note: at('observacion') } : null
  })
  if (!h) return null
  const items = {}
  for (let i = h.row + 1; i < ws.rows.length; i++) {
    const r = ws.rows[i]
    const ot = text(r?.[h.ot])
    if (!ot) continue
    const item = {}
    const status = text(r[h.status])
    if (status) item.realStatus = status
    const resp = text(r[h.resp])
    if (resp) item.responsible = resp
    const commit = isoDate(r[h.commit])
    if (commit) item.commitmentDate = commit
    const note = h.note >= 0 ? text(r[h.note]) : ''
    if (note) item.note = note
    if (Object.keys(item).length) items[ot] = item
  }
  // fecha de corte: "Generado: 06-10-2026 13:54" en las primeras filas
  let cut = ''
  for (const row of ws.rows.slice(0, h.row)) {
    const m = (row ?? []).map(text).join(' ').match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/)
    if (m) {
      cut = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`
      break
    }
  }
  return { cut, items }
}

/** Filas de la hoja de fotos: [{ row (base 0), workOrder, plate }] por cada "FOTO n · PATENTE". */
export function photoBlocks(sheets) {
  const ws = sheets.find((s) => norm(s.name) === 'fotos')
  if (!ws) return []
  const blocks = []
  ws.rows.forEach((r, i) => {
    const cells = (r ?? []).map(text)
    const title = cells.find((c) => /^FOTO \d+ · /i.test(c))
    if (title) blocks.push({ row: i, plate: title.split('·')[1].trim(), workOrder: '' })
    const k = cells.findIndex((c) => norm(c).replace(/[.º°]/g, '').replace(/\s+/g, ' ') === 'n ot')
    if (k >= 0 && blocks.length && !blocks.at(-1).workOrder) blocks.at(-1).workOrder = cells[k + 1]
  })
  return blocks
}
