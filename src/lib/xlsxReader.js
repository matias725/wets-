// Lector liviano de .xlsx pensado para archivos grandes del SAP (hojas de
// cientos de MB descomprimidas). Descomprime y procesa por partes, sin cargar
// todo el XML en memoria. Solo devuelve valores (sin formatos ni estilos):
// las fechas llegan como número de serie de Excel.
import { Unzip, UnzipInflate, unzipSync, strFromU8 } from 'fflate'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeXml = (s) =>
  s.indexOf('&') === -1
    ? s
    : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
        e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
      )

// Concatena todos los <t> de un fragmento (texto enriquecido incluido).
function joinT(xml) {
  let out = ''
  for (const m of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1]
  return decodeXml(out)
}

function parseSharedStrings(xml) {
  const list = []
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) list.push(m[1] ? joinT(m[1]) : '')
  return list
}

function colIndex(ref) {
  let n = 0
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i)
    if (c < 65 || c > 90) break
    n = n * 26 + (c - 64)
  }
  return n - 1
}

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const ATTR_R = /\br="([A-Z]+)\d*"/
const ATTR_T = /\bt="(\w+)"/
const ROW_NUM = /\br="(\d+)"/
const V_RE = /<v>([\s\S]*?)<\/v>/

function parseRows(xml, shared, rows) {
  for (const rm of xml.matchAll(ROW_RE)) {
    const rn = rm[1].match(ROW_NUM)
    const index = rn ? Number(rn[1]) - 1 : rows.length
    const row = []
    if (rm[2]) {
      let seq = 0
      for (const cm of rm[2].matchAll(CELL_RE)) {
        const attrs = cm[1]
        const ref = attrs.match(ATTR_R)
        const ci = ref ? colIndex(ref[1]) : seq
        seq = ci + 1
        const body = cm[2]
        if (!body) continue
        const type = attrs.match(ATTR_T)?.[1] ?? 'n'
        let value = null
        if (type === 'inlineStr') value = joinT(body)
        else {
          const v = body.match(V_RE)?.[1]
          if (v == null) continue
          if (type === 's') value = shared[Number(v)] ?? ''
          else if (type === 'str' || type === 'd') value = decodeXml(v)
          else if (type === 'b') value = v === '1'
          else if (type === 'e') value = null
          else value = Number(v)
        }
        row[ci] = value
      }
    }
    rows[index] = row
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * Lee todas las hojas de un .xlsx. Devuelve [{ name, rows }] donde rows[i] es
 * la fila i+1 como arreglo de valores (índice 0 = columna A).
 */
export async function readXlsx(buffer, onProgress = () => {}) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const meta = unzipSync(data, {
    filter: (f) => ['xl/sharedStrings.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'].includes(f.name),
  })
  const shared = meta['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(meta['xl/sharedStrings.xml'])) : []

  // Nombre de cada hoja según workbook.xml (solo informativo).
  const names = {}
  if (meta['xl/workbook.xml'] && meta['xl/_rels/workbook.xml.rels']) {
    const rels = {}
    for (const m of strFromU8(meta['xl/_rels/workbook.xml.rels']).matchAll(/<Relationship\b[^>]*>/g)) {
      const id = m[0].match(/\bId="([^"]+)"/)?.[1]
      const target = m[0].match(/\bTarget="([^"]+)"/)?.[1]
      if (id && target) rels[id] = 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '')
    }
    for (const m of strFromU8(meta['xl/workbook.xml']).matchAll(/<sheet\b[^>]*>/g)) {
      const name = m[0].match(/\bname="([^"]+)"/)?.[1]
      const rid = m[0].match(/\br:id="([^"]+)"/)?.[1]
      if (name && rels[rid]) names[rels[rid]] = decodeXml(name)
    }
  }

  const sheets = []
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (file) => {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(file.name)) return
    const sheet = { name: names[file.name] ?? file.name.replace(/^.*\//, '').replace('.xml', ''), rows: [] }
    sheets.push(sheet)
    const decoder = new TextDecoder()
    let pending = ''
    file.ondata = (err, chunk, final) => {
      if (err) throw err
      pending += decoder.decode(chunk, { stream: !final })
      const cut = final ? pending.length : pending.lastIndexOf('</row>') + 6
      if (cut > 5) {
        parseRows(pending.slice(0, cut), shared, sheet.rows)
        pending = pending.slice(cut)
      }
    }
    file.start()
  }

  const STEP = 1 << 20
  for (let i = 0; i < data.length; i += STEP) {
    const end = Math.min(i + STEP, data.length)
    unzip.push(data.subarray(i, end), end === data.length)
    onProgress(end / data.length)
    await tick()
  }
  return sheets
}
