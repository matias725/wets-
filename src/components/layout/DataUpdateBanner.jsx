import { useEffect, useState } from 'react'
import { AlertTriangle, Database, RefreshCw } from 'lucide-react'
import { META } from '@/data/api'
import { Button } from '@/components/ui/Button'
import { num } from '@/lib/format'

const POLL_MS = 20_000

// Avisa cuando el programa que vigila la carpeta del SAP procesó un Excel nuevo
// (o no pudo leerlo). Lee /data/estado.json, que escribe scripts/servidor.mjs.
export function DataUpdateBanner() {
  const [status, setStatus] = useState(null)
  const [dismissedError, setDismissedError] = useState('')

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const res = await fetch('/data/estado.json', { cache: 'no-cache' })
        if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return
        const s = await res.json()
        if (alive) setStatus(s)
      } catch {
        /* sin vigilante: nada que mostrar */
      }
    }
    check()
    const id = setInterval(check, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!status) return null
  const loaded = META.generatedAt ?? ''
  const isNewer = status.ok && status.generatedAt && status.generatedAt > loaded

  if (status.error && status.errorAt > loaded && status.errorAt !== dismissedError) {
    return (
      <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <AlertTriangle size={18} className="shrink-0 text-red-400" />
          <span>
            No se pudo leer <b>{status.errorFile}</b>: {status.error}. Se mantienen los datos anteriores.
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setDismissedError(status.errorAt)}>Entendido</Button>
      </div>
    )
  }
  if (!isNewer) return null
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/12 px-4 py-3 text-sm">
      <span className="flex items-center gap-2">
        <Database size={18} className="shrink-0 text-brand-text" />
        <span>
          Llegaron datos nuevos del SAP: <b>{status.fileName}</b> · {num(status.vehicles)} vehículos · {num(status.openOT)} OT abiertas
        </span>
      </span>
      <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
        <RefreshCw size={14} /> Actualizar ahora
      </Button>
    </div>
  )
}
