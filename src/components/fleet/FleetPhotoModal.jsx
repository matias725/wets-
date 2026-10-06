import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, CheckCircle2, ImagePlus, Loader2, ScanLine, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Overlay'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { ALL_BRANCHES, getVehicles } from '@/data/api'
import { matchPlate, readPlate, savePhoto, toJpeg } from '@/lib/fleetPhotos'
import { cx } from '@/lib/format'

const describe = (v) => `${v.brand} ${v.model} · ${v.branch}`

/**
 * Sube fotos de vehículos: la IA lee la patente en cada foto y, si coincide con
 * un vehículo de la flota, la guarda en su ficha. Si no la lee o no calza, se
 * elige o escribe la patente a mano.
 */
export function FleetPhotoModal({ open, onClose }) {
  const inputRef = useRef(null)
  const cameraRef = useRef(null)
  const [items, setItems] = useState([])
  const [over, setOver] = useState(false)
  const vehicles = useMemo(() => (open ? getVehicles(ALL_BRANCHES, { includeSold: true }) : []), [open])
  const byPlate = useMemo(() => new Map(vehicles.map((v) => [v.plate, v])), [vehicles])

  const patch = (id, p) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)))
  const busy = items.some((it) => it.status === 'reading' || it.status === 'saving')

  async function save(it, vehicle, source) {
    patch(it.id, { status: 'saving' })
    try {
      await savePhoto(vehicle.plate, it.base64, source)
      patch(it.id, { status: 'saved', vehicle })
    } catch (e) {
      patch(it.id, { status: 'review', error: e.message })
    }
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const added = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, file: f, status: 'reading', preview: '', typed: '' }))
    setItems((list) => [...added, ...list])
    // de a una: la IA local lee una foto a la vez
    for (const it of added) {
      let jpeg
      try {
        jpeg = await toJpeg(it.file)
      } catch {
        patch(it.id, { status: 'error', error: 'No se pudo abrir la imagen.' })
        continue
      }
      patch(it.id, { preview: jpeg.dataUrl, base64: jpeg.base64 })
      const current = { ...it, base64: jpeg.base64 }
      try {
        const read = await readPlate(jpeg.base64)
        const match = read.visible ? matchPlate(read.plate, vehicles) : { exact: null, similar: [] }
        patch(it.id, { read, similar: match.similar, typed: read.visible ? read.plate : '' })
        if (match.exact && read.confidence !== 'baja') await save(current, match.exact, 'ia')
        else patch(it.id, { status: 'review', suggestion: match.exact })
      } catch (e) {
        patch(it.id, { status: 'review', error: e.message })
      }
    }
  }

  function saveTyped(it) {
    const { exact } = matchPlate(it.typed, vehicles)
    if (!exact) return patch(it.id, { error: `La patente ${it.typed.toUpperCase()} no está en la flota.` })
    patch(it.id, { error: '' })
    save(it, exact, 'manual')
  }

  const close = () => {
    if (busy) return
    setItems([])
    onClose()
  }
  const saved = items.filter((it) => it.status === 'saved').length

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Fotos de la flota"
      subtitle="Sube fotos donde se vea la patente: cada una se guarda en la ficha de su vehículo."
      footer={
        <>
          {saved > 0 && <span className="mr-auto self-center text-xs text-muted">{saved} {saved === 1 ? 'foto guardada' : 'fotos guardadas'}</span>}
          <Button onClick={close} disabled={busy}>{busy ? 'Leyendo patentes…' : 'Listo'}</Button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cx('rounded-2xl border-2 border-dashed p-6 text-center transition', over ? 'border-brand bg-brand/10' : 'border-line')}
      >
        <ScanLine size={32} className="mx-auto text-brand-text" />
        <p className="mt-2 text-sm font-medium">Arrastra fotos aquí o elígelas</p>
        <p className="mt-1 text-xs text-muted">Puedes subir varias a la vez. La patente se lee sola; si no se ve, la escribes tú.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={16} /> Elegir fotos
          </Button>
          <Button className="md:hidden" onClick={() => cameraRef.current?.click()}>
            <Camera size={16} /> Tomar foto
          </Button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => (handleFiles(e.target.files), (e.target.value = ''))} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (handleFiles(e.target.files), (e.target.value = ''))} />
      </div>

      {items.length > 0 && (
        <ul className="mt-5 space-y-3">
          {items.map((it) => (
            <li key={it.id} className="flex gap-4 rounded-xl border border-line p-3">
              <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-hover">
                {it.preview && <img src={it.preview} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {it.status === 'reading' && (
                  <p className="flex items-center gap-2 text-muted">
                    <Loader2 size={16} className="animate-spin" /> Leyendo la patente…
                  </p>
                )}
                {it.status === 'saving' && (
                  <p className="flex items-center gap-2 text-muted">
                    <Loader2 size={16} className="animate-spin" /> Guardando…
                  </p>
                )}
                {it.status === 'saved' && (
                  <>
                    <p className="flex items-center gap-2 font-medium text-emerald-500">
                      <CheckCircle2 size={16} /> Guardada en{' '}
                      <Link to={`/flota/${it.vehicle.plate}`} className="underline" onClick={close}>
                        {it.vehicle.plate}
                      </Link>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{describe(it.vehicle)}</p>
                  </>
                )}
                {it.status === 'error' && <p className="text-red-500">{it.error}</p>}
                {it.status === 'review' && (
                  <>
                    <p className="flex items-start gap-2 text-amber-500">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                      <span>
                        {it.error
                          ? it.error
                          : !it.read?.visible
                            ? 'No se ve la patente en la foto.'
                            : it.suggestion
                              ? `Leí ${it.read.plate}, pero con poca seguridad.`
                              : `Leí ${it.read.plate}, pero no está en la flota.`}
                      </span>
                    </p>
                    {[it.suggestion, ...(it.similar ?? [])].filter(Boolean).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[it.suggestion, ...(it.similar ?? [])].filter(Boolean).map((v) => (
                          <Button key={v.plate} size="sm" onClick={() => save(it, byPlate.get(v.plate) ?? v, 'manual')} title={describe(v)}>
                            Es {v.plate}
                          </Button>
                        ))}
                      </div>
                    )}
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        saveTyped(it)
                      }}
                    >
                      <Input value={it.typed} onChange={(e) => patch(it.id, { typed: e.target.value.toUpperCase() })} placeholder="Patente, ej. SYPT-52" className="max-w-44 uppercase" aria-label="Patente" />
                      <Button type="submit" size="sm" disabled={!it.typed.trim()}>
                        Guardar
                      </Button>
                    </form>
                  </>
                )}
                {it.read?.engine && it.status !== 'reading' && <p className="mt-1 text-[11px] text-muted">Leída con {it.read.engine}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
