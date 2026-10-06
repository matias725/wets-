import { useEffect, useState } from 'react'
import { AlertTriangle, Database, RefreshCw } from 'lucide-react'
import { META } from '@/data/api'
import { Button } from '@/components/ui/Button'
import { num } from '@/lib/format'
import { newVersionAvailable } from '@/lib/appVersion'

const POLL_MS = 20_000

// Avisa cuando el programa que vigila la carpeta del SAP procesó un Excel nuevo
// (o no pudo leerlo). Lee /data/estado.json, que escribe scripts/servidor.mjs.
export function DataUpdateBanner() {
  const [status, setStatus] = useState(null)
  const [dismissedError, setDismissedError] = useState('')
  const [newVersion, setNewVersion] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const res = await fetch('/data/estado.json', { cache: 'no-cache' })
        if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return
        const s = await res.json()
        if (alive) setStatus(s)
        if (alive && (await newVersionAvailable())) setNewVersion(true)
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

  if (newVersion) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <RefreshCw size={18} className="shrink-0 text-sky-400" />
          <span>
            Hay una <b>versión nueva de WEST IA</b>. Actualice la página para usar las últimas mejoras (y que funcionen las exportaciones).
          </span>
        </span>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw size={14} /> Actualizar ahora
        </Button>
      </div>
    )
  }
  if (!status) return null
  const loaded = META.generatedAt ?? ''
  const isNewer = status.ok && status.generatedAt && status.generatedAt > loaded
  const newGestion = !isNewer && status.gestion?.processedAt && status.gestion.processedAt > (globalThis.__WEST_GESTION__?.processedAt ?? '')

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
  if (newGestion) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/12 px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <Database size={18} className="shrink-0 text-brand-text" />
          <span>
            Llegó gestión actualizada de OT abiertas: <b>{status.gestion.file}</b> · {num(status.gestion.items)} OT con gestión · {num(status.gestion.photos)} fotos
          </span>
        </span>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw size={14} /> Actualizar ahora
        </Button>
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
