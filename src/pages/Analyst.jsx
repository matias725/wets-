import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Bot, Send, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getVehicles, isRealData } from '@/data/api'
import { SUGGESTIONS, answer } from '@/lib/analyst'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/misc'

function AnswerBubble({ a }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold">{a.title}</div>
      {a.lines?.map((l, i) => (
        <p key={i} className="text-muted">{l}</p>
      ))}
      {a.list && a.list.items.length > 0 && (
        <div className="rounded-xl bg-[var(--line)] p-3">
          <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{a.list.label}</div>
          <ul className="space-y-1">
            {a.list.items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" />
                {it}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.link && (
        <Link to={a.link.to} className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline">
          {a.link.label} <ArrowRight size={13} />
        </Link>
      )}
    </div>
  )
}

export default function Analyst() {
  const { branchId } = useApp()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef(null)
  const examplePlate = getVehicles()[0]?.plate

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, thinking])

  const ask = (text) => {
    const question = text.trim()
    if (!question || thinking) return
    setMessages((m) => [...m, { role: 'user', text: question }])
    setInput('')
    setThinking(true)
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'assistant', answer: answer(question, branchId) }])
      setThinking(false)
    }, 550)
  }

  const suggestions = [...SUGGESTIONS, examplePlate && `Analiza la patente ${examplePlate}`].filter(Boolean)

  return (
    <>
      <PageHeader
        title="Analista Técnico"
        description="Consultas sobre la flota en lenguaje natural"
        actions={
          <span className="glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted">
            <span className="size-2 rounded-full bg-emerald-400" /> Motor local · {isRealData ? 'datos SAP' : 'demostración'}
          </span>
        }
      />
      <Card className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!messages.length && (
            <div className="mx-auto max-w-xl pt-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/15 text-brand-text">
                <Sparkles size={26} />
              </span>
              <h2 className="mt-4 text-xl font-semibold">¿Qué quiere saber de la flota?</h2>
              <p className="mt-1 text-sm text-muted">Las respuestas usan solo datos de WEST IA. No modifican SAP.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="glass rounded-xl px-3 py-2 text-xs text-muted transition hover:bg-hover hover:text-fg">
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
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-brand-ink">{m.text}</div>
                ) : (
                  <>
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-text">
                      <Bot size={16} />
                    </span>
                    <div className="glass max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3">
                      <AnswerBubble a={m.answer} />
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {thinking && (
            <div className="flex gap-3">
              <span className="grid size-8 place-items-center rounded-xl bg-brand/15 text-brand-text">
                <Bot size={16} />
              </span>
              <div className="glass flex items-center gap-1 rounded-2xl px-4 py-3" aria-label="Analizando">
                {[0, 1, 2].map((d) => (
                  <motion.span key={d} className="size-1.5 rounded-full bg-[var(--muted)]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {messages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-line px-3 pt-3">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} disabled={thinking} className="glass shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap text-muted transition hover:text-fg disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(input)
          }}
          className={`flex gap-2 p-3 ${messages.length ? '' : 'border-t border-line'}`}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej.: ¿qué unidades llevan más de 20 días en taller?"
            aria-label="Pregunta"
            className="h-11 flex-1 rounded-xl border border-[var(--glass-border)] bg-input px-4 text-sm outline-none placeholder:text-subtle focus:border-brand/70 focus:ring-2 focus:ring-brand/20"
          />
          <Button type="submit" variant="primary" size="lg" disabled={!input.trim() || thinking} aria-label="Enviar">
            <Send size={16} />
          </Button>
        </form>
      </Card>
    </>
  )
}
