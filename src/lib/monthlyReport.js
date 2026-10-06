// Informe mensual para gerencia en Excel (varias hojas), a partir de getMonthlyReport().
import { monthLong } from './format'

const loadExcel = () => import('exceljs').then((m) => m.default ?? m)
const BRAND = 'FFFFC400'
const INK = 'FF2A2723'
const MONEY = '"$"#,##0'
const INT = '#,##0'
const PCT = '0.0%'

function table(ws, startRow, columns, rows) {
  const head = ws.getRow(startRow)
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, color: { argb: INK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    if (c.width) ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width ?? 0, c.width)
  })
  head.height = 22
  rows.forEach((r, j) => {
    const row = ws.getRow(startRow + 1 + j)
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      const v = typeof c.value === 'function' ? c.value(r) : r[c.value]
      cell.value = v ?? ''
      if (c.fmt) cell.numFmt = c.fmt
    })
  })
  ws.views = [{ state: 'frozen', ySplit: startRow }]
  return startRow + rows.length + 1
}

export async function downloadMonthlyReport(report) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WEST IA'
  const month = monthLong(report.month)
  const s = report.summary

  // ----------------------------------------------------------------- resumen
  const ws = wb.addWorksheet('Resumen')
  ws.getColumn(1).width = 44
  ws.getColumn(2).width = 22
  ws.getCell('A1').value = `Informe mensual de flota · ${month}`
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A2').value = `Fuente: ${report.source} · generado el ${report.generatedAt.split('-').reverse().join('-')}`
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } }
  const kpis = [
    ['Flota operativa (sin usados)', s.fleet, INT],
    ['Disponibilidad al día de hoy', s.availability, PCT],
    ['OT recibidas en el mes', s.received, INT],
    ['OT cerradas en el mes', s.closed, INT],
    ['Gasto del mes (OT cerradas)', s.spend, MONEY],
    ['   Preventivo', s.preventive, MONEY],
    ['   Correctivo', s.corrective, MONEY],
    ['   Preventivo sobre el gasto', s.spend ? s.preventive / s.spend : 0, PCT],
    ['OT abiertas al día de hoy', s.openNow, INT],
    ['   De ellas con más de 15 días', s.stalledNow, INT],
    ['Mantenciones por hacer (vencidas o a menos de 1.000 km)', report.maintenance.length, INT],
  ]
  let row = table(ws, 4, [{ header: 'Indicador', value: 0 }, { header: 'Valor', value: 1 }], kpis.map(([a, b]) => [a, b]))
  kpis.forEach(([, , fmt], i) => (ws.getCell(5 + i, 2).numFmt = fmt))
  row += 1
  ws.getCell(row, 1).value = 'Gasto del mes por tipo de intervención'
  ws.getCell(row, 1).font = { bold: true, size: 12 }
  table(ws, row + 1, [{ header: 'Tipo', value: 'type' }, { header: 'Gasto', value: 'total', fmt: MONEY }], report.byType)
  ws.views = []

  // -------------------------------------------------------------- sucursales
  table(wb.addWorksheet('Sucursales'), 1, [
    { header: 'Sucursal', value: 'branch', width: 28 },
    { header: 'Vehículos', value: 'vehicles', fmt: INT, width: 11 },
    { header: 'Disponibilidad hoy', value: 'availability', fmt: PCT, width: 14 },
    { header: 'En taller hoy', value: 'workshop', fmt: INT, width: 11 },
    { header: 'Días prom. en taller', value: (r) => (r.avgDays == null ? '' : Math.round(r.avgDays * 10) / 10), width: 13 },
    { header: 'OT > 15 días', value: 'stalled', fmt: INT, width: 11 },
    { header: 'OT del mes', value: 'orders', fmt: INT, width: 11 },
    { header: 'Gasto del mes', value: 'total', fmt: MONEY, width: 16 },
    { header: 'Gasto por vehículo', value: (r) => (r.perVehicle == null ? '' : Math.round(r.perVehicle)), fmt: MONEY, width: 16 },
  ], report.branches)

  // ---------------------------------------------------------- top vehículos
  table(wb.addWorksheet('Vehículos que más gastan'), 1, [
    { header: 'Patente', value: 'plate', width: 11 },
    { header: 'Vehículo', value: 'vehicle', width: 30 },
    { header: 'Año', value: 'year', width: 7 },
    { header: 'Sucursal', value: 'branch', width: 24 },
    { header: 'Km', value: 'mileage', fmt: INT, width: 11 },
    { header: 'OT', value: 'orders', fmt: INT, width: 6 },
    { header: 'Preventivo', value: 'preventive', fmt: MONEY, width: 14 },
    { header: 'Correctivo', value: 'corrective', fmt: MONEY, width: 14 },
    { header: 'Siniestros / DYP', value: 'accident', fmt: MONEY, width: 15 },
    { header: 'Gasto (sin preparación)', value: 'spend', fmt: MONEY, width: 15 },
    { header: 'Preparación / equipamiento', value: 'preparation', fmt: MONEY, width: 15 },
    { header: 'Total', value: 'total', fmt: MONEY, width: 15 },
    { header: 'Sugerencia', value: (r) => ({ sell: 'Evaluar venta', review: 'Revisar' })[r.advice] ?? '', width: 14 },
  ], report.topVehicles)

  // ------------------------------------------------------------- OT abiertas
  table(wb.addWorksheet('OT abiertas'), 1, [
    { header: 'OT', value: 'workOrder', width: 10 },
    { header: 'Patente', value: 'plate', width: 11 },
    { header: 'Vehículo', value: 'vehicle', width: 28 },
    { header: 'Sucursal', value: 'branch', width: 24 },
    { header: 'Días en taller', value: 'daysOpen', fmt: INT, width: 10 },
    { header: 'Tipo', value: 'interventionType', width: 20 },
    { header: 'Responsable', value: (o) => o.management.responsible, width: 22 },
    { header: 'Estado real', value: (o) => o.management.realStatus, width: 22 },
    { header: 'Motivo', value: 'reason', width: 50 },
  ], report.open)

  // ----------------------------------------------------------- mantenciones
  table(wb.addWorksheet('Mantenciones'), 1, [
    { header: 'Patente', value: 'plate', width: 11 },
    { header: 'Vehículo', value: (v) => `${v.brand} ${v.model}`, width: 30 },
    { header: 'Sucursal', value: 'branch', width: 24 },
    { header: 'Km actual', value: 'mileage', fmt: INT, width: 12 },
    { header: 'Mantención a los', value: 'nextMaintenanceKm', fmt: INT, width: 14 },
    { header: 'Km restantes (negativo = vencida)', value: 'kmToMaintenance', fmt: INT, width: 18 },
  ], report.maintenance)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `WEST_IA_informe_${report.month}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
