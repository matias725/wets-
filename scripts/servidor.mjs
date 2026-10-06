// WEST IA en este computador: sirve la web y vigila la carpeta del SAP.
//
//   node scripts/servidor.mjs
//
// - Web en http://localhost:4310 (solo accesible desde este computador).
// - Al pegar un Excel del SAP en la carpeta vigilada (Escritorio\SAP), lo
//   procesa y la web avisa que hay datos nuevos. El archivo no sale del equipo.
// - Registro en public/data/vigilante.log
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { convertSapFile } from '../src/lib/sapImport.js'
import { readXlsx } from '../src/lib/xlsxReader.js'
import { detectKind, parseGestion, parsePartsCatalog } from '../src/lib/sapExtras.js'
import { extractPhotos } from './fotos.mjs'
import { createIaHandler } from './ia.mjs'
import { createWebStateHandler } from './estadoWeb.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const DATA = path.join(ROOT, 'public', 'data')
const PORT = Number(process.env.WEST_PORT) || 4310
const POLL_MS = 5000

function defaultFolder() {
  const oneDrive = path.join(os.homedir(), 'OneDrive', 'Desktop')
  return path.join(fs.existsSync(oneDrive) ? oneDrive : path.join(os.homedir(), 'Desktop'), 'SAP')
}
const WATCH = process.env.WEST_SAP_DIR || defaultFolder()

fs.mkdirSync(DATA, { recursive: true })
fs.mkdirSync(WATCH, { recursive: true })
const LOG = path.join(DATA, 'vigilante.log')
const STATE = path.join(DATA, 'estado.json')

function log(msg) {
  const line = `[${new Date().toLocaleString('es-CL')}] ${msg}`
  console.log(line)
  try {
    // el registro no crece sin límite: se recorta sobre 1 MB
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1_000_000) fs.writeFileSync(LOG, '')
    fs.appendFileSync(LOG, line + '\n')
  } catch {
    /* sin registro */
  }
}

const localStamp = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 19)
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'))
  } catch {
    return {}
  }
}
async function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(data))
  await fsp.rename(tmp, file)
}

// ------------------------------------------------------------------ vigilante
// La carpeta puede tener varios Excel; cada uno se reconoce por su contenido:
// - SAP COMPLETO (OT + maestro): el más reciente es la fuente de datos.
// - Catálogos de repuestos (hojas Preventivo / Correctivo / Neumáticos /
//   Equipamiento): se juntan todos; si un código se repite, gana el más nuevo.
// - Excel editable de OT abiertas: gestión (estado real, responsable,
//   compromiso, observación) y fotos; vale el más reciente.
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'preventiveCodes.json'), 'utf8'))
const PHOTOS = path.join(DATA, 'fotos')
let busy = false
let lastFolderKey = ''
const kinds = new Map() // clave de archivo → tipo, para no releerlo

async function listExcels() {
  const out = []
  for (const name of await fsp.readdir(WATCH)) {
    // ~$ = archivo temporal de Excel abierto
    if (!/\.xls[xm]$/i.test(name) || name.startsWith('~$')) continue
    const full = path.join(WATCH, name)
    const st = await fsp.stat(full).catch(() => null)
    if (!st?.isFile() || !st.size) continue
    // al pegar, Windows conserva la fecha de modificación: la de creación es la del pegado
    const time = Math.max(st.mtimeMs, st.birthtimeMs || 0)
    out.push({ name, full, size: st.size, time, key: `${name}|${st.size}|${Math.round(time)}` })
  }
  return out.sort((a, b) => a.time - b.time)
}

async function readSheets(file) {
  const buffer = await fsp.readFile(file.full)
  return { buffer, sheets: await readXlsx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)) }
}

async function kindOf(file) {
  if (!kinds.has(file.key)) kinds.set(file.key, detectKind((await readSheets(file)).sheets) ?? 'otro')
  return kinds.get(file.key)
}

async function processSap(file, parts, partsInfo) {
  const buffer = await fsp.readFile(file.full)
  const data = await convertSapFile(buffer, { fileName: file.name, catalog, parts })
  data.meta.generatedAt = localStamp()
  data.meta.loadedFrom = 'carpeta'
  data.meta.partsCatalog = partsInfo
  await writeJsonAtomic(path.join(DATA, 'west-real.json'), data)
  return data
}

async function processGestion(file) {
  const { buffer, sheets } = await readSheets(file)
  const g = parseGestion(sheets) ?? { cut: '', items: {} }
  const photos = extractPhotos(buffer, sheets)
  await fsp.rm(PHOTOS, { recursive: true, force: true })
  await fsp.mkdir(PHOTOS, { recursive: true })
  const count = {}
  for (const p of photos) {
    const n = (count[p.workOrder] = (count[p.workOrder] ?? 0) + 1)
    const name = `${p.workOrder.replace(/[^\w-]/g, '_')}_${n}.${p.ext === 'jpeg' ? 'jpg' : p.ext}`
    await fsp.writeFile(path.join(PHOTOS, name), p.data)
    const item = (g.items[p.workOrder] ??= {})
    item.photos = [...(item.photos ?? []), name]
  }
  const out = { file: file.name, cut: g.cut, processedAt: localStamp(), items: g.items }
  await writeJsonAtomic(path.join(DATA, 'gestion.json'), out)
  return { file: file.name, cut: g.cut, processedAt: out.processedAt, items: Object.keys(g.items).length, photos: photos.length }
}

async function tickWatcher() {
  if (busy) return
  busy = true
  let current = null
  try {
    const files = await listExcels()
    const folderKey = files.map((f) => f.key).join('\n')
    const state = readState()
    if (folderKey === state.folderKey) return
    // esperar a que terminen de copiarse: la carpeta igual en dos revisiones seguidas
    if (folderKey !== lastFolderKey) {
      lastFolderKey = folderKey
      return
    }
    const byKind = { sap: [], repuestos: [], gestion: [], otro: [] }
    for (const f of files) {
      current = f
      byKind[await kindOf(f)].push(f)
    }
    const sap = byKind.sap.at(-1)
    const gestion = byKind.gestion.at(-1)
    const partsKey = byKind.repuestos.map((f) => f.key).join('\n')
    const next = { ...state, folderKey, ignored: byKind.otro.map((f) => f.name) }
    delete next.error
    delete next.errorFile
    delete next.errorAt

    // catálogo de repuestos (del más antiguo al más nuevo: el nuevo pisa)
    const parts = {}
    for (const f of byKind.repuestos) {
      current = f
      Object.assign(parts, parsePartsCatalog((await readSheets(f)).sheets))
    }
    const partsInfo = { files: byKind.repuestos.map((f) => f.name), codes: Object.keys(parts).length }

    if (sap && (sap.key !== state.sourceKey || partsKey !== state.partsKey)) {
      current = sap
      log(`Procesando ${sap.name} (${(sap.size / 1e6).toFixed(1)} MB) con ${partsInfo.codes} códigos de repuestos clasificados…`)
      const t0 = Date.now()
      const data = await processSap(sap, parts, partsInfo)
      const openOT = data.workOrders.filter((o) => ['no iniciada', 'proceso'].includes(o.sapStatus.toLowerCase())).length
      Object.assign(next, {
        ok: true,
        sourceKey: sap.key,
        partsKey,
        fileName: sap.name,
        generatedAt: data.meta.generatedAt,
        vehicles: data.meta.vehicles,
        workOrders: data.meta.workOrders,
        openOT,
        from: data.meta.from,
        to: data.meta.to,
        parts: partsInfo,
      })
      log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${data.meta.vehicles} vehículos, ${data.meta.workOrders} OT (${openOT} abiertas).`)
    }
    if (gestion && gestion.key !== state.gestionKey) {
      current = gestion
      const info = await processGestion(gestion)
      Object.assign(next, { gestionKey: gestion.key, gestion: info })
      log(`Gestión de OT abiertas: ${gestion.name} · ${info.items} OT con gestión · ${info.photos} fotos.`)
    }
    if (next.ignored.length) log(`Archivos no reconocidos (se ignoran): ${next.ignored.join(', ')}`)
    await writeJsonAtomic(STATE, next)
  } catch (e) {
    if (e?.code === 'EBUSY' || e?.code === 'EPERM') {
      log(`${current?.name ?? 'Un archivo'} está ocupado (¿abierto en Excel?). Se reintenta.`)
      lastFolderKey = ''
      return
    }
    log(`ERROR con ${current?.name ?? 'la carpeta'}: ${e?.message || e}`)
    // se guarda el error para que la web lo muestre; los datos anteriores se mantienen
    const files = await listExcels().catch(() => [])
    await writeJsonAtomic(STATE, {
      ...readState(),
      folderKey: files.map((f) => f.key).join('\n'),
      error: e?.message || String(e),
      errorFile: current?.name ?? '',
      errorAt: localStamp(),
    })
  } finally {
    busy = false
  }
}

// --------------------------------------------------------------------- web
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}
const DATA_FILES = new Set(['west-real.json', 'estado.json', 'gestion.json'])

// Texto comprimido (gzip): los datos del SAP pasan de ~9 MB a ~1 MB, clave en el celular.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt'])
const gzCache = new Map()
function gzipped(file) {
  const st = fs.statSync(file)
  const hit = gzCache.get(file)
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit.buf
  const buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 })
  gzCache.set(file, { mtime: st.mtimeMs, size: st.size, buf })
  return buf
}

function send(req, res, file, cache) {
  const ext = path.extname(file).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  if (COMPRESSIBLE.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    const buf = gzipped(file)
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Encoding': 'gzip', 'Content-Length': buf.length, Vary: 'Accept-Encoding' })
    res.end(buf)
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache })
  // si el navegador corta la descarga o el archivo falla, solo se cierra esa respuesta
  const stream = fs.createReadStream(file)
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}

const handleIa = createIaHandler({ root: ROOT, dataDir: DATA, log })
const handleWebState = createWebStateHandler({ dataDir: DATA, log, stamp: localStamp })

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((e) => {
    log(`Error atendiendo ${req.url}: ${e?.message || e}`)
    if (!res.headersSent) res.writeHead(500).end()
    else res.destroy()
  })
})

async function handleRequest(req, res) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  if (await handleIa(req, res, pathname)) return
  if (await handleWebState(req, res, pathname)) return
  if (pathname.startsWith('/data/')) {
    const name = pathname.slice(6)
    const file = path.join(DATA, name)
    if (DATA_FILES.has(name) && fs.existsSync(file)) return send(req, res, file, 'no-cache')
    if (/^fotos\/[\w-]+\.(jpe?g|png|gif|webp)$/i.test(name) && fs.existsSync(file)) return send(req, res, file, 'public, max-age=3600')
    res.writeHead(404).end()
    return
  }
  const file = path.normalize(path.join(DIST, pathname))
  if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(req, res, file, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
  // archivo de la app que ya no existe (pestaña con una versión antigua): 404, no la página
  if (pathname.startsWith('/assets/')) {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end()
    return
  }
  // aplicación de una sola página: cualquier otra ruta abre index.html
  send(req, res, path.join(DIST, 'index.html'), 'no-cache')
}

// Un error inesperado no debe botar el programa: se registra y sigue funcionando.
process.on('uncaughtException', (e) => log(`Error inesperado: ${e?.stack || e}`))
process.on('unhandledRejection', (e) => log(`Error inesperado (promesa): ${e?.stack || e}`))

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  log('Falta compilar la web: ejecute "npm run build" en la carpeta del proyecto.')
  process.exit(1)
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log(`WEST IA ya está abierto en el puerto ${PORT}.`)
    process.exit(0)
  }
  log(`Error del servidor: ${e.message}`)
  process.exit(1)
})

// 127.0.0.1: la web y los datos solo son visibles desde este computador
server.listen(PORT, '127.0.0.1', () => {
  log(`WEST IA abierto en http://localhost:${PORT} · vigilando ${WATCH}`)
  tickWatcher()
  setInterval(tickWatcher, POLL_MS)
})
