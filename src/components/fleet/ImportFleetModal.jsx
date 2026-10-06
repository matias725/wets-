import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, UploadCloud, XCircle } from 'lucide-react'
import { getRawFleet, importFleet } from '@/data/api'
import { CATEGORY_BY_ID, VEHICLE_STATUS } from '@/data/catalog'
import { FIELDS, compareFleet, downloadTemplate, parseRows, readWorkbook } from '@/lib/fleetExcel'
import { Modal } from '@/components/ui/Overlay'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cx, km } from '@/lib/format'

const MAX_SIZE = 25 * 1024 * 1024

function DropZone({ onFile, busy }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
      className={cx(
        'grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
        over ? 'border-brand bg-brand/10' : 'border-[var(--glass-border)] hover:border-brand/50 hover:bg-hover',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      {busy ? <Loader2 size={32} className="animate-spin text-brand-text" /> : <UploadCloud size={32} className="text-brand-text" />}
      <p className="mt-3 text-sm font-medium">{busy ? 'Leyendo el archivo…' : 'Arrastre aquí el Excel de la flota o haga clic para elegirlo'}</p>
      <p className="mt-1 text-xs text-muted">Formato .xlsx o .xlsm · reconoce el maestro de unidades exportado desde SAP</p>
    </div>
  )
}

function Summary({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, value, color]) => (
        <div key={label} className="rounded-xl bg-[var(--line)] px-3 py-2.5">
          <div className="text-[11px] text-muted">{label}</div>
          <div className="tabular mt-0.5 text-lg font-semibold" style={{ color: value ? color : undefined }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export function ImportFleetModal({ open, onClose }) {
  const [step, setStep] = useState('pick') // pick | preview | done
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)
  const [sheets, setSheets] = useState([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState({})
  const [mode, setMode] = useState('merge')
  const [result, setResult] = useState(null)

  const sheet = sheets[sheetIndex]
  const parsed = useMemo(() => (sheet ? parseRows(sheet.rows, mapping, sheet.headerRow) : null), [sheet, mapping])
  const diff = useMemo(() => (parsed ? compareFleet(parsed.vehicles, getRawFleet()) : null), [parsed])
  const errors = parsed?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = parsed?.issues.filter((i) => i.level === 'warning') ?? []

  const reset = () => {
    setStep('pick')
    setBusy(false)
    setError('')
    setFile(null)
    setSheets([])
    setSheetIndex(0)
    setMapping({})
    setMode('merge')
    setResult(null)
  }
  const close = () => {
    onClose()
    setTimeout(reset, 250)
  }

  const handleFile = async (f) => {
    setError('')
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) return setError('El archivo debe ser Excel .xlsx o .xlsm. Si es .xls antiguo, ábralo en Excel y guárdelo como .xlsx.')
    if (f.size > MAX_SIZE) return setError('El archivo supera 25 MB.')
    setBusy(true)
    try {
      const found = await readWorkbook(f)
      if (!found.length) {
        setError('No se encontró una hoja con columna de Patente (o PPU) y al menos otras dos columnas reconocibles (Marca, Modelo, Año, Kilometraje, Sucursal…). Descargue la plantilla para ver el formato.')
      } else {
        setFile(f)
        setSheets(found)
        setSheetIndex(0)
        setMapping(found[0].mapping)
        setStep('preview')
      }
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message || e}. Verifique que no esté protegido con contraseña.`)
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    const { persisted } = importFleet(parsed.vehicles, mode, {
      fileName: file.name,
      sheet: sheet.name,
      importedAt: new Date().toISOString(),
      rows: sheet.rows.length,
    })
    setResult({ persisted, total: parsed.vehicles.length, ...diff })
    setStep('done')
  }

  const footer =
    step === 'preview' ? (
      <>
        <Button variant="ghost" onClick={reset}>Elegir otro archivo</Button>
        <Button variant="primary" onClick={confirm} disabled={!parsed?.vehicles.length}>
          Importar {parsed?.vehicles.length ?? 0} vehículos
        </Button>
      </>
    ) : step === 'done' ? (
      <Button variant="primary" onClick={close}>Listo</Button>
    ) : (
      <>
        <Button variant="ghost" onClick={() => downloadTemplate()}>
          <FileSpreadsheet size={16} /> Descargar plantilla
        </Button>
        <Button variant="ghost" onClick={close}>Cancelar</Button>
      </>
    )

  return (
    <Modal open={open} onClose={close} title="Importar flota desde Excel" subtitle="Los vehículos se identifican por patente" footer={footer} size="lg">
      <AnimatePresence mode="wait">
        {step === 'pick' && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DropZone onFile={handleFile} busy={busy} />
            {error && (
              <p className="mt-4 flex gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-400" role="alert">
                <XCircle size={18} className="shrink-0" /> {error}
              </p>
            )}
            <div className="mt-4 flex gap-2 rounded-xl bg-[var(--line)] p-3 text-xs text-muted">
              <Info size={16} className="shrink-0 text-brand-text" />
              <span>
                Solo la columna <b className="text-fg">Patente</b> es obligatoria. También se reconocen los nombres del reporte SAP (PPU, Marca/Estilo, Kms, Faena, Chasis…). Antes de cargar verá una vista previa; nada se modifica hasta confirmar.
              </span>
            </div>
          </motion.div>
        )}

        {step === 'preview' && parsed && (
          <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet size={18} className="shrink-0 text-emerald-400" />
                <span className="truncate font-medium">{file.name}</span>
              </span>
              {sheets.length > 1 ? (
                <select
                  value={sheetIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setSheetIndex(i)
                    setMapping(sheets[i].mapping)
                  }}
                  className="rounded-lg border border-[var(--glass-border)] bg-input px-2 py-1 text-xs [&>option]:bg-[var(--glass-strong)]"
                  aria-label="Hoja del Excel"
                >
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>Hoja “{s.name}” · {s.rows.length} filas</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted">Hoja “{sheet.name}” · encabezados en la fila {sheet.headerRow + 1}</span>
              )}
            </div>

            <Summary
              items={[
                ['Vehículos válidos', parsed.vehicles.length, '#22c55e'],
                ['Nuevos', diff.added, '#3b82f6'],
                ['Se actualizan', diff.updated, '#f59e0b'],
                ['Sin cambios', diff.unchanged, '#94a3b8'],
              ]}
            />

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">Cómo cargar</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['merge', 'Actualizar y agregar', 'Actualiza las patentes existentes y agrega las nuevas. No borra nada.'],
                  ['replace', 'Reemplazar la flota completa', `La flota queda solo con este Excel. ${diff.removed} vehículos actuales dejarán de aparecer.`],
                ].map(([value, title, hint]) => (
                  <label key={value} className={cx('cursor-pointer rounded-xl border p-3 transition', mode === value ? 'border-brand bg-brand/10' : 'border-[var(--glass-border)] hover:bg-hover')}>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-[#ffc400]" />
                      {title}
                    </span>
                    <span className="mt-1 block pl-5 text-xs text-muted">{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <details className="group rounded-xl border border-[var(--glass-border)]" open={Object.keys(mapping).length < 4}>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
                Columnas detectadas: {Object.keys(mapping).length} de {FIELDS.length}
                <span className="ml-2 text-xs font-normal text-muted">(puede corregirlas)</span>
              </summary>
              <div className="grid gap-x-4 gap-y-2 border-t border-line p-4 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className={cx('shrink-0', mapping[f.key] !== undefined ? 'text-fg' : 'text-muted')}>
                      {f.label}
                      {f.required && <span className="text-red-400"> *</span>}
                    </span>
                    <select
                      value={mapping[f.key] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m }
                          if (e.target.value === '') delete next[f.key]
                          else next[f.key] = Number(e.target.value)
                          return next
                        })
                      }
                      className="w-44 truncate rounded-lg border border-[var(--glass-border)] bg-input px-2 py-1 [&>option]:bg-[var(--glass-strong)]"
                    >
                      <option value="">— No importar —</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>

            {(errors.length > 0 || warnings.length > 0) && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
                  <AlertTriangle size={16} /> {errors.length > 0 && `${errors.length} ${errors.length === 1 ? 'fila omitida' : 'filas omitidas'} · `}{warnings.length} {warnings.length === 1 ? 'aviso' : 'avisos'}
                </div>
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-muted">
                  {[...errors, ...warnings].slice(0, 100).map((i, k) => (
                    <li key={k}>
                      {i.row ? <b className="text-fg">Fila {i.row}:</b> : null} {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-medium text-muted">Vista previa (primeros 6 vehículos)</div>
              <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)]">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      {['Patente', 'Vehículo', 'Categoría', 'Sucursal', 'Estado', 'Km'].map((h) => (
                        <th key={h} className={cx('px-3 py-2 font-medium', h === 'Km' && 'text-right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.vehicles.slice(0, 6).map((v) => (
                      <tr key={v.plate} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{v.plate}</td>
                        <td className="px-3 py-2">{[v.brand, v.model, v.year].filter(Boolean).join(' ') || '—'}</td>
                        <td className="px-3 py-2 text-muted">{CATEGORY_BY_ID[v.category]?.label}</td>
                        <td className="px-3 py-2">{v.branchRaw || '—'}</td>
                        <td className="px-3 py-2"><Badge color={VEHICLE_STATUS[v.status].color}>{VEHICLE_STATUS[v.status].label}</Badge></td>
                        <td className="tabular px-3 py-2 text-right whitespace-nowrap">{km(v.mileage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'done' && result && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
            <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
            <h3 className="mt-4 text-lg font-semibold">Flota importada</h3>
            <p className="mt-1 text-sm text-muted">
              {result.total} vehículos procesados · {result.added} nuevos · {result.updated} actualizados · {result.unchanged} sin cambios
            </p>
            {!result.persisted && (
              <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-500/10 p-3 text-xs text-amber-500">
                El navegador no tuvo espacio para guardar esta flota: se verá mientras la página siga abierta. Al conectar con WEST IA real quedará guardada en la base de datos.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
