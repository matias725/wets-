import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Check, Cloud, Cpu, Loader2, RotateCcw, Send, Settings, Sparkles, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/context/AppContext'
import { isRealData } from '@/data/api'
import { SUGGESTIONS, askAnalyst, getAiStatus, saveApiKey, setProvider } from '@/lib/aiAgent'
import { cx } from '@/lib/format'
import { AiChart } from '@/components/charts/AiChart'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/misc'

const usd = (n) => `US$ ${(n || 0).toFixed(2).replace('.', ',')}`

// Markdown de las respuestas: tablas, listas y enlaces internos de la app.
const MD = {
  a: ({ href = '', children }) =>
    href.startsWith('/') ? (
      <Link to={href} className="font-medium text-brand-text hover:underline">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="text-brand-text hover:underline">
        {children}
      </a>
    ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--line)] text-[11px] tracking-wide text-muted uppercase">{children}</thead>,
  th: ({ children, style }) => <th className="px-3 py-2 text-left font-medium whitespace-nowrap" style={style}>{children}</th>,
  td: ({ children, style }) => <td className="tabular border-t border-line px-3 py-1.5" style={style}>{children}</td>,
  h1: ({ children }) => <h3 className="mt-4 mb-1.5 text-base font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-1.5 text-[15px] font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-brand">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-[var(--line)] px-1 py-0.5 text-[12px]">{children}</code>,
  hr: () => <hr className="my-3 border-line" />,
}

function Steps({ steps, live }) {
  if (!steps?.length) return null
  return (
    <details open={live} className="mb-2 text-xs text-muted">
      <summary className="cursor-pointer select-none">{live ? 'Trabajando…' : `${steps.length} consultas a los datos`}</summary>
      <ul className="mt-1.5 space-y-1 pl-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {live && i === steps.length - 1 ? <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin" /> : <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />}
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function KeySetup({ configured, onSaved }) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await saveApiKey(key)
      toast.success('Clave guardada. Claude ya está listo.')
      setKey('')
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Entre a{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-brand-text hover:underline">
            console.anthropic.com
          </a>{' '}
          con su cuenta (o cree una) y cargue saldo en <b>Billing</b>.
        </li>
        <li>
          En <b>API Keys</b> cree una clave nueva y cópiela (empieza con <code>sk-ant-</code>).
        </li>
        <li>Péguela aquí y presione Guardar. Queda guardada solo en este computador.</li>
      </ol>
      <form onSubmit={save} className="mt-4 flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={configured ? 'Clave guardada · pegue otra para cambiarla' : 'sk-ant-…'}
          aria-label="Clave de API"
          autoComplete="off"
          className="h-11 flex-1 rounded-xl border border-[var(--glass-border)] bg-input px-4 text-sm outline-none placeholder:text-subtle focus:border-brand/70 focus:ring-2 focus:ring-brand/20"
        />
        <Button type="submit" variant="primary" size="lg" disabled={!key.trim() || saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <p className="mt-4 text-xs text-subtle">
        Cada pregunta envía a Anthropic solo los resultados de las consultas que la IA necesita (no el Excel completo). Anthropic no usa estos datos para entrenar sus modelos.
      </p>
    </div>
  )
}

const ENGINES = [
  { id: 'local', icon: Cpu, title: 'IA local', hint: 'Gratis y privada: nada sale de este computador. Más lenta y menos precisa en análisis complejos.' },
  { id: 'claude', icon: Cloud, title: 'Claude (Anthropic)', hint: 'El mejor análisis. Pago por uso (centavos de dólar por pregunta) y requiere internet.' },
]

function EngineSettings({ status, onChange, onClose }) {
  const [saving, setSaving] = useState(false)
  const choose = async (provider) => {
    if (provider === status.provider) return
    setSaving(true)
    try {
      await setProvider(provider)
      await onChange()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="mx-auto max-w-2xl pt-4">
      <h2 className="text-center text-xl font-semibold">¿Con qué IA trabaja el Analista?</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ENGINES.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={saving}
            onClick={() => choose(o.id)}
            className={cx('glass rounded-2xl p-4 text-left transition hover:bg-hover', status.provider === o.id && 'ring-2 ring-brand')}
          >
            <div className="flex items-center gap-2 font-semibold">
              <o.icon size={18} className="text-brand-text" /> {o.title}
              {status.provider === o.id && <Check size={16} className="ml-auto text-brand-text" />}
            </div>
            <p className="mt-1.5 text-xs text-muted">{o.hint}</p>
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-line p-4">
        {status.provider === 'local' ? (
          !status.local.running ? (
            <p className="text-sm text-muted">
              Ollama no está abierto. Ábralo desde el menú Inicio (<b>Ollama</b>) y vuelva a esta pantalla.
            </p>
          ) : !status.local.installed ? (
            <p className="text-sm text-muted">
              Falta descargar el modelo <code>{status.local.model}</code> (~9 GB). En una terminal ejecute <code>ollama pull {status.local.model}</code>.
            </p>
          ) : (
            <p className="text-sm text-muted">
              <Check size={14} className="mr-1 inline text-emerald-400" />
              Lista: modelo <code>{status.local.model}</code> en su tarjeta de video. La primera pregunta tarda un poco más mientras se carga.
            </p>
          )
        ) : (
          <KeySetup configured={status.hasKey} onSaved={onChange} />
        )}
      </div>
      {status.configured && (
        <div className="mt-4 text-center">
          <Button variant="primary" onClick={onClose}>
            Ir al chat
          </Button>
        </div>
      )}
    </div>
  )
}

export default function Analyst() {
  const { branchId } = useApp()
  const [status, setStatus] = useState(null)
  const [setup, setSetup] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [liveSteps, setLiveSteps] = useState([])
  const history = useRef([])
  const abort = useRef(null)
  const endRef = useRef(null)

  const refresh = () => getAiStatus().then(setStatus)
  useEffect(() => {
    refresh()
  }, [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, liveSteps])

  const ask = async (text) => {
    const question = text.trim()
    if (!question || busy) return
    setMessages((m) => [...m, { role: 'user', text: question }])
    setInput('')
    setBusy(true)
    setLiveSteps([])
    const before = history.current.length
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const r = await askAnalyst({ question, history: history.current, branchId, provider: status?.provider, signal: ctrl.signal, onStep: (s) => setLiveSteps((x) => [...x, s]) })
      setMessages((m) => [...m, { role: 'assistant', ...r }])
    } catch (e) {
      // la conversación vuelve a como estaba antes de esta pregunta
      history.current.length = before
      setMessages((m) => [...m, { role: 'assistant', error: e.message }])
      if (/clave/i.test(e.message)) refresh()
    } finally {
      setBusy(false)
      setLiveSteps([])
      abort.current = null
      refresh()
    }
  }

  const reset = () => {
    history.current = []
    setMessages([])
  }

  const showSettings = status?.available && (!status.configured || setup)

  return (
    <>
      <PageHeader
        title="Analista Técnico"
        description="Pregunte lo que quiera sobre la flota, el taller y el gasto: la IA consulta los datos y responde con cifras reales"
        actions={
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button size="sm" onClick={reset} disabled={busy}>
                <RotateCcw size={14} /> Nueva conversación
              </Button>
            )}
            <span className="glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted">
              <span className={`size-2 rounded-full ${status?.configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {status?.provider === 'local' ? `IA local · ${status.local.model}` : 'Claude Opus 5.5'} · {isRealData ? 'datos SAP' : 'demostración'}
              {status?.provider === 'claude' && status.configured && <span className="text-subtle">· {usd(status.usage?.usd)} este mes</span>}
            </span>
            {status?.available && (
              <Button size="sm" variant="ghost" onClick={() => setSetup(true)} aria-label="Elegir IA">
                <Settings size={15} />
              </Button>
            )}
          </div>
        }
      />
      <Card className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden">
        {status && !status.available ? (
          <div className="mx-auto max-w-md pt-16 text-center text-sm text-muted">
            El Analista necesita el servidor de WEST IA de este computador. Ábralo desde el acceso <b>West IA</b> del escritorio.
          </div>
        ) : showSettings ? (
          <div className="flex-1 overflow-y-auto p-5">
            <EngineSettings status={status} onChange={refresh} onClose={() => setSetup(false)} />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {!messages.length && (
                <div className="mx-auto max-w-2xl pt-8 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/15 text-brand-text">
                    <Sparkles size={26} />
                  </span>
                  <h2 className="mt-4 text-xl font-semibold">¿Qué quiere saber de la flota?</h2>
                  <p className="mt-1 text-sm text-muted">Gasto, fallas, repuestos, sucursales, clientes, mantenciones, una patente… Pregunte como le preguntaría a un analista.</p>
                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => ask(s)} className="glass rounded-xl px-3 py-2.5 text-left text-xs text-muted transition hover:bg-hover hover:text-fg">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
                    {m.role === 'user' ? (
                      <div className="max-w-[75%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm whitespace-pre-wrap text-brand-ink">{m.text}</div>
                    ) : (
                      <>
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-text">
                          <Bot size={16} />
                        </span>
                        <div className="glass min-w-0 max-w-[92%] rounded-2xl rounded-tl-md px-4 py-3 text-sm">
                          {m.error ? (
                            <p className="text-red-400">{m.error}</p>
                          ) : (
                            <>
                              <Steps steps={m.steps} />
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                                {m.text}
                              </ReactMarkdown>
                              {m.charts?.length > 0 && (
                                <div className="mt-3 space-y-3">
                                  {m.charts.map((c, j) => (
                                    <AiChart key={j} chart={c} />
                                  ))}
                                </div>
                              )}
                              {m.usd > 0 && <div className="mt-2 text-right text-[10px] text-subtle">costo aprox. {usd(m.usd)}</div>}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {busy && (
                <div className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-text">
                    <Bot size={16} />
                  </span>
                  <div className="glass rounded-2xl rounded-tl-md px-4 py-3 text-sm">
                    {liveSteps.length ? (
                      <Steps steps={liveSteps} live />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Loader2 size={13} className="animate-spin" /> Pensando…
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                ask(input)
              }}
              className="flex gap-2 border-t border-line p-3"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(input)
                  }
                }}
                rows={1}
                placeholder="Ej.: ¿por qué subió el gasto en Calama este trimestre?"
                aria-label="Pregunta"
                className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-[var(--glass-border)] bg-input px-4 py-2.5 text-sm outline-none placeholder:text-subtle focus:border-brand/70 focus:ring-2 focus:ring-brand/20"
              />
              {busy ? (
                <Button size="lg" onClick={() => abort.current?.abort()} aria-label="Detener">
                  <Square size={14} />
                </Button>
              ) : (
                <Button type="submit" variant="primary" size="lg" disabled={!input.trim() || !status?.configured} aria-label="Enviar">
                  <Send size={16} />
                </Button>
              )}
            </form>
          </>
        )}
      </Card>
    </>
  )
}
