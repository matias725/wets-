// Informes Excel con el diseño de WEST IA: portada con logo, tarjetas de
// indicadores, gráficos nativos y tablas con filtros, totales y barras de datos.
//
// buildReport({ title, subtitle, logo, sheets }) → Uint8Array (.xlsx)
//   sheet de resumen: { name, kind: 'dashboard', kpis?, charts?, tables? }
//   sheet de detalle: { name, kind: 'table', columns, rows, note? }
//   columna: { header, value (clave o función), fmt?, width?, total?: 'sum'|'avg'|'count', bar?: true, scale?: 'bad-high'|'good-high' }
import { injectCharts } from './charts.js'

const loadExcel = () => import('exceljs').then((m) => m.default ?? m)

const INK = 'FF2A2723'
const BRAND = 'FFFFC400'
const MUTED = 'FF6B7280'
const LINE = 'FFE5E5E5'
const ZEBRA = 'FFFAFAF7'
const CARD = 'FFF7F6F2'
const FONT = 'Calibri'

export const FMT = {
  clp: '"$"#,##0',
  int: '#,##0',
  km: '#,##0" km"',
  pct: '0.0%',
  days: '#,##0',
  dec1: '#,##0.0',
  date: 'dd-mm-yyyy',
  text: '@',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function cellValue(v, fmt) {
  if (v == null || v === '') return null
  if (fmt === 'date' && typeof v === 'string' && DATE_RE.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  return v
}
const pick = (c, r) => (typeof c.value === 'function' ? c.value(r) : r[c.value])
const colLetter = (n) => {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function banner(ws, wb, logoId, { title, subtitle, span }) {
  ws.getRow(1).height = 30
  ws.getRow(2).height = 20
  ws.getRow(3).height = 8
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= span; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  }
  for (let c = 1; c <= span; c++) ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
  ws.getRow(3).height = 4
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 92, height: 34 }, editAs: 'oneCell' })
  const t = ws.getCell(1, 3)
  t.value = title
  t.font = { name: FONT, size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  t.alignment = { vertical: 'middle' }
  const s = ws.getCell(2, 3)
  s.value = subtitle
  s.font = { name: FONT, size: 9, color: { argb: 'FFC9C6BE' } }
  s.alignment = { vertical: 'top' }
}

function kpiCards(ws, kpis, startRow) {
  // 4 tarjetas por fila, cada una de 3 columnas
  kpis.forEach((k, i) => {
    const r = startRow + Math.floor(i / 4) * 4
    const c = 1 + (i % 4) * 3
    for (let rr = r; rr < r + 3; rr++) {
      for (let cc = c; cc < c + 3; cc++) {
        ws.getCell(rr, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CARD } }
        // borde blanco a la derecha: separa las tarjetas
        ws.getCell(rr, cc).border = cc === c + 2 ? { right: { style: 'thick', color: { argb: 'FFFFFFFF' } } } : {}
      }
      ws.getCell(rr, c).border = { left: { style: 'thick', color: { argb: k.color ?? BRAND } } }
    }
    ws.mergeCells(r, c, r, c + 2)
    ws.mergeCells(r + 1, c, r + 1, c + 2)
    ws.mergeCells(r + 2, c, r + 2, c + 2)
    // montos grandes en millones para que quepan; el valor exacto va abajo
    let fmt = FMT[k.fmt] ?? k.fmt ?? FMT.int
    let hintText = k.hint ?? ''
    if (k.fmt === 'clp' && Math.abs(k.value ?? 0) >= 1e8) {
      fmt = '"$"#,##0.0,,"M"'
      hintText = [`$${Math.round(k.value).toLocaleString('es-CL')}`, k.hint].filter(Boolean).join(' · ')
    }
    const label = ws.getCell(r, c)
    label.value = k.label.toUpperCase()
    label.font = { name: FONT, size: 8, bold: true, color: { argb: MUTED } }
    label.alignment = { vertical: 'bottom', indent: 1 }
    const value = ws.getCell(r + 1, c)
    value.value = k.value ?? '—'
    value.numFmt = fmt
    value.font = { name: FONT, size: 20, bold: true, color: { argb: INK } }
    value.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    const hint = ws.getCell(r + 2, c)
    hint.value = hintText
    hint.font = { name: FONT, size: 8, color: { argb: MUTED } }
    hint.alignment = { vertical: 'top', indent: 1, wrapText: true }
    ws.getRow(r).height = 18
    ws.getRow(r + 1).height = 30
    ws.getRow(r + 2).height = 26
  })
  return startRow + Math.ceil(kpis.length / 4) * 4
}

function sectionTitle(ws, row, text, span = 11) {
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: FONT, size: 12, bold: true, color: { argb: INK } }
  for (let c = 1; c <= span; c++) ws.getCell(row, c).border = { bottom: { style: 'thin', color: { argb: BRAND } } }
  ws.getRow(row).height = 22
}

/** Tabla con estilo. Devuelve la fila siguiente a la tabla. */
function styledTable(ws, startRow, columns, rows, { filter = true, totals = true, startCol = 1, spans = null } = {}) {
  const pos = []
  columns.forEach((c, i) => pos.push(i === 0 ? startCol : pos[i - 1] + (spans?.[i - 1] ?? 1)))
  const merge = (r, i) => spans && spans[i] > 1 && ws.mergeCells(r, pos[i], r, pos[i] + spans[i] - 1)
  const head = ws.getRow(startRow)
  head.height = 30
  columns.forEach((c, i) => {
    merge(startRow, i)
    const cell = head.getCell(pos[i])
    cell.value = c.header
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND } } }
  })
  rows.forEach((r, j) => {
    const row = ws.getRow(startRow + 1 + j)
    columns.forEach((c, i) => {
      merge(startRow + 1 + j, i)
      const cell = row.getCell(pos[i])
      cell.value = cellValue(pick(c, r), c.fmt)
      if (c.fmt && FMT[c.fmt]) cell.numFmt = FMT[c.fmt]
      cell.font = { name: FONT, size: 10, bold: Boolean(c.bold), color: { argb: INK } }
      cell.alignment = { vertical: 'middle', wrapText: Boolean(c.wrap) }
      cell.border = { bottom: { style: 'hair', color: { argb: LINE } } }
      if (j % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })
  })
  const first = startRow + 1
  const last = startRow + rows.length
  let next = last + 1
  if (totals && rows.length && columns.some((c) => c.total)) {
    const row = ws.getRow(next)
    row.height = 22
    columns.forEach((c, i) => {
      merge(next, i)
      const cell = row.getCell(pos[i])
      const L = colLetter(pos[i])
      if (i === 0) cell.value = 'Total (filas visibles)'
      else if (c.total) {
        const fn = { sum: 109, avg: 101, count: 103 }[c.total]
        cell.value = { formula: `SUBTOTAL(${fn},${L}${first}:${L}${last})` }
        cell.numFmt = c.total === 'count' ? FMT.int : (FMT[c.fmt] ?? FMT.int)
      }
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } }
      cell.border = { top: { style: 'thin', color: { argb: INK } } }
    })
    next += 1
  }
  if (rows.length) {
    columns.forEach((c, i) => {
      const ref = `${colLetter(pos[i])}${first}:${colLetter(pos[i])}${last}`
      if (c.bar) {
        ws.addConditionalFormatting({
          ref,
          rules: [{ type: 'dataBar', priority: 1, gradient: false, minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFFFD966' } }],
        })
      }
      if (c.scale) {
        const [lo, hi] = c.scale === 'good-high' ? ['FFF8696B', 'FF63BE7B'] : ['FF63BE7B', 'FFF8696B']
        ws.addConditionalFormatting({
          ref,
          rules: [{ type: 'colorScale', priority: 2, cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: lo }, { argb: 'FFFFEB84' }, { argb: hi }] }],
        })
      }
    })
    if (filter) ws.autoFilter = { from: { row: startRow, column: startCol }, to: { row: last, column: pos.at(-1) } }
  }
  return next
}

function autoWidths(ws, columns, rows, startCol = 1) {
  columns.forEach((c, i) => {
    if (c.width) {
      ws.getColumn(startCol + i).width = c.width
      return
    }
    const sample = rows.slice(0, 300).map((r) => {
      const v = pick(c, r)
      if (v == null) return 0
      if (typeof v === 'number') return (c.fmt === 'clp' ? 13 : 9) + (Math.abs(v) >= 1e6 ? 2 : 0)
      return String(v).length
    })
    const longest = Math.max(String(c.header).length + 3, ...sample, 6)
    ws.getColumn(startCol + i).width = Math.min(Math.max(11, longest + 2), c.wrap ? 60 : 45)
  })
}

const pageSetup = (ws, landscape = true) => {
  ws.pageSetup = { orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  ws.headerFooter = { oddFooter: '&L&8WEST IA · Gestión de flota&R&8Página &P de &N' }
}

export async function buildReport({ title, subtitle, logo, sheets }) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WEST IA'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }
  const logoId = logo ? wb.addImage({ buffer: logo, extension: 'png' }) : null
  const charts = []

  sheets.forEach((sheet, idx) => {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), { properties: { tabColor: { argb: idx === 0 ? BRAND : INK } }, views: [{ showGridLines: false }] })
    const sheetIndex = idx + 1
    if (sheet.kind === 'dashboard') {
      for (let c = 1; c <= 12; c++) ws.getColumn(c).width = 10.5
      banner(ws, wb, logoId, { title: sheet.title ?? title, subtitle: sheet.subtitle ?? subtitle, span: 12 })
      let row = 5
      if (sheet.kpis?.length) row = kpiCards(ws, sheet.kpis, row)
      if (sheet.charts?.length) {
        sectionTitle(ws, row, 'Gráficos', 12)
        row += 2
        // dos gráficos por fila (A-E y G-K); los "wide" ocupan el ancho completo
        let left = 0 // alto del gráfico que quedó solo a la izquierda
        const place = (spec, col, cols) => charts.push({ sheetIndex, at: { col, row: row - 1, cols, rows: spec.rows ?? 16 }, spec })
        sheet.charts.forEach((spec) => {
          const h = spec.rows ?? 16
          if (spec.wide || sheet.charts.length === 1) {
            if (left) row += left + 1
            left = 0
            place(spec, 0, 12)
            row += h + 1
          } else if (!left) {
            place(spec, 0, 6)
            left = h
          } else {
            place(spec, 6, 6)
            row += Math.max(left, h) + 1
            left = 0
          }
        })
        if (left) row += left + 1
      }
      for (const t of sheet.tables ?? []) {
        row += 1
        sectionTitle(ws, row, t.title, 12)
        row += 1
        // texto 4 columnas de la grilla, números 2
        const spans = t.columns.map((c) => c.span ?? (c.fmt && c.fmt !== 'text' ? 2 : 4))
        row = styledTable(ws, row, t.columns, t.rows, { filter: false, totals: t.totals !== false, spans })
        row += 1
      }
      if (sheet.notes?.length) {
        row += 1
        sheet.notes.forEach((n) => {
          const cell = ws.getCell(row++, 1)
          cell.value = n
          cell.font = { name: FONT, size: 8, italic: true, color: { argb: MUTED } }
        })
      }
      pageSetup(ws, false)
    } else {
      const cols = sheet.columns
      autoWidths(ws, cols, sheet.rows)
      banner(ws, wb, logoId, { title: sheet.title ?? title, subtitle: sheet.subtitle ?? subtitle, span: Math.max(cols.length, 6) })
      if (ws.getColumn(1).width < 14) ws.getColumn(1).width = 14
      const info = ws.getCell(4, 1)
      info.value = sheet.note ?? `${sheet.rows.length.toLocaleString('es-CL')} filas · use los filtros del encabezado; el total se ajusta a lo filtrado`
      info.font = { name: FONT, size: 8, italic: true, color: { argb: MUTED } }
      ws.getRow(4).height = 16
      styledTable(ws, 5, cols, sheet.rows)
      ws.views = [{ state: 'frozen', ySplit: 5, xSplit: sheet.freezeCols ?? 0, showGridLines: false }]
      pageSetup(ws, true)
      ws.pageSetup.printTitlesRow = '5:5'
    }
  })

  const buffer = await wb.xlsx.writeBuffer()
  return injectCharts(buffer, charts)
}

/** Descarga el informe en el navegador. */
export async function downloadReport(filename, spec) {
  const logo = await loadLogo()
  const bytes = await buildReport({ ...spec, logo })
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

let logoCache = null
async function loadLogo() {
  if (logoCache) return logoCache
  try {
    const { default: url } = await import('@/assets/img/west_logo_yellow.png')
    logoCache = new Uint8Array(await (await fetch(url)).arrayBuffer())
  } catch {
    logoCache = null
  }
  return logoCache
}
