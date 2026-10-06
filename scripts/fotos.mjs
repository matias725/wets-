// Saca las fotos de la hoja "FOTOS" del Excel editable de OT abiertas y las
// asocia a su OT según el bloque "FOTO n · PATENTE" en el que están pegadas.
import { strFromU8, unzipSync } from 'fflate'
import { photoBlocks } from '../src/lib/sapExtras.js'

const attr = (xml, name) => xml.match(new RegExp(`${name}="([^"]+)"`))?.[1]
const resolve = (base, target) => {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  return parts.join('/')
}
const rels = (files, partPath) => {
  const p = partPath.replace(/([^/]+)$/, '_rels/$1.rels')
  if (!files[p]) return {}
  const out = {}
  for (const m of strFromU8(files[p]).matchAll(/<Relationship\b[^>]*>/g)) out[attr(m[0], 'Id')] = resolve(partPath, attr(m[0], 'Target'))
  return out
}

// anclas de imagen, con o sin prefijo xdr: según el programa que generó el Excel
const ANCHOR_RE = /<(?:xdr:)?(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:xdr:)?\1>/g
const ROW_RE = /<(?:xdr:)?from>[\s\S]*?<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/

/** → [{ workOrder, plate, ext, data (Uint8Array) }] */
export function extractPhotos(buffer, sheets) {
  const blocks = photoBlocks(sheets)
  if (!blocks.length) return []
  const files = unzipSync(new Uint8Array(buffer))
  const wb = strFromU8(files['xl/workbook.xml'])
  const sheetTag = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => /name="FOTOS"/i.test(t))
  if (!sheetTag) return []
  const sheetPath = rels(files, 'xl/workbook.xml')[attr(sheetTag, 'r:id')]
  const drawingPath = Object.values(rels(files, sheetPath)).find((t) => /drawings\/drawing\d+\.xml$/.test(t))
  if (!drawingPath || !files[drawingPath]) return []
  const media = rels(files, drawingPath)
  const xml = strFromU8(files[drawingPath])
  const out = []
  for (const m of xml.matchAll(ANCHOR_RE)) {
    const row = Number(m[0].match(ROW_RE)?.[1])
    const target = media[attr(m[0], 'r:embed')]
    if (Number.isNaN(row) || !target || !files[target]) continue
    const block = [...blocks].reverse().find((b) => b.row <= row)
    if (!block?.workOrder) continue
    out.push({ workOrder: block.workOrder, plate: block.plate, ext: target.split('.').pop().toLowerCase(), data: files[target] })
  }
  return out
}
