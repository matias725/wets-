import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadSapData } from './lib/sapStore'
import './index.css'

async function fromFile() {
  try {
    const res = await fetch('/data/west-real.json', { cache: 'no-cache' })
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) return await res.json()
  } catch {
    /* sin archivo de datos */
  }
  return null
}

// Gestión de OT abiertas y fotos del Excel editable (la escribe el servidor).
async function gestionFile() {
  try {
    const res = await fetch('/data/gestion.json', { cache: 'no-cache' })
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) return await res.json()
  } catch {
    /* sin gestión */
  }
  return null
}

async function fromBrowser() {
  try {
    return (await loadSapData()) ?? null
  } catch {
    return null
  }
}

// Los datos reales se cargan antes de montar la aplicación (los módulos de datos
// los leen al importarse). Fuentes: el Excel del SAP cargado desde la página
// (guardado en este navegador) o public/data/west-real.json. Se usa el más reciente.
async function boot() {
  const [stored, file, gestion] = await Promise.all([fromBrowser(), fromFile(), gestionFile()])
  if (gestion) globalThis.__WEST_GESTION__ = gestion
  const newest = [stored, file].filter(Boolean).sort((a, b) => (b.meta?.generatedAt ?? '').localeCompare(a.meta?.generatedAt ?? ''))[0]
  if (newest) globalThis.__WEST_DATA__ = newest
  const { default: App } = await import('./App.jsx')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
boot()
