// Toyota Hilux doble cabina (frente 2024), modelada por código como referencia.
// Unidades ≈ metros. +X es el frente, +Y arriba, Z el ancho. Las ruedas tocan y=0.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const WHEEL_X = 1.54 // media distancia entre ejes (3,08 m)
const WHEEL_R = 0.395 // 265/65 R17
const TRACK = 0.8 // media trocha
const SIDE = 0.91 // cara lateral de la carrocería baja
const CABIN = 0.82 // cara lateral de la cabina (más angosta: "tumblehome")

/** Centro visual del vehículo (donde mira la cámara) y radio que lo contiene. */
export const HEART = new THREE.Vector3(0, 0.95, 0)
export const RADIUS = 3.0

// --------------------------------------------------------------- texturas
function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function shadowTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    grad.addColorStop(0, 'rgba(0,0,0,0.85)')
    grad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.setTransform(1, 0, 0, h / w, 0, 0)
    g.fillStyle = grad
    g.fillRect(0, 0, w, w)
  })
}

/** Panal de abejas de la parrilla: celdas negras con borde gris oscuro. */
function honeycombTexture() {
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#050505'
    g.fillRect(0, 0, w, h)
    const r = 16
    const hx = r * Math.sqrt(3)
    g.lineWidth = 5
    g.strokeStyle = '#5b6067'
    for (let row = -1; row < h / (r * 1.5) + 1; row += 1) {
      for (let col = -1; col < w / hx + 1; col += 1) {
        const cx = col * hx + (row % 2 ? hx / 2 : 0)
        const cy = row * r * 1.5
        g.beginPath()
        for (let k = 0; k < 6; k += 1) {
          const a = Math.PI / 6 + (k * Math.PI) / 3
          const x = cx + Math.cos(a) * r
          const y = cy + Math.sin(a) * r
          if (k) g.lineTo(x, y)
          else g.moveTo(x, y)
        }
        g.closePath()
        g.stroke()
      }
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3.2, 3.2)
  return t
}

function slotTexture() {
  const t = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#040404'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#2d3034'
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 4)
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(4, 9)
  return t
}

function textTexture(text, { color = '#f2f2f2', bg = null, weight = 900, size = 150, spacing = 26 } = {}) {
  return canvasTexture(1024, 200, (g, w, h) => {
    if (bg) {
      g.fillStyle = bg
      g.fillRect(0, 0, w, h)
    }
    g.font = `${weight} ${size}px "Big Shoulders Display", "Arial Black", Impact, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.letterSpacing = `${spacing}px`
    g.fillStyle = color
    g.fillText(text, w / 2, h / 2 + 6)
  })
}

// --------------------------------------------------------------- perfiles
/** Carrocería baja: frente, capó, línea de cintura y tolva, con pasos de rueda. */
function lowerBodyShape() {
  const s = new THREE.Shape()
  const AR = 0.47
  const AY = 0.4
  s.moveTo(-2.62, 0.44)
  s.lineTo(-WHEEL_X - AR, 0.44)
  s.absarc(-WHEEL_X, AY, AR, Math.PI, 0, true)
  s.lineTo(WHEEL_X - AR, 0.44)
  s.absarc(WHEEL_X, AY, AR, Math.PI, 0, true)
  s.lineTo(2.52, 0.44)
  s.lineTo(2.66, 0.52)
  s.quadraticCurveTo(2.75, 0.6, 2.75, 0.72) // parachoque
  s.lineTo(2.75, 1.02) // frontal alto y vertical
  s.quadraticCurveTo(2.74, 1.12, 2.58, 1.14) // borde del capó
  s.lineTo(1.32, 1.23) // capó
  s.lineTo(-1.26, 1.24) // cintura bajo la cabina
  s.lineTo(-2.58, 1.24) // baranda de la tolva
  s.quadraticCurveTo(-2.66, 1.24, -2.66, 1.16)
  s.lineTo(-2.68, 0.62) // portalón
  s.quadraticCurveTo(-2.7, 0.48, -2.62, 0.44)
  return s
}

/** Cabina: parabrisas inclinado, techo y pared trasera. */
function cabinShape() {
  const s = new THREE.Shape()
  s.moveTo(1.38, 1.2)
  s.lineTo(0.62, 1.77)
  s.quadraticCurveTo(0.53, 1.83, 0.38, 1.83)
  s.lineTo(-1.06, 1.82)
  s.quadraticCurveTo(-1.17, 1.82, -1.19, 1.72)
  s.lineTo(-1.24, 1.2)
  s.lineTo(1.38, 1.2)
  return s
}

function polygon(points) {
  const s = new THREE.Shape()
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  return s
}

function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3))
  g.computeVertexNormals()
  return g
}

// ------------------------------------------------------------------- rueda
function buildWheel(m) {
  const wheel = new THREE.Group()
  const spin = new THREE.Group()
  wheel.add(spin)

  const profile = [
    [0.235, -0.135], [0.3, -0.142], [0.36, -0.136], [0.385, -0.115], [WHEEL_R, -0.07],
    [WHEEL_R, 0.07], [0.385, 0.115], [0.36, 0.136], [0.3, 0.142], [0.235, 0.135],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  spin.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 72).rotateX(Math.PI / 2), m.tire))

  // banda de rodado todo terreno
  const blocks = 34
  const lug = new THREE.InstancedMesh(new RoundedBoxGeometry(0.075, 0.026, 0.105, 2, 0.011), m.tire, blocks * 2)
  const o = new THREE.Object3D()
  for (let i = 0; i < blocks * 2; i += 1) {
    const a = ((i >> 1) / blocks) * Math.PI * 2 + (i % 2 ? Math.PI / blocks : 0)
    const r = WHEEL_R + 0.007
    o.position.set(Math.cos(a) * r, Math.sin(a) * r, i % 2 ? 0.062 : -0.062)
    o.rotation.set(0, 0, a + Math.PI / 2)
    o.updateMatrix()
    lug.setMatrixAt(i, o.matrix)
  }
  spin.add(lug)

  // llanta de 6 rayos en dos tonos: caras mecanizadas y fondo oscuro
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.236, 0.236, 0.22, 48, 1, true).rotateX(Math.PI / 2), m.rimDark))
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.226, 0.03, 48).rotateX(Math.PI / 2), m.rimDark)
  dish.position.z = 0.085
  spin.add(dish)
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.01, 8, 64), m.machined)
  lip.position.z = 0.112
  spin.add(lip)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    const spoke = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.07, 0.035, 2, 0.014), m.machined)
    spoke.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.108)
    spoke.rotation.z = a
    spin.add(spoke)
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8).rotateX(Math.PI / 2), m.chrome)
    nut.position.set(Math.cos(a + 0.52) * 0.058, Math.sin(a + 0.52) * 0.058, 0.122)
    spin.add(nut)
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.03, 24).rotateX(Math.PI / 2), m.rimDark)
  cap.position.z = 0.125
  spin.add(cap)
  return { wheel, spin }
}

// -------------------------------------------------------------- materiales
function materials(paint) {
  const std = (o) => new THREE.MeshStandardMaterial(o)
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.82, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.05 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#05070a', metalness: 0.25, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7, side: THREE.DoubleSide }),
    trim: std({ color: '#0e0f10', metalness: 0.15, roughness: 0.65 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: '#070708', metalness: 0.3, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 }),
    grilleFrame: std({ color: '#34373b', metalness: 0.7, roughness: 0.38 }),
    chrome: std({ color: '#eceef0', metalness: 1, roughness: 0.1, envMapIntensity: 1.4 }),
    machined: std({ color: '#c9ccd0', metalness: 1, roughness: 0.22, envMapIntensity: 1.3 }),
    rimDark: std({ color: '#2b2e33', metalness: 0.8, roughness: 0.4 }),
    tire: std({ color: '#141414', metalness: 0, roughness: 0.92 }),
    skid: std({ color: '#7d8187', metalness: 0.9, roughness: 0.4 }),
    head: std({ color: '#ffffff', emissive: '#fff6e2', emissiveIntensity: 0, metalness: 0.4, roughness: 0.15 }),
    drl: std({ color: '#ffffff', emissive: '#eaf3ff', emissiveIntensity: 0 }),
    tail: std({ color: '#5a0508', emissive: '#ff1a1a', emissiveIntensity: 0.25, roughness: 0.2 }),
    bed: std({ color: '#0d0e10', metalness: 0.1, roughness: 0.7 }),
  }
}

// ----------------------------------------------------------------- armado
/** @param {{ paint?: string }} opts */
export function buildHilux({ paint = '#b9bcc1' } = {}) {
  const m = materials(paint)
  const disposables = []
  const root = new THREE.Group()
  const add = (geo, mat, pos, rot, parent = root) => {
    const mesh = new THREE.Mesh(geo, mat)
    if (pos) mesh.position.set(...pos)
    if (rot) mesh.rotation.set(...rot)
    parent.add(mesh)
    return mesh
  }
  /** Pieza del frontal: polígono en (z, y) extruido hacia +X desde x. */
  const front = (pts, depth, mat, x, bevel = 0.008) => {
    const shape = polygon(pts.map(([z, y]) => [-z, y]))
    const geo = bevel
      ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 })
      : new THREE.ShapeGeometry(shape)
    return add(geo, mat, [x, 0, 0], [0, Math.PI / 2, 0])
  }
  const tex = (t) => {
    disposables.push(t)
    return t
  }

  // carrocería baja y cabina más angosta, ambas con bordes redondeados
  const lower = new THREE.ExtrudeGeometry(lowerBodyShape(), { depth: 1.68, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelOffset: -0.06, bevelSegments: 6, curveSegments: 32 })
  lower.translate(0, 0, -0.84)
  add(lower, m.paint)
  const cabin = new THREE.ExtrudeGeometry(cabinShape(), { depth: 1.48, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelOffset: -0.08, bevelSegments: 8, curveSegments: 24 })
  cabin.translate(0, 0, -0.74)
  add(cabin, m.paint)

  // capó con relieve central y rejilla de ventilación negra al pie del parabrisas
  add(new RoundedBoxGeometry(1.1, 0.05, 0.86, 3, 0.024), m.paint, [1.97, 1.195, 0], [0, 0, -0.071])
  add(new RoundedBoxGeometry(0.14, 0.02, 1.5, 2, 0.008), m.trim, [1.33, 1.232, 0])

  // línea de hombro y ensanches de guardabarros (color carrocería) con borde negro
  ;[1, -1].forEach((side) => {
    const crease = add(new THREE.CapsuleGeometry(0.02, 4.3, 6, 12).rotateZ(Math.PI / 2), m.paint, [0.08, 1.13, side * (SIDE - 0.006)])
    crease.scale.set(1, 1, 0.55)
    ;[WHEEL_X, -WHEEL_X].forEach((x) => {
      const bulge = add(new THREE.TorusGeometry(0.6, 0.075, 12, 48, Math.PI * 0.9), m.paint, [x, 0.42, side * (SIDE - 0.01)], [0, 0, Math.PI * 0.05])
      bulge.scale.set(1, 1, 0.75)
      const liner = add(new THREE.TorusGeometry(0.49, 0.03, 8, 48, Math.PI + 0.2), m.trim, [x, 0.4, side * (SIDE + 0.002)], [0, 0, -0.1])
      liner.scale.set(1, 1, 0.7)
    })
  })

  // tolva (cubierta negra)
  add(new RoundedBoxGeometry(1.3, 0.03, 1.66, 2, 0.012), m.bed, [-1.93, 1.255, 0])

  // vidrios: banda lateral continua, pilar B negro y visera sobre las ventanas
  const sideGlass = polygon([[1.25, 1.3], [0.64, 1.74], [-1.02, 1.74], [-1.12, 1.3]])
  ;[1, -1].forEach((side) => {
    add(new THREE.ShapeGeometry(sideGlass), m.glass, [0, 0, side * (CABIN + 0.004)])
    add(new THREE.PlaneGeometry(0.11, 0.44), m.trim, [-0.27, 1.52, side * (CABIN + 0.008)], [0, side > 0 ? 0 : Math.PI, 0])
    add(new RoundedBoxGeometry(1.95, 0.028, 0.06, 2, 0.012), m.gloss, [-0.18, 1.765, side * (CABIN + 0.02)])
  })
  {
    const a = new THREE.Vector2(1.38, 1.2)
    const b = new THREE.Vector2(0.62, 1.77)
    const d = b.clone().sub(a)
    const n = new THREE.Vector2(d.y, -d.x).normalize().multiplyScalar(-0.01)
    const a2 = a.clone().addScaledVector(d, 0.06).add(n)
    const b2 = b.clone().addScaledVector(d, -0.05).add(n)
    add(quad([a2.x, a2.y, 0.72], [b2.x, b2.y, 0.68], [b2.x, b2.y, -0.68], [a2.x, a2.y, -0.72]), m.glass)
  }
  add(quad([-1.243, 1.4, -0.56], [-1.222, 1.68, -0.53], [-1.222, 1.68, 0.53], [-1.243, 1.4, 0.56]), m.glass)

  // puertas, manillas, espejos e insignia lateral
  const fenderBadge = textTexture('HILUX', { color: '#e9ebee', size: 140 })
  tex(fenderBadge)
  const badgeMat = new THREE.MeshStandardMaterial({ map: fenderBadge, transparent: true, metalness: 1, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 })
  m.fenderBadge = badgeMat
  ;[1, -1].forEach((side) => {
    ;[1.24, -0.26, -1.18].forEach((x) => add(new THREE.PlaneGeometry(0.012, 0.6), m.trim, [x, 0.92, side * (SIDE + 0.003)], [0, side > 0 ? 0 : Math.PI, 0]))
    ;[0.18, -0.98].forEach((x) => add(new RoundedBoxGeometry(0.17, 0.04, 0.03, 2, 0.012), m.rimDark, [x, 1.13, side * (SIDE + 0.01)]))
    add(new THREE.PlaneGeometry(0.34, 0.066), badgeMat, [1.66, 1.01, side * (SIDE + 0.006)], [0, side > 0 ? 0 : Math.PI, 0])
    add(new RoundedBoxGeometry(0.24, 0.16, 0.2, 3, 0.055), m.gloss, [1.1, 1.4, side * (CABIN + 0.17)], [0, side * -0.12, 0])
    add(new RoundedBoxGeometry(0.12, 0.05, 0.12, 2, 0.02), m.gloss, [1.16, 1.33, side * (CABIN + 0.06)])
    add(new RoundedBoxGeometry(1.9, 0.05, 0.18, 2, 0.02), m.trim, [0, 0.48, side * 0.99])
  })

  // ---------------------------------------------------------------- frontal
  ;[1, -1].forEach((s) => {
    // foco: carcasa negra en ángulo hacia la parrilla, firma LED y proyectores
    front([[0.45 * s, 0.94], [0.9 * s, 0.97], [0.92 * s, 1.09], [0.52 * s, 1.1]], 0.05, m.gloss, 2.715)
    front([[0.52 * s, 0.965], [0.88 * s, 0.99], [0.88 * s, 1.003], [0.52 * s, 0.98]], 0, m.drl, 2.775, 0)
    ;[0.63, 0.77].forEach((z) => add(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 24).rotateZ(Math.PI / 2), m.head, [2.775, 1.04, z * s]))
    // el foco envuelve la esquina hacia el guardabarros
    add(new RoundedBoxGeometry(0.3, 0.12, 0.04, 2, 0.02), m.gloss, [2.6, 1.03, s * (SIDE - 0.005)], [0, 0, 0.05])
    add(new RoundedBoxGeometry(0.22, 0.014, 0.01, 1, 0.005), m.drl, [2.6, 1.0, s * (SIDE + 0.016)])
    // tomas laterales en "C" con neblinero
    front([[0.5 * s, 0.9], [0.62 * s, 0.9], [0.66 * s, 0.66], [0.9 * s, 0.6], [0.9 * s, 0.5], [0.58 * s, 0.52], [0.52 * s, 0.6]], 0.035, m.gloss, 2.74)
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 20).rotateZ(Math.PI / 2), m.head, [2.775, 0.66, 0.75 * s])
  })
  // parrilla trapezoidal: marco gris, panal superior y ranuras inferiores
  front([[-0.5, 1.1], [0.5, 1.1], [0.43, 0.8], [0.38, 0.58], [-0.38, 0.58], [-0.43, 0.8]], 0.045, m.grilleFrame, 2.735)
  {
    const honey = tex(honeycombTexture())
    const slots = tex(slotTexture())
    const upper = front([[-0.425, 1.05], [0.425, 1.05], [0.375, 0.82], [-0.375, 0.82]], 0, new THREE.MeshStandardMaterial({ map: honey, metalness: 0.4, roughness: 0.45 }), 2.787, 0)
    const lowerG = front([[-0.33, 0.78], [0.33, 0.78], [0.31, 0.64], [-0.31, 0.64]], 0, new THREE.MeshStandardMaterial({ map: slots, metalness: 0.4, roughness: 0.5 }), 2.787, 0)
    m.honey = upper.material
    m.slots = lowerG.material
  }
  // emblema Toyota: tres elipses cromadas
  {
    const g = new THREE.Group()
    g.position.set(2.8, 0.95, 0)
    g.rotation.y = Math.PI / 2
    root.add(g)
    const ring = (r, tube, sx, sy, y = 0) => {
      const e = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 48), m.chrome)
      e.scale.set(sx, sy, 1)
      e.position.y = y
      g.add(e)
    }
    ring(0.11, 0.013, 1, 0.7)
    ring(0.07, 0.009, 1, 0.36, 0.025)
    ring(0.048, 0.009, 0.42, 1, -0.006)
  }
  // banda inferior negra, placa HILUX y protector
  add(new RoundedBoxGeometry(0.1, 0.13, 1.56, 2, 0.035), m.trim, [2.7, 0.52, 0])
  {
    const plate = tex(textTexture('HILUX', { bg: '#0a0a0a', color: '#f4f4f4', size: 120, spacing: 22 }))
    m.plate = new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 })
    add(new THREE.PlaneGeometry(0.42, 0.085), m.plate, [2.756, 0.53, 0], [0, Math.PI / 2, 0])
  }
  add(new RoundedBoxGeometry(0.3, 0.05, 1.24, 2, 0.02), m.skid, [2.6, 0.43, 0], [0, 0, 0.18])

  // trasera
  ;[1, -1].forEach((side) => add(new RoundedBoxGeometry(0.05, 0.38, 0.12, 2, 0.02), m.tail, [-2.69, 0.95, side * 0.84]))
  add(new RoundedBoxGeometry(0.16, 0.16, 1.86, 3, 0.05), m.skid, [-2.7, 0.5, 0])
  {
    const badge = tex(textTexture('HILUX'))
    m.badge = new THREE.MeshStandardMaterial({ map: badge, transparent: true, metalness: 1, roughness: 0.18, polygonOffset: true, polygonOffsetFactor: -2 })
    add(new THREE.PlaneGeometry(0.9, 0.18), m.badge, [-2.687, 1.0, 0], [0, -Math.PI / 2, 0])
  }

  // barra deportiva negra
  const tube = (pts, r, mat) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, r, 12), mat)
  tube([[-1.45, 1.24, 0.84], [-1.5, 1.78, 0.8], [-1.52, 1.87, 0.6], [-1.52, 1.87, -0.6], [-1.5, 1.78, -0.8], [-1.45, 1.24, -0.84]], 0.04, m.gloss)
  tube([[-1.52, 1.85, 0.55], [-2.15, 1.26, 0.82]], 0.028, m.gloss)
  tube([[-1.52, 1.85, -0.55], [-2.15, 1.26, -0.82]], 0.028, m.gloss)

  // chasis visible
  add(new THREE.BoxGeometry(4.6, 0.16, 1.4), m.trim, [0, 0.36, 0])
  ;[WHEEL_X, -WHEEL_X].forEach((x) => add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12).rotateX(Math.PI / 2), m.trim, [x, WHEEL_R, 0]))

  // ruedas
  const wheels = []
  const proto = buildWheel(m)
  ;[[WHEEL_X, 1], [WHEEL_X, -1], [-WHEEL_X, 1], [-WHEEL_X, -1]].forEach(([x, side], i) => {
    const w = i === 0 ? proto.wheel : proto.wheel.clone(true)
    w.position.set(x, WHEEL_R, side * TRACK)
    if (side < 0) w.rotation.y = Math.PI
    root.add(w)
    wheels.push({ spin: w.children[0], side })
  })

  // sombra de contacto
  const shadowTex = tex(shadowTexture())
  const shadow = add(new THREE.PlaneGeometry(7.2, 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), [0, 0.004, 0])
  shadow.renderOrder = -1

  // ------------------------------------------------------------ animación
  function update({ t, roll, lights }) {
    const flicker = lights < 1 && lights > 0 ? (Math.sin(t * 60) > 0.2 ? 1 : 0.25) : 1
    m.head.emissiveIntensity = 3 * lights * flicker
    m.drl.emissiveIntensity = 5 * lights
    m.tail.emissiveIntensity = 0.25 + 1.6 * lights
    wheels.forEach(({ spin, side }) => (spin.rotation.z = -roll * side))
  }

  function dispose() {
    root.traverse((o) => o.geometry?.dispose())
    Object.values(m).forEach((mat) => mat.dispose?.())
    shadow.material.dispose()
    disposables.forEach((d) => d.dispose())
  }

  return { root, update, dispose }
}
