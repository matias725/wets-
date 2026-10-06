// Fotos de la flota guardadas en este computador (scripts/fotosFlota.mjs) y
// lectura de la patente en la foto con la IA (scripts/ia.mjs → /api/ia/patente).
import { useSyncExternalStore } from 'react'

let photos = {}
let loaded = false
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

export async function loadFleetPhotos() {
  try {
    const res = await fetch('/api/flota-fotos', { cache: 'no-store' })
    if (res.ok) photos = await res.json()
  } catch {
    /* sin servidor local: sin fotos */
  }
  loaded = true
  emit()
}

const subscribe = (l) => {
  listeners.add(l)
  if (!loaded) {
    loaded = true
    loadFleetPhotos()
  }
  return () => listeners.delete(l)
}

/** Todas las fotos: { PATENTE: [{ file, at, source }] } (de la más antigua a la más nueva). */
export const useFleetPhotos = () => useSyncExternalStore(subscribe, () => photos)

export const photoUrl = (file) => `/data/fotos-flota/${file}`

/** Achica la foto (lado mayor ≤ max px) y la convierte a JPEG. */
export async function toJpeg(file, max = 1600) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  const img =
    bitmap ??
    (await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No se pudo abrir la imagen'))
      el.src = URL.createObjectURL(file)
    }))
  const w = img.width
  const h = img.height
  const k = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * k)
  canvas.height = Math.round(h * k)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  bitmap?.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

async function call(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch {
    throw new Error('No hay conexión con WEST IA en este computador.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

/** { visible, plate, confidence, engine } */
export const readPlate = (base64) =>
  call('/api/ia/patente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }) })

export async function savePhoto(plate, base64, source = 'manual') {
  const entry = await call('/api/flota-fotos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate, image: base64, source }),
  })
  photos = { ...photos, [entry.plate]: [...(photos[entry.plate] ?? []), { file: entry.file, at: entry.at, source: entry.source }] }
  emit()
  return entry
}

export async function deletePhoto(file) {
  await call(`/api/flota-fotos?file=${encodeURIComponent(file)}`, { method: 'DELETE' })
  const next = {}
  for (const [p, list] of Object.entries(photos)) {
    const rest = list.filter((e) => e.file !== file)
    if (rest.length) next[p] = rest
  }
  photos = next
  emit()
}

// ------------------------------------------------------- cruce con la flota
const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
// letras y números que se confunden al leer una patente
const LOOKALIKE = { 0: 'OD', O: '0D', D: '0O', 1: 'I', I: '1', 8: 'B', B: '8', 5: 'S', S: '5', 2: 'Z', Z: '2', 6: 'G', G: '6' }

/**
 * Busca la patente leída en la flota. Devuelve el vehículo si coincide exacto
 * y las alternativas parecidas (un carácter confundible o un error de lectura).
 */
export function matchPlate(read, vehicles) {
  const r = clean(read)
  if (r.length < 5) return { exact: null, similar: [] }
  const byKey = new Map(vehicles.map((v) => [clean(v.plate), v]))
  const exact = byKey.get(r) ?? null
  if (exact) return { exact, similar: [] }
  const scored = []
  for (const [key, v] of byKey) {
    if (key.length !== r.length) continue
    let cost = 0
    for (let i = 0; i < key.length && cost < 2; i++) {
      if (key[i] === r[i]) continue
      cost += LOOKALIKE[r[i]]?.includes(key[i]) ? 0.5 : 1
    }
    if (cost <= 1) scored.push([cost, v])
  }
  scored.sort((a, b) => a[0] - b[0])
  return { exact: null, similar: scored.slice(0, 4).map(([, v]) => v) }
}
