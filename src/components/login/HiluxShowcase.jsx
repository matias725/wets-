import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import '@fontsource/big-shoulders-display/400'
import '@fontsource/big-shoulders-display/700'
import '@fontsource/big-shoulders-display/800'
import '@fontsource/big-shoulders-display/900'
import { ArrowRight, ChevronsDown, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { buildHilux, HEART, RADIUS } from './hilux'
import logoYellow from '@/assets/img/west_logo_yellow.png'
import fallbackPhoto from '@/assets/img/login-desierto.jpg'

/*
 * WEST IA · presentación de ingreso.
 * El desplazamiento es la línea de tiempo: seis cuadros (portada, desde arriba,
 * datos, flota, kilómetros, ingreso). Entre cuadros la cámara orbita la Hilux,
 * la camioneta cambia de tamaño y lugar, y los textos se transforman. Las letras
 * W y A de la portada se separan para flanquear la camioneta vista desde arriba.
 * Inspirado en "Lycoris Specimen"; la flor se reemplaza por una Toyota Hilux 2024.
 */

const INK = '#050505'
// Modelo 3D real opcional: si existe, reemplaza a la camioneta modelada por código.
const MODEL_URL = '/models/hilux.glb'
const MODEL_CONFIG_URL = '/models/hilux.json' // { "rotateY": 180 } si el modelo mira hacia atrás
const BONE = '#e9e3cf'
const GOLD = '#ffc400'
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif'
const SANS = '"Inter Variable", "Helvetica Neue", Arial, sans-serif'

// ------------------------------------------------------------------ tiempo
const clamp01 = (x) => (x <= 0 ? 0 : x > 1 ? 1 : x)
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const progressFrom = (top, height, viewport) => {
  const travel = height - viewport
  return travel <= 0 ? 0 : clamp01(-top / travel)
}
const sceneCoord = (p, n, hold) => {
  if (n <= 1) return 0
  const t = clamp01(p) * (n - 1)
  const i = Math.min(Math.floor(t), n - 2)
  const h = hold / 2
  return i + easeInOut(clamp01((t - i - h) / (1 - 2 * h)))
}
const reveal = (coord, scene, delay) => {
  const d = coord - scene
  const lag = d < 0 ? delay : 1 - delay
  return clamp01((0.6 - Math.abs(d) - lag * 0.2) / 0.25)
}

// ------------------------------------------------------------------ cámara
// spin: giro de la camioneta (rad) · el: elevación (°) · size: diámetro respecto
// del lado corto · ox/oy: dónde cae el centro en pantalla (-1..1)
const TAU = Math.PI * 2
const KEYS = [
  { spin: -0.62, el: 7, size: 0.62, ox: 0, oy: 0.27 },
  { spin: -Math.PI / 2, el: 86, size: 0.56, ox: 0, oy: 0 },
  { spin: -2.2, el: 18, size: 0.3, ox: 0, oy: 0.06 },
  { spin: -3.75, el: -3, size: 0.64, ox: 0, oy: -0.5 },
  { spin: -TAU - 0.05, el: 5, size: 0.66, ox: 0.5, oy: -0.14 },
  { spin: -TAU - 2.42, el: 6, size: 0.66, ox: -0.42, oy: 0.04 },
]
const KEYS_TALL = [
  { size: 0.92, oy: 0.26 },
  { size: 0.72 },
  { size: 0.46, oy: 0.1 },
  { size: 0.95, oy: -0.34 },
  { size: 0.95, ox: 0, oy: 0.36 },
  { size: 0.82, ox: 0, oy: 0.5 },
]
const SCENES = KEYS.length
const HOLD = 0.34
const NAV = ['Portada', 'Desde arriba', 'Datos', 'Flota', 'Kilómetros', 'Ingreso']

const keyAt = (coord, tall) => {
  const i = Math.max(0, Math.min(SCENES - 1, Math.floor(coord)))
  const j = Math.min(SCENES - 1, i + 1)
  const f = coord - i
  const a = { ...KEYS[i], ...(tall ? KEYS_TALL[i] : {}) }
  const b = { ...KEYS[j], ...(tall ? KEYS_TALL[j] : {}) }
  const l = (x, y) => x + (y - x) * f
  return { spin: l(a.spin, b.spin), el: l(a.el, b.el), size: l(a.size, b.size), ox: l(a.ox, b.ox), oy: l(a.oy, b.oy) }
}

// --------------------------------------------------------------------- CSS
const CSS =
  '.wsx-stage{container-type:size;container-name:wsx}' +
  '.wsx-char{display:inline-block;animation:wsx-in 1.4s cubic-bezier(.2,.8,.2,1) both}' +
  '@keyframes wsx-in{from{opacity:0;transform:translateY(0.3em) skewY(6deg);filter:blur(12px)}to{opacity:1;transform:none;filter:blur(0)}}' +
  '.wsx-g{display:inline-block;transition:color .25s,transform .25s cubic-bezier(.2,.8,.2,1);cursor:default}' +
  '.wsx-g:hover{color:' + GOLD + ';transform:translateY(-0.08em) scale(1.12)}' +
  '.wsx-nav button{display:flex;align-items:center;gap:10px;justify-content:flex-end;background:none;border:0;padding:5px 0;cursor:pointer;color:inherit;font:inherit}' +
  '.wsx-nav .wsx-tick{display:block;height:1px;width:14px;background:currentColor;opacity:.45;transition:width .4s cubic-bezier(.2,.8,.2,1),opacity .3s,background-color .3s}' +
  '.wsx-nav .wsx-lab{opacity:0;transform:translateX(6px);transition:opacity .3s,transform .3s}' +
  '.wsx-nav button:hover .wsx-lab,.wsx-nav button:focus-visible .wsx-lab{opacity:1;transform:none}' +
  '.wsx-nav button[aria-current=step] .wsx-tick{width:34px;opacity:1;background:' + GOLD + '}' +
  '.wsx-cue{animation:wsx-cue 2.2s ease-in-out infinite}' +
  '@keyframes wsx-cue{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(6px);opacity:1}}' +
  '.wsx-input{width:100%;height:48px;border-radius:14px;border:1px solid rgba(233,227,207,.16);background:rgba(255,255,255,.04);color:' + BONE + ';padding:0 14px 0 42px;font:inherit;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}' +
  '.wsx-input:focus{border-color:' + GOLD + ';box-shadow:0 0 0 4px rgba(255,196,0,.15);background:rgba(255,255,255,.06)}' +
  '.wsx-btn{position:relative;overflow:hidden;width:100%;height:52px;border:0;border-radius:14px;background:' + GOLD + ';color:#1a1712;font:inherit;font-weight:600;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:transform .15s,box-shadow .3s;box-shadow:0 10px 40px -10px rgba(255,196,0,.7)}' +
  '.wsx-btn:hover{box-shadow:0 14px 50px -8px rgba(255,196,0,.9)}.wsx-btn:active{transform:scale(.98)}.wsx-btn:disabled{opacity:.7;cursor:default}' +
  '.wsx-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);transform:translateX(-120%);transition:transform .8s}' +
  '.wsx-btn:hover::after{transform:translateX(120%)}' +
  '.wsx-top{transition:opacity .4s,transform .4s}' +
  '.wsx-wide{display:block}.wsx-tall{display:none}' +
  '@container wsx (orientation: portrait){.wsx-wide{display:none}.wsx-tall{display:block}' +
  '.wsx-bloom{left:7cqw!important;top:9cqh!important}' +
  '.wsx-form{left:5cqw!important;right:5cqw!important;top:auto!important;bottom:11cqh!important;transform:none!important;width:auto!important}' +
  '.wsx-spec{grid-template-columns:1fr 1fr!important}.wsx-spec-mid{display:none!important}}' +
  '@container wsx (max-width: 720px){.wsx-hide-sm{display:none!important}}' +
  '@container wsx (max-width: 1020px){.wsx-hide-md{display:none!important}}' +
  '@media (prefers-reduced-motion: reduce){.wsx-char,.wsx-cue{animation:none}.wsx-g{transition:none}}'

// Palabra de portada: la primera y la última letra flanquean la camioneta.
const NAME = 'WEST IA'
const LETTERS = Array.from(NAME)
const FIRST_IDX = 0
const LAST_IDX = LETTERS.length - 1

const sc = (scene, fx = 'rise', delay = 0) => ({ 'data-sc': scene, 'data-fx': fx, 'data-d': delay })
const hidden = { opacity: 0 }
const display = { fontFamily: DISPLAY, fontWeight: 800, textTransform: 'uppercase' }
const sans = { fontFamily: SANS }

/** W de West como marca, dibujada. */
function Mark({ color = BONE, accent = GOLD, size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ flex: 'none' }}>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke={color} strokeWidth="1.5" opacity=".5" />
      <path d="M8 12h5l3.5 12 4-12h3l4 12L31 12h5l-6.5 17h-4.5L21 18l-4 11h-4.5z" fill={color} />
      <circle cx="33" cy="31" r="2" fill={accent} />
    </svg>
  )
}

function Side({ label, side }) {
  return (
    <span
      className="wsx-hide-sm"
      style={{
        ...sans, position: 'absolute', top: '50%', [side === 'l' ? 'right' : 'left']: 'calc(100% + 16px)',
        fontSize: 8, letterSpacing: '0.25em', opacity: 0.55, lineHeight: 1, fontWeight: 500,
        transform: `translate(${side === 'l' ? '50%' : '-50%'},-50%) rotate(${side === 'l' ? -90 : 90}deg)`, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function Stat({ value, label, align = 'left' }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ ...display, fontSize: 'min(8.5cqw, 9cqh)', lineHeight: 0.86, fontWeight: 900 }}>
        <span className="wsx-g">{value}</span>
      </div>
      <div style={{ ...sans, fontSize: 9, letterSpacing: '0.28em', opacity: 0.6, marginTop: 6, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function LoginForm({ onLogin, emailRef }) {
  const [email, setEmail] = useState('mzepeda@west.cl')
  const [password, setPassword] = useState('demo1234')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = (e) => {
    e.preventDefault()
    if (!email.includes('@') || password.length < 4) return setError('Ingrese un correo válido y una contraseña de al menos 4 caracteres.')
    setError('')
    setLoading(true)
    setTimeout(onLogin, 650)
  }
  return (
    <form onSubmit={submit} noValidate style={{ ...sans, color: BONE }}>
      <div style={{ ...sans, fontSize: 10, letterSpacing: '0.3em', opacity: 0.6, textTransform: 'uppercase' }}>
        <span style={{ color: GOLD }}>06</span> — Ingreso
      </div>
      <h2 style={{ ...display, fontSize: 'clamp(40px, 4.6cqw, 64px)', lineHeight: 0.9, margin: '14px 0 6px', fontWeight: 900 }}>
        Bienvenido
      </h2>
      <p style={{ fontSize: 14, opacity: 0.65, margin: '0 0 26px' }}>Ingrese con su cuenta corporativa West.</p>
      <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', opacity: 0.6, marginBottom: 8, textTransform: 'uppercase' }} htmlFor="wsx-email">
        Correo
      </label>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Mail size={16} style={{ position: 'absolute', left: 15, top: 16, opacity: 0.55 }} />
        <input ref={emailRef} id="wsx-email" className="wsx-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', opacity: 0.6, marginBottom: 8, textTransform: 'uppercase' }} htmlFor="wsx-pass">
        Contraseña
      </label>
      <div style={{ position: 'relative' }}>
        <Lock size={16} style={{ position: 'absolute', left: 15, top: 16, opacity: 0.55 }} />
        <input id="wsx-pass" className="wsx-input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 46 }} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ position: 'absolute', right: 8, top: 8, width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'none', border: 0, color: BONE, opacity: 0.6, cursor: 'pointer' }}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p role="alert" style={{ color: '#ff8a80', fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
      <div style={{ marginTop: 24 }}>
        <button type="submit" className="wsx-btn" disabled={loading}>
          {loading ? 'Encendiendo motores…' : (<>Ingresar <ArrowRight size={17} /></>)}
        </button>
      </div>
      <p style={{ fontSize: 11, opacity: 0.4, textAlign: 'center', margin: '16px 0 0' }}>Versión de demostración con datos ficticios</p>
    </form>
  )
}

/**
 * @param {{ stats: { vehicles:number, branches:number, workshop:number, openOT:number, availability:number, spend:string },
 *           branchList: { id:string, name:string, total:number, available:number }[],
 *           onLogin: () => void, height?: string, sceneScroll?: number, paint?: string }} props
 */
export default function HiluxShowcase({ stats, branchList, onLogin, height = '100svh', sceneScroll = 1.1, paint = '#b9bcc1' }) {
  const rootRef = useRef(null)
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const glowRef = useRef(null)
  const wordRef = useRef(null)
  const emailRef = useRef(null)
  const [reduced, setReduced] = useState(false)
  const [active, setActive] = useState(0)
  const [inspect, setInspect] = useState(null)
  const [fallback, setFallback] = useState(false)

  const branchById = useMemo(() => Object.fromEntries(branchList.map((b) => [b.id, b])), [branchList])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const look = useRef({ reduced, paint })
  look.current = { reduced, paint }

  useEffect(() => {
    const root = rootRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    const glow = glowRef.current
    const word = wordRef.current
    if (!root || !stage || !canvas || !glow || !word) return undefined

    // ---- three.js ---------------------------------------------------------
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      setFallback(true)
      return undefined
    }
    // Neutral (Khronos PBR) conserva el amarillo West; ACES lo desatura hacia el crema.
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new RoomEnvironment()
    const env = pmrem.fromScene(envScene, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.8
    const key = new THREE.DirectionalLight('#fff1d6', 1.7)
    key.position.set(-3, 8, 4)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -4.5
    key.shadow.camera.right = 4.5
    key.shadow.camera.top = 4.5
    key.shadow.camera.bottom = -4.5
    key.shadow.camera.near = 1
    key.shadow.camera.far = 20
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    key.shadow.radius = 6
    const rim = new THREE.DirectionalLight('#9fc4ff', 1.3)
    rim.position.set(4, 2.5, -6)
    const kick = new THREE.DirectionalLight(GOLD, 0.6)
    kick.position.set(0, -2, 6)
    scene.add(key, rim, kick, new THREE.HemisphereLight('#3a3428', '#050505', 0.35))

    const truck = buildHilux({ paint: look.current.paint })
    const pivot = new THREE.Group()
    pivot.add(truck.root)
    const enableShadows = (obj) =>
      obj.traverse((o) => {
        if (o.isMesh && !o.material.transparent) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
    enableShadows(truck.root)

    // Si hay un modelo real en public/models/hilux.glb, se normaliza (largo 5,3 m,
    // ruedas en el suelo, frente hacia +X) y reemplaza al modelado por código.
    let external = null
    let disposed = false
    ;(async () => {
      try {
        const head = await fetch(MODEL_URL, { method: 'HEAD' })
        const type = head.headers.get('content-type') || ''
        if (!head.ok || type.includes('text/html')) return
        let config = {}
        try {
          const c = await fetch(MODEL_CONFIG_URL)
          if (c.ok && !(c.headers.get('content-type') || '').includes('text/html')) config = await c.json()
        } catch {
          /* sin configuración */
        }
        const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
        if (disposed) return
        const model = gltf.scene
        let box = new THREE.Box3().setFromObject(model)
        let size = box.getSize(new THREE.Vector3())
        if (size.z > size.x) model.rotation.y = Math.PI / 2
        model.rotation.y += ((config.rotateY || 0) * Math.PI) / 180
        model.updateMatrixWorld(true)
        box = new THREE.Box3().setFromObject(model)
        size = box.getSize(new THREE.Vector3())
        const scale = (config.length || 5.3) / Math.max(size.x, 0.001)
        model.scale.multiplyScalar(scale)
        model.updateMatrixWorld(true)
        box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
        const holder = new THREE.Group()
        holder.add(model)
        enableShadows(holder)
        pivot.remove(truck.root)
        pivot.add(holder)
        external = holder
      } catch {
        /* sin modelo externo: se usa el modelado por código */
      }
    })()
    // suelo invisible que solo recibe la sombra; gira con la camioneta y la luz queda fija
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.55 }))
    ground.receiveShadow = true
    ground.position.y = 0.001
    scene.add(ground)
    key.target = pivot
    scene.add(pivot)

    // polvo suspendido, como en un camino del desierto
    const dustCount = 320
    const dustPos = new Float32Array(dustCount * 3)
    for (let i = 0; i < dustCount; i += 1) {
      dustPos[i * 3] = (Math.random() - 0.5) * 12
      dustPos[i * 3 + 1] = Math.random() * 4.5
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12
    }
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
    const dustMat = new THREE.PointsMaterial({ color: '#ffd98a', size: 0.022, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
    const dust = new THREE.Points(dustGeo, dustMat)
    scene.add(dust)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

    // ---- medidas ------------------------------------------------------------
    let W = 1
    let H = 1
    const chars = Array.from(word.querySelectorAll('[data-ch]'))
    let nat = []
    const measure = () => {
      const sr = stage.getBoundingClientRect()
      W = Math.max(1, sr.width)
      H = Math.max(1, sr.height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(W, H, false)
      const saved = chars.map((c) => c.style.transform)
      chars.forEach((c) => (c.style.transform = 'none'))
      nat = chars.map((c) => {
        const r = c.getBoundingClientRect()
        return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top, w: r.width }
      })
      chars.forEach((c, i) => (c.style.transform = saved[i]))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    measure()
    const fonts = document.fonts
    const onFonts = () => measure()
    fonts?.addEventListener?.('loadingdone', onFonts)
    fonts?.ready.then(onFonts)

    const items = Array.from(stage.querySelectorAll('[data-sc]')).map((el) => ({
      el, scene: Number(el.dataset.sc), fx: el.dataset.fx, delay: Number(el.dataset.d) || 0, last: -1,
    }))

    // ---- entrada ----------------------------------------------------------------
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    let spin = 0
    let spinVel = 0
    let drag = null
    const onMove = (e) => {
      const r = stage.getBoundingClientRect()
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1
      if (drag && drag.id === e.pointerId) {
        spinVel += (e.clientX - drag.x) * 0.0024
        drag.x = e.clientX
      }
    }
    const onDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      if (e.target.closest('a,button,input,label,form,.wsx-g')) return
      drag = { id: e.pointerId, x: e.clientX }
      stage.style.cursor = 'grabbing'
    }
    const onUp = () => {
      drag = null
      stage.style.cursor = ''
    }
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)

    // ---- bucle ----------------------------------------------------------------
    let raf = 0
    let running = false
    let visible = true
    let last = performance.now()
    const born = last
    let time = 0
    let prog01 = -1
    let shownScene = -1

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = look.current
      const moving = !L.reduced
      if (moving) time += dt

      const r = root.getBoundingClientRect()
      const p = progressFrom(r.top, r.height, H)
      prog01 = prog01 < 0 || L.reduced ? p : prog01 + (p - prog01) * (1 - Math.exp(-dt * 8))
      const coord = sceneCoord(prog01, SCENES, HOLD)
      const sceneNow = Math.round(coord)
      if (sceneNow !== shownScene) {
        shownScene = sceneNow
        setActive(sceneNow)
        if (sceneNow === SCENES - 1) {
          try {
            localStorage.setItem('westia.introSeen', '1')
          } catch {
            /* nada */
          }
        }
      }

      const tall = H > W * 1.05
      const k = keyAt(coord, tall)
      pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4))
      pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4))
      // El arrastre gira la camioneta y, al soltar, vuelve sola a su encuadre.
      spin += spinVel
      spinVel *= Math.exp(-dt * 3)
      if (!drag) spin *= Math.exp(-dt * 1.2)
      const sway = moving ? Math.sin(time * 0.32) * 0.09 : 0
      const px = moving ? pointer.x : 0
      const py = moving ? pointer.y : 0

      // acercamiento inicial de cámara y encendido de focos
      const intro = L.reduced ? 1 : easeOut(clamp01((now - born) / 2200))
      const lights = L.reduced ? 1 : clamp01((now - born - 900) / 700)
      const size = k.size * (0.78 + 0.22 * intro)

      const fov = 30
      const minDim = Math.min(W, H)
      const dist = (RADIUS * H) / (size * minDim * Math.tan((fov * Math.PI) / 360))
      const el = Math.max(-80, Math.min(87, k.el + py * 8)) * (Math.PI / 180)
      camera.fov = fov
      camera.aspect = W / H
      camera.near = Math.max(0.1, dist - 14)
      camera.far = dist + 16
      camera.position.set(HEART.x, HEART.y + Math.sin(el) * dist, HEART.z + Math.cos(el) * dist)
      camera.up.set(0, 1, 0)
      camera.lookAt(HEART)
      camera.updateProjectionMatrix()
      // desplaza el centro de la camioneta en pantalla sin cambiar la perspectiva
      camera.projectionMatrix.elements[8] -= k.ox
      camera.projectionMatrix.elements[9] -= k.oy
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()

      pivot.rotation.y = k.spin + spin + sway + px * 0.22
      truck.update({ t: time, roll: coord * 4.2, alive: moving, lights })

      if (moving) {
        dust.rotation.y += dt * 0.02
        dust.position.y = Math.sin(time * 0.3) * 0.08
      }
      dustMat.opacity = 0.5 * intro

      // halo dorado detrás de la camioneta
      const gx = (0.5 + k.ox / 2) * W
      const gy = (0.5 - k.oy / 2) * H
      const gr = size * minDim * 1.15
      glow.style.transform = `translate(${(gx - gr).toFixed(1)}px,${(gy - gr).toFixed(1)}px)`
      glow.style.width = glow.style.height = `${(gr * 2).toFixed(1)}px`
      glow.style.opacity = String(0.35 + 0.65 * intro)

      renderer.render(scene, camera)

      // ---- textos --------------------------------------------------------------
      const still = L.reduced
      for (const it of items) {
        const v = reveal(coord, it.scene, it.delay)
        const q = Math.round(v * 500) / 500
        if (q === it.last) continue
        it.last = q
        const s = it.el.style
        const dir = coord < it.scene ? 1 : -1
        s.visibility = q <= 0 ? 'hidden' : ''
        if (it.fx === 'line') {
          s.transform = `scaleX(${q})`
          s.opacity = String(Math.min(1, q * 2))
          continue
        }
        s.opacity = String(q)
        if (still || it.fx === 'fade') continue
        if (it.fx === 'clip') {
          const hid = ((1 - q) * 100).toFixed(1)
          s.clipPath = dir > 0 ? `inset(0 0 ${hid}% 0)` : `inset(${hid}% 0 0 0)`
          s.transform = `translateY(${((1 - q) * 0.4 * dir).toFixed(3)}em)`
        } else {
          s.transform = `translateY(${((1 - q) * 34 * dir).toFixed(1)}px)`
          s.filter = q > 0.995 ? '' : `blur(${((1 - q) * 8).toFixed(1)}px)`
        }
      }

      // la palabra de portada: W y A flanquean la camioneta vista desde arriba
      const m = easeInOut(clamp01(coord))
      const out = clamp01(coord - 1)
      const k1 = keyAt(1, tall)
      const r1 = k1.size * minDim * 0.5
      const cy1 = (0.5 - k1.oy / 2) * H
      chars.forEach((c, i) => {
        const n0 = nat[i]
        if (!n0) return
        if (i === FIRST_IDX || i === LAST_IDX) {
          const side = i === FIRST_IDX ? -1 : 1
          const tx = W / 2 + side * (r1 * 0.62 + n0.w * 0.6 + minDim * 0.03)
          const dx = (tx - n0.x) * m
          const dy = (cy1 - n0.y) * m - out * 60
          c.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`
          c.style.opacity = String(coord < 1 ? 1 : 1 - smoothstep(0.1, 0.45, out))
          c.style.filter = still || out < 0.05 ? '' : `blur(${(out * 14).toFixed(1)}px)`
        } else {
          const dx = (W / 2 - n0.x) * m * 0.75
          const dy = (cy1 - n0.y) * m
          c.style.transform = still ? '' : `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${(1 - m * 0.7).toFixed(3)})`
          c.style.opacity = String(1 - smoothstep(0, 0.4, m))
          c.style.filter = still || m < 0.02 ? '' : `blur(${(m * 12).toFixed(1)}px)`
        }
        c.style.visibility = coord > 1.6 ? 'hidden' : ''
      })
    }

    const start = () => {
      if (running || !visible || document.hidden) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start()
      else stop()
    })
    io.observe(root)
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    start()

    return () => {
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      fonts?.removeEventListener?.('loadingdone', onFonts)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      disposed = true
      truck.dispose()
      external?.traverse((o) => {
        o.geometry?.dispose()
        ;[].concat(o.material || []).forEach((mt) => {
          Object.values(mt).forEach((v) => v?.isTexture && v.dispose())
          mt.dispose()
        })
      })
      ground.geometry.dispose()
      ground.material.dispose()
      dustGeo.dispose()
      dustMat.dispose()
      env.dispose()
      pmrem.dispose()
      envScene.traverse((o) => {
        o.geometry?.dispose()
        o.material?.dispose?.()
      })
      renderer.dispose()
    }
  }, [])

  // ---- navegación entre cuadros ---------------------------------------------
  const jump = (i, behavior) => {
    const root = rootRef.current
    const stage = stageRef.current
    if (!root || !stage) return
    const r = root.getBoundingClientRect()
    const travel = r.height - stage.clientHeight
    const delta = (i / (SCENES - 1)) * travel + r.top
    window.scrollBy({ top: delta, behavior: behavior ?? (reduced ? 'auto' : 'smooth') })
  }
  const goLogin = () => {
    jump(SCENES - 1)
    setTimeout(() => emailRef.current?.focus({ preventScroll: true }), reduced ? 50 : 1400)
  }

  // Quien ya vio la presentación entra directo al formulario.
  useEffect(() => {
    let seen = false
    try {
      seen = localStorage.getItem('westia.introSeen') === '1'
    } catch {
      /* nada */
    }
    if (seen) requestAnimationFrame(() => jump(SCENES - 1, 'auto'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inspected = inspect ? branchById[inspect] : null

  return (
    <section
      ref={rootRef}
      className="relative w-full"
      style={{ height: `calc(${height} * ${(1 + (SCENES - 1) * sceneScroll).toFixed(3)})`, background: INK }}
      aria-label="WEST IA · presentación e ingreso"
    >
      <style>{CSS}</style>
      <div
        ref={stageRef}
        className="wsx-stage sticky top-0 w-full overflow-hidden select-none"
        style={{ height, color: BONE, background: INK }}
        onPointerOver={(e) => {
          const g = e.target.dataset?.g
          if (g) setInspect(g)
        }}
        onPointerLeave={() => setInspect(null)}
      >
        {/* viñeta cálida en los bordes */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 90% at 50% 45%, transparent 55%, ${BONE}12 100%)` }} />
        <div ref={glowRef} aria-hidden className="pointer-events-none absolute top-0 left-0 rounded-full" style={{ background: `radial-gradient(closest-side, ${GOLD}38, ${GOLD}10 45%, transparent 100%)`, willChange: 'transform', opacity: 0 }} />
        {fallback ? (
          <img src={fallbackPhoto} alt="" className="absolute inset-0 size-full object-cover opacity-50" />
        ) : (
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block" style={{ width: '100%', height: '100%' }} />
        )}

        {/* barra superior: siempre se puede ir directo al ingreso */}
        <div className="wsx-top pointer-events-auto absolute flex items-center justify-between" style={{ left: '4cqw', right: '4cqw', top: '3.2cqh', zIndex: 5, opacity: active === SCENES - 1 ? 0 : 1, transform: active === SCENES - 1 ? 'translateY(-8px)' : 'none', pointerEvents: active === SCENES - 1 ? 'none' : 'auto' }}>
          <img src={logoYellow} alt="West" style={{ height: 26, width: 'auto' }} />
          <div className="flex items-center gap-2" style={sans}>
            <button type="button" onClick={() => jump(SCENES - 1)} className="wsx-hide-sm" style={{ background: 'none', border: 0, color: BONE, opacity: 0.6, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', padding: '10px 14px' }}>
              Saltar intro
            </button>
            <button type="button" onClick={goLogin} style={{ background: GOLD, color: '#1a1712', border: 0, borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Ingresar <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* ================================ 0 · portada ================================ */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute flex items-start justify-between gap-6" style={{ left: '4cqw', right: '4cqw', top: '13cqh' }}>
            <div {...sc(0, 'clip', 0)} style={{ ...display, ...hidden, fontSize: 'clamp(22px, 3.2cqw, 48px)', lineHeight: 0.86 }}>
              Plataforma
              <br />
              de flota
            </div>
            <p {...sc(0, 'rise', 0.2)} className="wsx-hide-md" style={{ ...sans, ...hidden, maxWidth: '25cqw', fontSize: 'clamp(11px, 0.95cqw, 13px)', lineHeight: 1.5, margin: 0, opacity: 0.75 }}>
              La flota de West Rent a Car, de Arica a Puerto Montt, en un solo lugar: órdenes de trabajo, gastos, visitas a sucursal y la salud de cada unidad, con datos de SAP y un analista técnico.
            </p>
            <ul {...sc(0, 'rise', 0.35)} className="wsx-hide-md" style={{ ...sans, ...hidden, listStyle: 'none', margin: 0, padding: 0, fontSize: 'clamp(11px, 0.95cqw, 13px)', lineHeight: 1.6, opacity: 0.75 }}>
              <li>{stats.vehicles} unidades en flota</li>
              <li>{stats.branches} sucursales</li>
              <li>{stats.openOT} órdenes de trabajo abiertas</li>
              <li>Datos SAP + gestión West</li>
              <li>Analista técnico integrado</li>
            </ul>
            <div {...sc(0, 'clip', 0.5)} className="wsx-hide-sm" style={{ ...display, ...hidden, fontSize: 'clamp(20px, 2.6cqw, 40px)', lineHeight: 0.86, textAlign: 'right' }}>
              Toyota
              <br />
              Hilux
              <br />
              <span style={{ color: GOLD }}>4×4</span>
            </div>
          </div>

          <div ref={wordRef} className="absolute whitespace-nowrap" style={{ ...display, fontWeight: 900, left: '50%', top: '75%', transform: 'translate(-50%, -50%)', fontSize: 'min(22cqw, 31cqh)', lineHeight: 1, letterSpacing: '-0.01em' }}>
            <span {...sc(0, 'rise', 0.6)} style={{ ...hidden, position: 'absolute', right: '0.04em', bottom: '100%', fontSize: '0.12em', letterSpacing: '0.3em', color: GOLD, fontWeight: 700 }}>
              Gestión de flota
            </span>
            <h1 style={{ margin: 0, font: 'inherit', textTransform: 'inherit' }} aria-label={NAME}>
              {LETTERS.map((c, i) => (
                <span key={i} data-ch className="inline-block" style={{ willChange: 'transform' }} aria-hidden>
                  <span className="wsx-char" style={{ animationDelay: `${0.25 + i * 0.07}s` }}>{c === ' ' ? ' ' : c}</span>
                </span>
              ))}
            </h1>
          </div>

          <div className="absolute flex items-end justify-between gap-6" style={{ left: '4cqw', right: '4cqw', bottom: '4.5cqh' }}>
            <div {...sc(0, 'rise', 0.3)} className="flex items-center gap-3" style={hidden}>
              <Mark />
              <span style={{ ...sans, fontSize: 'clamp(20px, 2.2cqw, 32px)', fontWeight: 300, letterSpacing: '-0.02em' }}>2026</span>
              <span style={{ ...sans, fontSize: 9, lineHeight: 1.3, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: `1px solid ${BONE}80`, paddingBottom: 6, paddingRight: '5cqw' }}>
                Desarrollado por
                <br />
                West Rent a Car
              </span>
            </div>
            <div {...sc(0, 'fade', 0.6)} className="wsx-cue flex flex-col items-center gap-1" style={{ ...sans, ...hidden, fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
              Desliza
              <ChevronsDown size={16} color={GOLD} />
            </div>
            <div {...sc(0, 'rise', 0.5)} className="wsx-hide-sm flex gap-5" style={{ ...sans, ...hidden, color: GOLD, fontSize: 8.5, lineHeight: 1.3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <span>West IA<br />Gestión de flota</span>
              <span>Toyota Hilux 2024<br />Doble cabina 4×4</span>
              <span>Arica →<br />Puerto Montt</span>
            </div>
          </div>
        </div>

        {/* ================================ 1 · desde arriba ================================ */}
        <div className="pointer-events-none absolute inset-0">
          <div {...sc(1, 'rise', 0.7)} className="absolute" style={{ ...sans, ...hidden, left: '4cqw', bottom: '5cqh', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            <span style={{ color: GOLD }}>02</span> — La flota, desde arriba
          </div>
          <div {...sc(1, 'rise', 0.8)} className="wsx-hide-sm absolute text-right" style={{ ...sans, ...hidden, right: '6cqw', bottom: '5cqh', fontSize: 11, lineHeight: 1.6, opacity: 0.6, maxWidth: '24cqw' }}>
            Arrastre para girar la camioneta. Cada unidad de la flota, con su historial completo.
          </div>
        </div>

        {/* ================================ 2 · datos ================================ */}
        <div className="pointer-events-none absolute inset-0">
          <div className="wsx-spec pointer-events-auto absolute grid items-center" style={{ left: '7cqw', right: '7cqw', top: '15cqh', bottom: '22cqh', gridTemplateColumns: '1fr min(30cqw, 36cqh) 1fr', columnGap: '2cqw' }}>
            <div className="relative flex flex-col gap-[4cqh]">
              <div {...sc(2, 'clip', 0)} style={hidden} className="relative"><Side label="FLOTA" side="l" /><Stat value={stats.vehicles} label="Unidades" /></div>
              <div {...sc(2, 'clip', 0.15)} style={hidden} className="relative"><Side label="RED" side="l" /><Stat value={stats.branches} label="Sucursales" /></div>
              <div {...sc(2, 'clip', 0.3)} style={hidden} className="relative"><Side label="TALLER" side="l" /><Stat value={stats.workshop} label="Unidades en taller" /></div>
            </div>
            <div className="wsx-spec-mid relative h-full text-center">
              <div {...sc(2, 'rise', 0.45)} className="absolute w-full" style={{ ...hidden, top: '70%' }}>
                <div style={{ ...display, fontSize: inspected ? 'min(4cqw, 5cqh)' : 'min(2.2cqw, 3cqh)', color: inspected ? GOLD : BONE, transition: 'font-size .35s cubic-bezier(.2,.8,.2,1), color .3s', lineHeight: 1 }}>
                  {inspected ? inspected.name : 'Sucursales'}
                </div>
                <div style={{ ...sans, fontSize: 9, letterSpacing: '0.25em', opacity: 0.6, marginTop: 8, textTransform: 'uppercase' }}>
                  {inspected ? `${inspected.total} unidades · ${inspected.available} disponibles` : 'Pase el cursor por una sucursal'}
                </div>
              </div>
            </div>
            <div className="relative flex flex-col items-end gap-[4cqh] text-right">
              <div {...sc(2, 'clip', 0.1)} style={hidden} className="relative"><Side label="OPERACIÓN" side="r" /><Stat value={`${Math.round(stats.availability * 100)}%`} label="Disponibilidad" align="right" /></div>
              <div {...sc(2, 'clip', 0.25)} style={hidden} className="relative"><Side label="GESTIÓN" side="r" /><Stat value={stats.openOT} label="OT abiertas" align="right" /></div>
              <div {...sc(2, 'clip', 0.4)} style={hidden} className="relative"><Side label="COSTOS" side="r" /><Stat value={stats.spend} label="Gasto 30 días" align="right" /></div>
            </div>
          </div>
          <div {...sc(2, 'line', 0.5)} className="absolute" style={{ ...hidden, left: '7cqw', right: '7cqw', bottom: '16cqh', height: 1, background: `${BONE}40`, transformOrigin: 'left' }} />
          <div {...sc(2, 'rise', 0.6)} className="pointer-events-auto absolute text-center" style={{ ...display, ...hidden, fontWeight: 700, left: '6cqw', right: '6cqw', bottom: '6.5cqh', fontSize: 'min(1.9cqw, 2.6cqh)', lineHeight: 1.5, letterSpacing: '0.06em' }}>
            {branchList.map((b, i) => (
              <span key={b.id}>
                {i > 0 && <span style={{ color: GOLD, opacity: 0.7 }}> · </span>}
                <span className="wsx-g" data-g={b.id}>{b.name}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ================================ 3 · flota ================================ */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute text-center" style={{ ...display, fontWeight: 900, left: '50%', top: '7cqh', transform: 'translateX(-50%)', fontSize: 'min(15cqw, 11.5cqh)', lineHeight: 0.84, whiteSpace: 'nowrap' }}>
            <span {...sc(3, 'fade', 0.3)} style={{ ...sans, ...hidden, position: 'absolute', right: '100%', top: '0.4em', fontSize: '0.09em', marginRight: '1.4em', letterSpacing: '0.3em', fontWeight: 500 }}>West IA</span>
            <span {...sc(3, 'fade', 0.4)} style={{ ...sans, ...hidden, position: 'absolute', left: '100%', top: '0.4em', fontSize: '0.09em', marginLeft: '1.4em', letterSpacing: '0.3em', fontWeight: 500 }}>Plataforma</span>
            <div {...sc(3, 'clip', 0)} style={hidden}>Flota</div>
            <div {...sc(3, 'clip', 0.15)} style={{ ...hidden, color: GOLD }}>Taller</div>
            <div {...sc(3, 'clip', 0.3)} style={hidden}>Gastos</div>
          </div>
          <div className="absolute flex justify-center" style={{ left: 0, right: 0, bottom: '4.5cqh' }}>
            <div {...sc(3, 'rise', 0.6)} style={{ ...sans, ...hidden, fontSize: 9, letterSpacing: '0.9em', textTransform: 'uppercase', whiteSpace: 'nowrap', paddingLeft: '0.9em' }}>
              West Rent a Car
            </div>
          </div>
        </div>

        {/* ================================ 4 · kilómetros ================================ */}
        <div className="pointer-events-none absolute inset-0">
          <div className="wsx-bloom absolute" style={{ ...display, fontWeight: 900, left: '6cqw', top: '22cqh', fontSize: 'min(7.6cqw, 12cqh)', lineHeight: 0.82 }}>
            {[
              { text: 'Cada' },
              { text: 'unidad,', small: true },
              { text: 'cada', gold: true },
              { text: 'kilómetro', small: true },
            ].map((t, i) => (
              <div key={i} {...sc(4, 'clip', i * 0.14)} style={{ ...hidden, fontSize: t.small ? '0.42em' : undefined, lineHeight: t.small ? 1.1 : undefined, marginLeft: t.small ? '3.1em' : i > 1 ? '0.4em' : 0, marginTop: t.small ? '-0.05em' : 0, marginBottom: t.small ? '0.2em' : 0, color: t.gold ? GOLD : undefined }}>
                {t.text}
              </div>
            ))}
            <div {...sc(4, 'clip', 0.6)} style={{ ...hidden }}>bajo control</div>
            <div {...sc(4, 'rise', 0.75)} style={{ ...sans, ...hidden, fontSize: 10, letterSpacing: '0.28em', marginTop: '3.5cqh', opacity: 0.6, textTransform: 'uppercase', fontWeight: 500 }}>
              Arica → Puerto Montt · 24/7
            </div>
          </div>
        </div>

        {/* ================================ 5 · ingreso ================================ */}
        <div className="pointer-events-none absolute inset-0">
          <div className="wsx-form pointer-events-auto absolute" style={{ right: '7cqw', top: '50%', transform: 'translateY(-50%)', width: 'min(400px, 34cqw)' }}>
            <div
              {...sc(5, 'rise', 0.2)}
              style={{ ...hidden, padding: 'clamp(24px, 3cqw, 40px)', borderRadius: 28, background: 'rgba(12,12,12,0.55)', border: `1px solid ${BONE}1f`, backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)', boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' }}
            >
              <LoginForm onLogin={onLogin} emailRef={emailRef} />
            </div>
          </div>
          <div {...sc(5, 'rise', 0.5)} className="wsx-wide absolute" style={{ ...display, ...hidden, left: '5cqw', top: '7cqh', fontSize: 'clamp(16px, 1.8cqw, 26px)', lineHeight: 0.9, fontWeight: 900 }}>
            <img src={logoYellow} alt="West" style={{ height: 30, width: 'auto', display: 'block', marginBottom: 10 }} />
            West IA
          </div>
          <div {...sc(5, 'rise', 0.7)} className="pointer-events-auto absolute flex items-center justify-between gap-4" style={{ ...sans, ...hidden, left: '5cqw', right: '5cqw', bottom: '4cqh', fontSize: 'clamp(10px, 1.1cqw, 13px)', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>
            <button type="button" onClick={() => jump(0)} style={{ background: 'none', border: 0, color: BONE, font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer', padding: 0 }}>
              ↑ Ver la presentación
            </button>
            <Mark size={26} />
            <span>West Rent a Car · 2026</span>
          </div>
        </div>

        {/* ================================ navegación ================================ */}
        <nav aria-label="Cuadros de la presentación" className="wsx-nav wsx-hide-sm absolute flex flex-col items-end" style={{ ...sans, right: '1.8cqw', top: '50%', transform: 'translateY(-50%)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', zIndex: 4 }}>
          {NAV.map((n, i) => (
            <button key={n} type="button" onClick={() => jump(i)} aria-current={active === i ? 'step' : undefined}>
              <span className="wsx-lab">{String(i + 1).padStart(2, '0')} {n}</span>
              <span className="wsx-tick" />
            </button>
          ))}
        </nav>

        {/* grano de película */}
        <svg aria-hidden className="pointer-events-none absolute inset-0" width="100%" height="100%" style={{ opacity: 0.08, mixBlendMode: 'screen' }}>
          <filter id="wsx-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#wsx-grain)" />
        </svg>
      </div>
    </section>
  )
}
