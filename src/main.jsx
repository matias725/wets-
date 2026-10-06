import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Si existen datos reales (public/data/west-real.json) se cargan antes de montar
// la aplicación; los módulos de datos los leen al importarse.
async function boot() {
  try {
    const res = await fetch('/data/west-real.json', { cache: 'no-cache' })
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) globalThis.__WEST_DATA__ = await res.json()
  } catch {
    /* sin datos reales: modo demostración */
  }
  const { default: App } = await import('./App.jsx')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
boot()
