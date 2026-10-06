// Visor de Sketchfab controlado por código (Viewer API oficial).
// Permite usar un modelo publicado en Sketchfab sin descargarlo: la cámara del
// visor sigue el mismo recorrido que la escena three.js de la presentación.

const API_URL = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js'

function loadScript() {
  if (window.Sketchfab) return Promise.resolve(window.Sketchfab)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${API_URL}"]`)
    const script = existing || document.createElement('script')
    script.addEventListener('load', () => resolve(window.Sketchfab))
    script.addEventListener('error', () => reject(new Error('No se pudo cargar el visor de Sketchfab')))
    if (!existing) {
      script.src = API_URL
      script.async = true
      document.head.appendChild(script)
    }
  })
}

/**
 * Inicia el visor en el iframe y devuelve un controlador de cámara.
 * La cámara se describe en coordenadas esféricas alrededor del centro del
 * modelo, partiendo del encuadre que dejó el autor (Sketchfab usa Z hacia arriba).
 */
export async function startSketchfab(iframe, uid, { timeout = 20000, distanceScale = 2.9, options = {} } = {}) {
  const Sketchfab = await loadScript()
  const api = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sketchfab no respondió a tiempo')), timeout)
    new Sketchfab('1.12.1', iframe).init(uid, {
      autostart: 1,
      preload: 1,
      camera: 0,
      transparent: 1,
      ui_animations: 0,
      ui_annotations: 0,
      ui_ar: 0,
      ui_controls: 0,
      ui_fullscreen: 0,
      ui_general_controls: 0,
      ui_help: 0,
      ui_hint: 0,
      ui_infos: 0,
      ui_inspector: 0,
      ui_loading: 0,
      ui_settings: 0,
      ui_stop: 0,
      ui_vr: 0,
      ui_watermark: 0,
      ui_watermark_link: 0,
      scrollwheel: 0,
      ...options,
      success(api) {
        api.start()
        api.addEventListener('viewerready', () => {
          clearTimeout(timer)
          resolve(api)
        })
      },
      error() {
        clearTimeout(timer)
        reject(new Error('Sketchfab rechazó el modelo'))
      },
    })
  })

  const initial = await new Promise((resolve, reject) =>
    api.getCameraLookAt((err, cam) => (err ? reject(err) : resolve(cam))),
  )
  const [px, py, pz] = initial.position
  const target = initial.target
  const vx = px - target[0]
  const vy = py - target[1]
  const vz = pz - target[2]
  // El encuadre inicial del autor suele ser cercano: se aleja para ver la camioneta completa.
  const distance = Math.hypot(vx, vy, vz) * distanceScale
  const azimuth = Math.atan2(vy, vx)

  let last = 0
  let lastKey = ''
  return {
    /**
     * az: giro relativo al encuadre inicial (rad) · el: elevación (°)
     * zoom: 1 = distancia inicial; >1 acerca
     */
    setView({ az, el, zoom }, now) {
      if (now - last < 45) return // ~20 actualizaciones por segundo bastan
      const a = azimuth + az
      const e = (Math.max(-80, Math.min(87, el)) * Math.PI) / 180
      const d = distance / Math.max(0.2, zoom)
      const eye = [
        target[0] + Math.cos(e) * Math.cos(a) * d,
        target[1] + Math.cos(e) * Math.sin(a) * d,
        target[2] + Math.sin(e) * d,
      ]
      const key = eye.map((v) => v.toFixed(3)).join(',')
      if (key === lastKey) return
      last = now
      lastKey = key
      api.setCameraLookAt(eye, target, 0.12)
    },
    dispose() {
      try {
        api.stop()
      } catch {
        /* nada */
      }
    },
  }
}
