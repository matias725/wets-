// Gestión hecha en la web (estado real de OT, recuperabilidad, visitas, unidades
// detenidas sin OT): se guarda en este computador, no solo en el navegador.
//
// - public/data/gestion-web.json: estado actual (fuera de git).
// - public/data/respaldos/: una copia por día (se guardan los últimos 60).
// - Varios navegadores pueden guardar: en la gestión de OT gana el cambio más
//   reciente de cada OT; lo demás se combina.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const MAX_BODY = 20 * 1024 * 1024
const KEEP_BACKUPS = 60

export function createWebStateHandler({ dataDir, log, stamp }) {
  const FILE = path.join(dataDir, 'gestion-web.json')
  const BACKUPS = path.join(dataDir, 'respaldos')
  let writing = Promise.resolve()

  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'))
    } catch {
      return { management: {}, recovery: {}, visits: null, stalled: null, savedAt: '' }
    }
  }

  async function backup() {
    if (!fs.existsSync(FILE)) return
    await fsp.mkdir(BACKUPS, { recursive: true })
    const today = path.join(BACKUPS, `gestion-web-${stamp().slice(0, 10)}.json`)
    if (fs.existsSync(today)) return
    await fsp.copyFile(FILE, today)
    const old = (await fsp.readdir(BACKUPS)).filter((n) => n.startsWith('gestion-web-')).sort()
    for (const n of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) await fsp.rm(path.join(BACKUPS, n), { force: true })
  }

  /** Combina lo que llega con lo guardado. */
  function merge(saved, incoming) {
    const management = { ...saved.management }
    for (const [ot, m] of Object.entries(incoming.management ?? {})) {
      const prev = management[ot]
      if (!prev || String(m?.updatedAt ?? '') >= String(prev.updatedAt ?? '')) management[ot] = m
    }
    return {
      management,
      recovery: { ...saved.recovery, ...(incoming.recovery ?? {}) },
      visits: Array.isArray(incoming.visits) ? incoming.visits : saved.visits,
      stalled: Array.isArray(incoming.stalled) ? incoming.stalled : saved.stalled,
      savedAt: stamp(),
    }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(new Error('Datos demasiado grandes'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(new Error('JSON inválido'))
        }
      })
      req.on('error', reject)
    })
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  return async function handle(req, res, pathname) {
    if (pathname !== '/api/estado-web') return false
    const origin = req.headers.origin
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      json(res, 403, { error: 'Origen no permitido' })
      return true
    }
    if (req.method === 'GET') {
      json(res, 200, read())
      return true
    }
    if (req.method === 'POST') {
      const incoming = await readBody(req)
      // las escrituras van en fila para no pisarse
      const result = (writing = writing.then(async () => {
        await backup().catch((e) => log(`No se pudo respaldar la gestión: ${e?.message || e}`))
        const merged = merge(read(), incoming)
        const tmp = FILE + '.tmp'
        await fsp.writeFile(tmp, JSON.stringify(merged))
        await fsp.rename(tmp, FILE)
        return merged
      }))
      json(res, 200, await result)
      return true
    }
    json(res, 405, { error: 'Método no permitido' })
    return true
  }
}
