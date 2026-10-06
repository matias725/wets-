// La app se puede actualizar mientras está abierta (npm run build reemplaza los
// archivos de /assets). Una pestaña antigua sigue pidiendo los archivos viejos y
// falla al cargar lo que se usa a pedido (Excel, imágenes). Aquí se detecta eso.

const RELOAD_KEY = 'westia.reloadedAt'

/** ¿El error es por un archivo de la app que ya no existe (versión antigua)? */
export function isStaleAppError(e) {
  const msg = String(e?.message ?? e ?? '')
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|preload/i.test(msg)
}

/** Recarga la página una vez (evita recargar en bucle si el problema es otro). */
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 15_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* sin sessionStorage: se recarga igual */
  }
  window.location.reload()
  return true
}

/** Si el error es de versión antigua, recarga y devuelve true. */
export function handleStaleApp(e) {
  return isStaleAppError(e) && reloadForNewVersion()
}

/** Archivo principal con que se cargó esta pestaña (cambia en cada versión). */
const currentBuild = () => document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? ''

/** ¿Hay una versión más nueva publicada en el servidor? */
export async function newVersionAvailable() {
  const mine = currentBuild()
  if (!mine) return false // modo desarrollo
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    const latest = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
    return Boolean(latest && latest !== mine)
  } catch {
    return false
  }
}
