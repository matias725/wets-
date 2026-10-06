// Gráficos nativos de Excel. ExcelJS no los soporta, así que después de generar
// el .xlsx se agregan a mano las partes del gráfico (DrawingML) dentro del zip.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export const PALETTE = ['FFC400', '2A2723', '3B82F6', '22C55E', 'F97316', 'A78BFA', 'F472B6', '2DD4BF', '94A3B8', 'EF4444']

const NUM_FMT = {
  clp: '"$"#,##0',
  clpM: '"$"#,##0.0,,"M"',
  int: '#,##0',
  km: '#,##0" km"',
  pct: '0%',
  pct1: '0.0%',
  days: '0.0" d"',
  dec1: '#,##0.0',
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fill = (hex) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`
const text = (size, color = '595959', bold = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}">${fill(color)}<a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="es-CL"/></a:p></c:txPr>`

function title(t) {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-CL" sz="1200" b="1">${fill('2A2723')}<a:latin typeface="Calibri"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
}

function strLit(values) {
  return `<c:strLit><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strLit>`
}
function numLit(values, fmt) {
  return `<c:numLit><c:formatCode>${esc(fmt)}</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => (v == null || Number.isNaN(Number(v)) ? '' : `<c:pt idx="${i}"><c:v>${Number(v)}</c:v></c:pt>`))
    .join('')}</c:numLit>`
}

function dataLabels(fmt, { pos, percent = false, hide = [], light = [] } = {}) {
  // hide: puntos sin etiqueta (porciones muy chicas que se encimarían); light: etiqueta blanca (fondo oscuro)
  const flags = `<c:showLegendKey val="0"/><c:showVal val="${percent ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${percent ? 1 : 0}"/><c:showBubbleSize val="0"/>`
  const per =
    hide.map((i) => `<c:dLbl><c:idx val="${i}"/><c:delete val="1"/></c:dLbl>`).join('') +
    light
      .filter((i) => !hide.includes(i))
      .map((i) => `<c:dLbl><c:idx val="${i}"/><c:numFmt formatCode="${esc(percent ? '0%' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${text(800, 'FFFFFF', true)}${flags}</c:dLbl>`)
      .join('')
  return `<c:dLbls>${per}<c:numFmt formatCode="${esc(percent ? '0%' : fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${text(800, '404040')}${
    pos ? `<c:dLblPos val="${pos}"/>` : ''
  }<c:showLegendKey val="0"/><c:showVal val="${percent ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${percent ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
}

function axes({ fmt, horizontal }) {
  const line = `<c:spPr><a:ln w="9525">${fill('D9D9D9')}</a:ln></c:spPr>`
  const cat = `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${line}${text(800)}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  const val = `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350">${fill('ECECEC')}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${text(800)}<c:crossAx val="5001"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  return cat + val
}

/**
 * spec: { type: 'bar' | 'barH' | 'line' | 'doughnut', title, categories, series: [{ name, values, color }],
 *         stacked?, fmt? (clp, clpM, int, km, pct, days, dec1), labels? (mostrar valores) }
 */
export function chartXml(spec) {
  const fmt = NUM_FMT[spec.fmt] ?? spec.fmt ?? NUM_FMT.int
  const cats = spec.categories.map((c) => String(c))
  const series = spec.series.filter((s) => s.values?.length)
  const multi = series.length > 1
  let plot
  if (spec.type === 'doughnut') {
    const s = series[0]
    const sum = s.values.reduce((x, v) => x + (Number(v) || 0), 0)
    const small = s.values.map((v, i) => ((Number(v) || 0) / (sum || 1) < 0.03 ? i : -1)).filter((i) => i >= 0)
    const pts = cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(PALETTE[i % PALETTE.length])}<a:ln w="12700">${fill('FFFFFF')}</a:ln></c:spPr></c:dPt>`).join('')
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>${pts}${dataLabels(fmt, { percent: true, hide: small, light: cats.map((_, i) => i).filter((i) => ['2A2723', '3B82F6'].includes(PALETTE[i % PALETTE.length])) })}<c:cat>${strLit(cats)}</c:cat><c:val>${numLit(s.values, fmt)}</c:val></c:ser><c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`
  } else if (spec.type === 'line') {
    const sers = series
      .map((s, i) => {
        const color = s.color ?? PALETTE[i % PALETTE.length]
        return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${fill(color)}<a:ln w="9525">${fill('FFFFFF')}</a:ln></c:spPr></c:marker>${
          spec.labels ? dataLabels(fmt, { pos: 't' }) : ''
        }<c:cat>${strLit(cats)}</c:cat><c:val>${numLit(s.values, fmt)}</c:val><c:smooth val="0"/></c:ser>`
      })
      .join('')
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>${axes({ fmt })}`
  } else {
    const horizontal = spec.type === 'barH'
    const sers = series
      .map((s, i) => {
        const color = s.color ?? PALETTE[i % PALETTE.length]
        return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr>${fill(color)}</c:spPr><c:invertIfNegative val="0"/>${
          spec.labels ? dataLabels(fmt, { pos: spec.stacked ? 'ctr' : 'outEnd' }) : ''
        }<c:cat>${strLit(cats)}</c:cat><c:val>${numLit(s.values, fmt)}</c:val></c:ser>`
      })
      .join('')
    plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${spec.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="${horizontal ? 45 : 60}"/>${
      spec.stacked ? '<c:overlap val="100"/>' : '<c:overlap val="-5"/>'
    }<c:axId val="5001"/><c:axId val="5002"/></c:barChart>${axes({ fmt, horizontal })}`
  }
  const legend = multi || spec.type === 'doughnut' ? `<c:legend><c:legendPos val="${spec.type === 'doughnut' ? 'r' : 'b'}"/><c:overlay val="0"/>${text(850)}</c:legend>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="es-CL"/><c:roundedCorners val="0"/><c:chart>${title(spec.title)}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr>${fill('FFFFFF')}<a:ln w="9525">${fill('E5E5E5')}</a:ln></c:spPr>${text(900)}<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`
}

function anchor({ col, row, cols, rows }, n, rid) {
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${col > 0 ? 114300 : 0}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col + cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row + rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${1000 + n}" name="Gráfico ${n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
}

/**
 * Agrega los gráficos al .xlsx generado por ExcelJS.
 * charts: [{ sheetIndex (1 = primera hoja), at: { col, row, cols, rows } (base 0), spec }]
 * Cada hoja con gráficos debe tener al menos una imagen (el logo), para que
 * ExcelJS ya haya creado su dibujo.
 */
export function injectCharts(buffer, charts) {
  if (!charts.length) return buffer
  const files = unzipSync(new Uint8Array(buffer))
  const read = (p) => strFromU8(files[p])
  const write = (p, s) => (files[p] = strToU8(s))
  let types = read('[Content_Types].xml')
  const bySheet = new Map()
  charts.forEach((c) => bySheet.set(c.sheetIndex, [...(bySheet.get(c.sheetIndex) ?? []), c]))
  let n = 0
  for (const [sheetIndex, list] of bySheet) {
    const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`
    const target = files[relsPath] && read(relsPath).match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/)?.[1]
    if (!target) throw new Error(`La hoja ${sheetIndex} no tiene dibujo (falta el logo)`)
    const drawingPath = `xl/drawings/${target}`
    const drawingRels = `xl/drawings/_rels/${target}.rels`
    let drawing = read(drawingPath)
    let rels = files[drawingRels] ? read(drawingRels) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    if (!/xmlns:a=/.test(drawing)) drawing = drawing.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ')
    let anchors = ''
    for (const c of list) {
      n += 1
      const rid = `rIdChart${n}`
      write(`xl/charts/chart${n}.xml`, chartXml(c.spec))
      types = types.replace('</Types>', `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`)
      anchors += anchor(c.at, n, rid)
    }
    write(drawingPath, drawing.replace('</xdr:wsDr>', `${anchors}</xdr:wsDr>`))
    write(drawingRels, rels)
  }
  write('[Content_Types].xml', types)
  return zipSync(files, { level: 6 })
}
