// Puente entre la web y Claude (Anthropic). Corre dentro de servidor.mjs.
//
// - La clave de API se guarda en .clave-ia.json (fuera de git y nunca se envía
//   al navegador).
// - El navegador ejecuta las consultas sobre los datos y solo manda a Claude
//   los resultados que la IA pide; este puente agrega la clave y reenvía.
// - El gasto aproximado de cada mes queda en public/data/ia-uso.json.
import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'
// US$ por millón de tokens (Claude Opus 5.5)
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }
const MAX_BODY = 25 * 1024 * 1024

export function createIaHandler({ root, dataDir, log }) {
  const KEY_FILE = path.join(root, '.clave-ia.json')
  const USAGE_FILE = path.join(dataDir, 'ia-uso.json')

  const readKey = () => {
    try {
      return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).apiKey || process.env.ANTHROPIC_API_KEY || ''
    } catch {
      return process.env.ANTHROPIC_API_KEY || ''
    }
  }
  let client = null
  let clientKey = ''
  const getClient = () => {
    const key = readKey()
    if (!key) return null
    if (key !== clientKey) {
      client = new Anthropic({ apiKey: key, timeout: 5 * 60 * 1000 })
      clientKey = key
    }
    return client
  }

  const readUsage = () => {
    try {
      return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'))
    } catch {
      return {}
    }
  }
  function addUsage(usage) {
    const month = new Date().toISOString().slice(0, 7)
    const all = readUsage()
    const m = (all[month] ??= { requests: 0, usd: 0 })
    const usd =
      ((usage.input_tokens ?? 0) * PRICE.input +
        (usage.output_tokens ?? 0) * PRICE.output +
        (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
        (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
      1e6
    m.requests += 1
    m.usd = Math.round((m.usd + usd) * 10000) / 10000
    try {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(all))
    } catch {
      /* sin registro de uso */
    }
    return usd
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
          reject(new Error('Consulta demasiado grande'))
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

  function apiError(e) {
    if (e instanceof Anthropic.AuthenticationError) return [401, 'La clave de Anthropic no es válida. Revísela en la configuración del Analista.']
    if (e instanceof Anthropic.PermissionDeniedError) return [403, 'La clave no tiene permiso para usar este modelo.']
    if (e instanceof Anthropic.RateLimitError) return [429, 'Se alcanzó el límite de uso de Anthropic. Espere un minuto y reintente.']
    if (e instanceof Anthropic.BadRequestError) {
      const msg = e.message || ''
      if (/credit balance/i.test(msg)) return [402, 'La cuenta de Anthropic no tiene saldo. Cargue créditos en console.anthropic.com.']
      return [400, `Anthropic rechazó la consulta: ${msg}`]
    }
    if (e instanceof Anthropic.APIConnectionError) return [502, 'No hay conexión con Anthropic. Revise internet.']
    if (e instanceof Anthropic.APIError) return [502, `Error de Anthropic (${e.status}): ${e.message}`]
    return [500, e?.message || String(e)]
  }

  /** Devuelve true si atendió la ruta. */
  return async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/ia/')) return false
    // solo desde la propia web: bloquea páginas de otros sitios que intenten usar el puente
    const origin = req.headers.origin
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      json(res, 403, { error: 'Origen no permitido' })
      return true
    }
    const route = pathname.slice('/api/ia/'.length)
    try {
      if (route === 'estado' && req.method === 'GET') {
        const month = new Date().toISOString().slice(0, 7)
        json(res, 200, { configured: Boolean(readKey()), model: MODEL, usage: readUsage()[month] ?? { requests: 0, usd: 0 } })
        return true
      }
      if (route === 'clave' && req.method === 'POST') {
        const { apiKey } = await readBody(req)
        const key = String(apiKey || '').trim()
        if (!key) {
          fs.rmSync(KEY_FILE, { force: true })
          json(res, 200, { configured: Boolean(readKey()) })
          return true
        }
        // se prueba antes de guardarla
        try {
          await new Anthropic({ apiKey: key }).models.retrieve(MODEL)
        } catch (e) {
          const [status, error] = apiError(e)
          log(`Analista IA: clave rechazada (${error})`)
          json(res, status, { error })
          return true
        }
        fs.writeFileSync(KEY_FILE, JSON.stringify({ apiKey: key }))
        log('Analista IA: clave de Anthropic configurada.')
        json(res, 200, { configured: true })
        return true
      }
      if (route === 'mensaje' && req.method === 'POST') {
        const c = getClient()
        if (!c) {
          json(res, 409, { error: 'Falta configurar la clave de Anthropic.' })
          return true
        }
        const { system, tools, messages, effort } = await readBody(req)
        if (!Array.isArray(messages) || !messages.length) {
          json(res, 400, { error: 'Sin mensajes' })
          return true
        }
        const stream = c.beta.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: ['low', 'medium', 'high', 'xhigh'].includes(effort) ? effort : 'high' },
          cache_control: { type: 'ephemeral' },
          system,
          tools,
          messages,
        })
        const msg = await stream.finalMessage()
        const usd = addUsage(msg.usage)
        json(res, 200, { content: msg.content, stop_reason: msg.stop_reason, stop_details: msg.stop_details ?? null, usd })
        return true
      }
      json(res, 404, { error: 'Ruta desconocida' })
    } catch (e) {
      const [status, error] = apiError(e)
      log(`Analista IA: ${error}`)
      if (!res.headersSent) json(res, status, { error })
    }
    return true
  }
}
