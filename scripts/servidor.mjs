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
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'preventiveCodes.json'), 'utf8'))
let busy = false
let lastSeen = { key: '', size: -1 }

async function newestExcel() {
  const names = await fsp.readdir(WATCH)
  let best = null
  for (const name of names) {
    // ~$ = archivo temporal de Excel abierto
    if (!/\.xls[xm]$/i.test(name) || name.startsWith('~$')) continue
    const full = path.join(WATCH, name)
    const st = await fsp.stat(full).catch(() => null)
    if (!st?.isFile()) continue
    // al pegar, Windows conserva la fecha de modificación: la de creación es la del pegado
    const time = Math.max(st.mtimeMs, st.birthtimeMs || 0)
    if (!best || time > best.time) best = { name, full, size: st.size, time, key: `${name}|${st.size}|${Math.round(time)}` }
  }
  return best
}

async function tickWatcher() {
  if (busy) return
  busy = true
  try {
    const file = await newestExcel()
    if (!file || file.key === readState().sourceKey) return
    // esperar a que termine de copiarse: mismo tamaño en dos revisiones seguidas
    if (lastSeen.key !== file.key || lastSeen.size !== file.size || file.size === 0) {
      lastSeen = { key: file.key, size: file.size }
      return
    }
    log(`Excel nuevo: ${file.name} (${(file.size / 1e6).toFixed(1)} MB). Procesando…`)
    const t0 = Date.now()
    try {
      const buffer = await fsp.readFile(file.full)
      const data = await convertSapFile(buffer, { fileName: file.name, catalog })
      data.meta.generatedAt = localStamp()
      data.meta.loadedFrom = 'carpeta'
      await writeJsonAtomic(path.join(DATA, 'west-real.json'), data)
      const openOT = data.workOrders.filter((o) => ['no iniciada', 'proceso'].includes(o.sapStatus.toLowerCase())).length
      await writeJsonAtomic(STATE, {
        ok: true,
        sourceKey: file.key,
        fileName: file.name,
        generatedAt: data.meta.generatedAt,
        vehicles: data.meta.vehicles,
        workOrders: data.meta.workOrders,
        openOT,
        from: data.meta.from,
        to: data.meta.to,
      })
      log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${data.meta.vehicles} vehículos, ${data.meta.workOrders} OT (${openOT} abiertas).`)
    } catch (e) {
      if (e?.code === 'EBUSY' || e?.code === 'EPERM') {
        log(`${file.name} está ocupado (¿abierto en Excel?). Se reintenta.`)
        return
      }
      log(`ERROR con ${file.name}: ${e?.message || e}`)
      // se guarda el error para que la web lo muestre; los datos anteriores se mantienen
      await writeJsonAtomic(STATE, { ...readState(), sourceKey: file.key, error: e?.message || String(e), errorFile: file.name, errorAt: localStamp() })
    }
  } catch (e) {
    log(`No se pudo revisar la carpeta: ${e?.message || e}`)
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
const DATA_FILES = new Set(['west-real.json', 'estado.json'])

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
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  if (pathname.startsWith('/data/')) {
    const name = pathname.slice(6)
    const file = path.join(DATA, name)
    if (DATA_FILES.has(name) && fs.existsSync(file)) return send(req, res, file, 'no-cache')
    res.writeHead(404).end()
    return
  }
  const file = path.normalize(path.join(DIST, pathname))
  if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(req, res, file, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
  // aplicación de una sola página: cualquier otra ruta abre index.html
  send(req, res, path.join(DIST, 'index.html'), 'no-cache')
})

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
