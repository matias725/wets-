// Fotos de la flota: cada foto queda asociada a una patente.
//
// - public/data/fotos-flota/<PATENTE>-<fecha>.jpg (fuera de git).
// - public/data/fotos-flota.json: índice { PATENTE: [{ file, at, source }] }.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const MAX_BODY = 15 * 1024 * 1024
const PLATE = /^[A-Z0-9]{2,4}-?[A-Z0-9]{2,4}$/

export function createFleetPhotoHandler({ dataDir, log, stamp }) {
  const DIR = path.join(dataDir, 'fotos-flota')
  const INDEX = path.join(dataDir, 'fotos-flota.json')
  let writing = Promise.resolve()

  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(INDEX, 'utf8'))
    } catch {
      return {}
    }
  }
  // un cambio a la vez, para que dos fotos simultáneas no se pisen el índice
  const update = (fn) => {
    const next = writing.then(async () => {
      const all = read()
      const out = await fn(all)
      const tmp = `${INDEX}.tmp`
      await fsp.writeFile(tmp, JSON.stringify(all))
      await fsp.rename(tmp, INDEX)
      return out
    })
    writing = next.catch(() => {})
    return next
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('La foto es demasiado grande'), { status: 413 }))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(Object.assign(new Error('JSON inválido'), { status: 400 }))
        }
      })
      req.on('error', reject)
    })
  }

  /** Devuelve true si atendió la ruta. */
  return async function handle(req, res, pathname) {
    if (pathname !== '/api/flota-fotos') return false
    const origin = req.headers.origin
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      json(res, 403, { error: 'Origen no permitido' })
      return true
    }
    try {
      if (req.method === 'GET') {
        json(res, 200, read())
        return true
      }
      if (req.method === 'POST') {
        const { plate, image, source } = await readBody(req)
        const p = String(plate ?? '').toUpperCase().trim()
        if (!PLATE.test(p)) return json(res, 400, { error: 'Patente inválida' }), true
        const buf = Buffer.from(String(image ?? ''), 'base64')
        // solo JPEG (la web convierte y achica la foto antes de enviarla)
        if (buf.length < 1000 || buf[0] !== 0xff || buf[1] !== 0xd8) return json(res, 400, { error: 'La imagen no es un JPEG válido' }), true
        const at = stamp()
        const file = `${p}-${at.replace(/[-:T]/g, '')}${Math.random().toString(36).slice(2, 5)}.jpg`
        await fsp.mkdir(DIR, { recursive: true })
        await fsp.writeFile(path.join(DIR, file), buf)
        const entry = { file, at, source: source === 'ia' ? 'ia' : 'manual' }
        await update((all) => {
          ;(all[p] ??= []).push(entry)
        })
        log(`Foto de flota guardada: ${p} (${source === 'ia' ? 'patente leída por IA' : 'manual'}).`)
        json(res, 200, { plate: p, ...entry })
        return true
      }
      if (req.method === 'DELETE') {
        const file = new URL(req.url, 'http://x').searchParams.get('file') ?? ''
        if (!/^[\w-]+\.jpg$/.test(file)) return json(res, 400, { error: 'Archivo inválido' }), true
        await update(async (all) => {
          for (const [p, list] of Object.entries(all)) {
            all[p] = list.filter((e) => e.file !== file)
            if (!all[p].length) delete all[p]
          }
          await fsp.rm(path.join(DIR, file), { force: true })
        })
        log(`Foto de flota eliminada: ${file}.`)
        json(res, 200, { ok: true })
        return true
      }
      json(res, 405, { error: 'Método no permitido' })
    } catch (e) {
      log(`Fotos de flota: ${e?.message || e}`)
      if (!res.headersSent) json(res, e?.status || 500, { error: e?.message || String(e) })
    }
    return true
  }
}
