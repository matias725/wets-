import { useRef, useState } from 'react'
import { CheckCircle2, Database, Loader2, UploadCloud, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Overlay'
import { Button } from '@/components/ui/Button'
import { cx, date, num } from '@/lib/format'

const MAX_SIZE = 200 * 1024 * 1024
const STATUS_LABEL = { available: 'Disponibles', workshop: 'En taller', out: 'Fuera de servicio', sold: 'Usados / venta' }
const FLEET_OVERRIDE_KEY = 'westia.fleet.sap.v1'

/**
 * Carga el Excel completo del SAP desde la página: se procesa en este navegador,
 * se guarda aquí mismo y la página se recarga con los datos nuevos.
 */
export function SapImportModal({ open, onClose }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ text: '', value: 0 })
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const reset = () => {
    setBusy(false)
    setError('')
    setResult(null)
    setProgress({ text: '', value: 0 })
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  async function handleFile(file) {
    reset()
    if (!/\.xlsx$|\.xlsm$/i.test(file.name)) return setError('El archivo debe ser un Excel .xlsx')
    if (file.size > MAX_SIZE) return setError('El archivo supera los 200 MB')
    setBusy(true)
    try {
      setProgress({ text: 'Abriendo el archivo…', value: 0.02 })
      const [{ convertSapFile }, { saveSapData }, catalog] = await Promise.all([
        import('@/lib/sapImport'),
        import('@/lib/sapStore'),
        import('@/data/preventiveCodes.json').then((m) => m.default),
      ])
      const buffer = await file.arrayBuffer()
      const data = await convertSapFile(buffer, {
        fileName: file.name,
        catalog,
        onProgress: (text, value) => setProgress({ text, value }),
      })
      setProgress({ text: 'Guardando en este navegador…', value: 0.95 })
      data.meta.loadedFrom = 'browser'
      await saveSapData(data)
      try {
        // La flota importada con la plantilla quedaría por encima de los datos nuevos.
        localStorage.removeItem(FLEET_OVERRIDE_KEY)
      } catch {
        /* nada */
      }
      const status = {}
      data.vehicles.forEach((v) => (status[v.status] = (status[v.status] ?? 0) + 1))
      const openOT = data.workOrders.filter((o) => ['no iniciada', 'proceso'].includes(o.sapStatus.toLowerCase())).length
      setResult({ meta: data.meta, status, openOT, branches: data.branches.length })
      setProgress({ text: 'Listo', value: 1 })
    } catch (e) {
      console.error(e)
      setError(e?.message || 'No se pudo leer el archivo')
    } finally {
      setBusy(false)
    }
  }

  const footer = result ? (
    <Button onClick={() => window.location.reload()}>
      <CheckCircle2 size={16} /> Ver los datos nuevos
    </Button>
  ) : (
    <Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button>
  )

  return (
    <Modal open={open} onClose={close} title="Cargar Excel del SAP" subtitle="Actualiza flota, OT y gastos de toda la página" footer={footer}>
      {!result && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => !busy && (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file && !busy) handleFile(file)
          }}
          className={cx(
            'grid place-items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            busy ? 'cursor-wait border-brand/40' : 'cursor-pointer',
            over ? 'border-brand bg-brand/10' : 'border-[var(--glass-border)] hover:border-brand/50 hover:bg-hover',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          {busy ? <Loader2 size={32} className="animate-spin text-brand-text" /> : <UploadCloud size={32} className="text-brand-text" />}
          <p className="mt-3 text-sm font-medium">{busy ? progress.text : 'Arrastre aquí el Excel completo del SAP o haga clic para elegirlo'}</p>
          {busy ? (
            <div className="mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-[var(--line)]">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.round(progress.value * 100)}%` }} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">El mismo archivo con la hoja de OT y el maestro de vehículos (ej. «SAP COMPLETO.xlsx»)</p>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          <XCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-400" />
            <div className="text-sm">
              <b>{result.meta.fileName}</b> cargado correctamente.
              <div className="text-xs text-muted">OT desde el {date(result.meta.from)} al {date(result.meta.to)}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Vehículos', result.meta.vehicles],
              ['OT en total', result.meta.workOrders],
              ['OT abiertas', result.openOT],
              ['Sucursales', result.branches],
              ...Object.entries(STATUS_LABEL).map(([k, label]) => [label, result.status[k] ?? 0]),
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[var(--line)] px-3 py-2.5">
                <div className="text-[11px] text-muted">{label}</div>
                <div className="tabular mt-0.5 text-lg font-semibold">{num(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <Database size={14} className="mt-0.5 shrink-0" />
        El archivo se procesa en este computador y no se envía a ningún servidor. Los datos quedan guardados en este navegador.
        Las gestiones de OT ya registradas se mantienen.
      </p>
    </Modal>
  )
}
