// Puente entre la web y la IA del Analista. Corre dentro de servidor.mjs.
//
// Dos motores, se elige en la app:
// - local: Ollama en este computador (gratis, nada sale del equipo).
// - claude: Claude Opus 5.5 de Anthropic (pago por uso, mejor análisis). La
//   clave se guarda en .clave-ia.json (fuera de git, nunca va al navegador).
//
// El navegador ejecuta las consultas sobre los datos y manda a la IA solo los
// resultados que pide. Las respuestas se devuelven siempre con la forma de la
// API de Anthropic (bloques text / tool_use), sea cual sea el motor.
import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const CLAUDE_MODEL = 'claude-opus-5-5'
// US$ por millón de tokens (Claude Opus 5.5)
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
// el primero instalado; qwen2.5 queda de respaldo mientras se descarga qwen3
const LOCAL_MODELS = process.env.WEST_LOCAL_MODEL ? [process.env.WEST_LOCAL_MODEL] : ['qwen3:14b', 'qwen2.5:latest']
const LOCAL_CTX = 24_576
// visión local para leer patentes en fotos (el modelo de texto no ve imágenes)
const LOCAL_VISION = process.env.WEST_LOCAL_VISION ? [process.env.WEST_LOCAL_VISION] : ['qwen3-vl:8b', 'qwen2.5vl:7b']
const PLATE_PROMPT = `Esta es una foto de un vehículo de una empresa chilena de arriendo de camionetas.
Lee la patente (placa) chilena si se ve. Formatos: 4 letras + 2 números (ej. SYPT-52, sin vocales) o 2 letras + 4 números (ej. CL-1234). La de motos tiene 3 letras + 2 números.
Copia los caracteres tal como se ven, sin inventar. Si se ve solo en parte o no se ve, dilo con visible=false o confidence="baja".
Responde solo con el JSON pedido.`
const PLATE_SCHEMA = {
  type: 'object',
  properties: {
    visible: { type: 'boolean', description: 'true si se ve una patente legible' },
    plate: { type: 'string', description: 'La patente leída, solo letras y números, o vacío' },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
  },
  required: ['visible', 'plate', 'confidence'],
  additionalProperties: false,
}
const MAX_BODY = 25 * 1024 * 1024

export function createIaHandler({ root, dataDir, log }) {
  const KEY_FILE = path.join(root, '.clave-ia.json')
  const CONFIG_FILE = path.join(root, '.config-ia.json')
  const USAGE_FILE = path.join(dataDir, 'ia-uso.json')

  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return {}
    }
  }
  const readKey = () => readJson(KEY_FILE).apiKey || process.env.ANTHROPIC_API_KEY || ''
  const readProvider = () => readJson(CONFIG_FILE).provider || (readKey() ? 'claude' : 'local')

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

  async function localStatus() {
    try {
      const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })
      const { models = [] } = await res.json()
      const names = new Set(models.map((m) => m.name))
      const model = LOCAL_MODELS.find((n) => names.has(n) || names.has(`${n}:latest`))
      return { running: true, installed: Boolean(model), model: model ?? LOCAL_MODELS[0], best: model === LOCAL_MODELS[0] }
    } catch {
      return { running: false, installed: false, model: LOCAL_MODELS[0] }
    }
  }

  function addUsage(usage) {
    const month = new Date().toISOString().slice(0, 7)
    const all = readJson(USAGE_FILE)
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

  // ------------------------------------------------------------ motor Claude
  async function askClaude({ system, tools, messages, effort }) {
    const c = getClient()
    if (!c) throw Object.assign(new Error('Falta configurar la clave de Anthropic.'), { status: 409 })
    const stream = c.beta.messages.stream({
      model: CLAUDE_MODEL,
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
    return { content: msg.content, stop_reason: msg.stop_reason, stop_details: msg.stop_details ?? null, usd }
  }

  // ------------------------------------------------------------ motor local
  /** Conversación con forma Anthropic → mensajes de Ollama. */
  function toOllama(system, messages) {
    const out = [{ role: 'system', content: system }]
    const names = new Map()
    for (const m of messages) {
      if (typeof m.content === 'string') {
        out.push({ role: m.role, content: m.content })
        continue
      }
      if (m.role === 'assistant') {
        const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        const calls = m.content.filter((b) => b.type === 'tool_use')
        calls.forEach((b) => names.set(b.id, b.name))
        out.push({ role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls.map((b) => ({ function: { name: b.name, arguments: b.input } })) } : {}) })
        continue
      }
      for (const b of m.content) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_name: names.get(b.tool_use_id), content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) })
        else if (b.type === 'text') out.push({ role: 'user', content: b.text })
      }
    }
    return out
  }

  async function askLocal({ system, tools, messages }) {
    const { model } = await localStatus()
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: '30m',
        options: { num_ctx: LOCAL_CTX, temperature: 0.3 },
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
        messages: toOllama(system, messages),
      }),
    }).catch(() => {
      throw Object.assign(new Error('La IA local (Ollama) no está abierta en este computador.'), { status: 503 })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data.error || `Error ${res.status}`
      if (/not found/i.test(msg)) throw Object.assign(new Error(`Falta descargar el modelo local ${model}.`), { status: 503 })
      throw Object.assign(new Error(`IA local: ${msg}`), { status: 502 })
    }
    const msg = data.message ?? {}
    const stamp = Date.now().toString(36)
    const calls = (msg.tool_calls ?? []).map((tc, i) => {
      let input = tc.function?.arguments ?? {}
      if (typeof input === 'string') {
        try {
          input = JSON.parse(input)
        } catch {
          input = {}
        }
      }
      return { type: 'tool_use', id: `local_${stamp}_${i}`, name: tc.function?.name, input }
    })
    const text = String(msg.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    const content = [...(text ? [{ type: 'text', text }] : []), ...calls]
    return { content, stop_reason: calls.length ? 'tool_use' : data.done_reason === 'length' ? 'max_tokens' : 'end_turn', usd: 0 }
  }

  // ------------------------------------------------------ patente de una foto
  async function readPlate({ image, mediaType }) {
    if (!image || typeof image !== 'string') throw Object.assign(new Error('Falta la imagen'), { status: 400 })
    if (readProvider() === 'claude' && getClient()) {
      const msg = await getClient().beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: PLATE_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
              { type: 'text', text: PLATE_PROMPT },
            ],
          },
        ],
      })
      const usd = addUsage(msg.usage)
      if (msg.stop_reason === 'refusal') return { visible: false, plate: '', confidence: 'baja', engine: 'Claude', usd }
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      return { ...JSON.parse(text), engine: 'Claude', usd }
    }
    let names = new Set()
    try {
      const { models = [] } = await (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })).json()
      names = new Set(models.map((m) => m.name))
    } catch {
      throw Object.assign(new Error('La IA local (Ollama) no está abierta en este computador.'), { status: 503 })
    }
    const model = LOCAL_VISION.find((n) => names.has(n))
    if (!model) throw Object.assign(new Error(`Falta descargar el modelo de visión ${LOCAL_VISION[0]} para leer patentes.`), { status: 503 })
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: '10m',
        format: PLATE_SCHEMA,
        options: { temperature: 0 },
        messages: [{ role: 'user', content: PLATE_PROMPT, images: [image] }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(`IA local: ${data.error || `Error ${res.status}`}`), { status: 502 })
    // qwen3-vl a veces deja el JSON en "thinking" en vez de "content"
    let out = {}
    for (const raw of [data.message?.content, data.message?.thinking]) {
      const found = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').match(/\{[^{}]*"plate"[^{}]*\}/g)
      if (!found) continue
      try {
        out = JSON.parse(found.at(-1))
        break
      } catch {
        /* se prueba el otro campo */
      }
    }
    return { visible: Boolean(out.visible), plate: String(out.plate ?? ''), confidence: out.confidence ?? 'baja', engine: 'IA local', usd: 0 }
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
        const provider = readProvider()
        const local = await localStatus()
        const hasKey = Boolean(readKey())
        json(res, 200, {
          provider,
          configured: provider === 'claude' ? hasKey : local.installed,
          model: provider === 'claude' ? 'Claude Opus 5.5' : local.model,
          hasKey,
          local,
          usage: readJson(USAGE_FILE)[month] ?? { requests: 0, usd: 0 },
        })
        return true
      }
      if (route === 'proveedor' && req.method === 'POST') {
        const { provider } = await readBody(req)
        if (!['local', 'claude'].includes(provider)) {
          json(res, 400, { error: 'Motor desconocido' })
          return true
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readJson(CONFIG_FILE), provider }))
        log(`Analista IA: motor cambiado a ${provider === 'local' ? 'IA local' : 'Claude'}.`)
        json(res, 200, { provider })
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
          await new Anthropic({ apiKey: key }).models.retrieve(CLAUDE_MODEL)
        } catch (e) {
          const [status, error] = apiError(e)
          log(`Analista IA: clave rechazada (${error})`)
          json(res, status, { error })
          return true
        }
        fs.writeFileSync(KEY_FILE, JSON.stringify({ apiKey: key }))
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readJson(CONFIG_FILE), provider: 'claude' }))
        log('Analista IA: clave de Anthropic configurada.')
        json(res, 200, { configured: true })
        return true
      }
      if (route === 'patente' && req.method === 'POST') {
        json(res, 200, await readPlate(await readBody(req)))
        return true
      }
      if (route === 'mensaje' && req.method === 'POST') {
        const body = await readBody(req)
        if (!Array.isArray(body.messages) || !body.messages.length) {
          json(res, 400, { error: 'Sin mensajes' })
          return true
        }
        json(res, 200, readProvider() === 'claude' ? await askClaude(body) : await askLocal(body))
        return true
      }
      json(res, 404, { error: 'Ruta desconocida' })
    } catch (e) {
      const [status, error] = e?.status && !(e instanceof Anthropic.APIError) ? [e.status, e.message] : apiError(e)
      log(`Analista IA: ${error}`)
      if (!res.headersSent) json(res, status, { error })
    }
    return true
  }
}
