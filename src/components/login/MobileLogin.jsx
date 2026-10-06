import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildHilux, HEART, RADIUS } from './hilux'
import { BONE, CSS, DISPLAY, GOLD, INK, LoginForm, SANS } from './HiluxShowcase'
import logoYellow from '@/assets/img/west_logo_yellow.png'

/*
 * Ingreso para celular. La presentación de escritorio (visor de Sketchfab y seis
 * escenas que se mueven con el desplazamiento) es demasiado pesada para un
 * teléfono: aquí la Hilux modelada gira suave, sin sombras en tiempo real, a
 * ~30 cuadros por segundo y solo mientras la pantalla está visible.
 */

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function useHilux(canvasRef, paint) {
  const [failed] = useState(() => !hasWebGL())
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || failed) return undefined
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      return undefined
    }
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.environment = env
    scene.environmentIntensity = 0.8
    const key = new THREE.DirectionalLight('#fff1d6', 1.7)
    key.position.set(-3, 8, 4)
    const rim = new THREE.DirectionalLight('#9fc4ff', 1.3)
    rim.position.set(4, 2.5, -6)
    const kick = new THREE.DirectionalLight(GOLD, 0.6)
    kick.position.set(0, -2, 6)
    scene.add(key, rim, kick, new THREE.HemisphereLight('#3a3428', '#050505', 0.35))

    const truck = buildHilux({ paint })
    const pivot = new THREE.Group()
    pivot.add(truck.root)
    scene.add(pivot)
    truck.update({ t: 0, roll: 0, lights: 1 })

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
    const fit = () => {
      const w = canvas.clientWidth || 1
      const h = canvas.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // distancia para que la camioneta entre completa a lo ancho y a lo alto
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2)
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
      const dist = (RADIUS * 0.8) / Math.sin(Math.min(vHalf, hHalf))
      const el = THREE.MathUtils.degToRad(11)
      camera.position.set(Math.cos(el) * dist, HEART.y + Math.sin(el) * dist, 0)
      camera.lookAt(HEART)
      camera.updateProjectionMatrix()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)

    let raf = 0
    let last = 0
    const start = performance.now()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (now - last < 33) return // ~30 cuadros por segundo bastan para un giro lento
      last = now
      const t = (now - start) / 1000
      pivot.rotation.y = -0.7 + t * 0.32
      truck.update({ t, roll: t * 2.2, lights: 1 })
      renderer.render(scene, camera)
    }
    const play = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(frame)
    }
    play()
    document.addEventListener('visibilitychange', play)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', play)
      ro.disconnect()
      truck.dispose()
      env.dispose()
      renderer.dispose()
    }
  }, [canvasRef, paint, failed])
  return failed
}

export default function MobileLogin({ stats, onLogin, paint = '#b9bcc1' }) {
  const canvasRef = useRef(null)
  const failed = useHilux(canvasRef, paint)
  return (
    <div
      style={{
        minHeight: '100svh',
        background: `radial-gradient(90% 55% at 50% 32%, ${GOLD}22, transparent 70%), ${INK}`,
        color: BONE,
        fontFamily: SANS,
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(20px, env(safe-area-inset-top)) 22px max(24px, env(safe-area-inset-bottom))',
      }}
    >
      <style>{CSS}</style>
      <img src={logoYellow} alt="West" style={{ height: 26, width: 'auto', alignSelf: 'flex-start' }} />

      <div style={{ position: 'relative', height: 'min(36svh, 320px)', margin: '8px -22px 0' }}>
        {!failed && <canvas ref={canvasRef} aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />}
      </div>

      <div style={{ textAlign: 'center', marginTop: -6 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.34em', color: GOLD, textTransform: 'uppercase', fontWeight: 600 }}>Gestión de flota</div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, textTransform: 'uppercase', fontSize: 'clamp(56px, 19vw, 96px)', lineHeight: 0.85, margin: '8px 0 0' }}>West IA</h1>
        {stats && (
          <p style={{ fontSize: 12, opacity: 0.6, margin: '12px 0 0' }}>
            {stats.vehicles.toLocaleString('es-CL')} vehículos · {stats.openOT} OT abiertas · {Math.round(stats.availability * 100)}% disponible
          </p>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 28, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
        <LoginForm onLogin={onLogin} compact />
      </div>
    </div>
  )
}
