// Toyota Hilux doble cabina con equipamiento minero, modelada por código.
// Unidades ≈ metros. +X es el frente, +Y arriba, Z el ancho. Las ruedas tocan y=0.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const WHEEL_X = 1.54 // media distancia entre ejes (3,08 m)
const WHEEL_R = 0.395 // 265/65 R17
const TRACK = 0.8 // media trocha
const SIDE = 0.91 // cara lateral de la carrocería

/** Centro visual del vehículo (donde mira la cámara) y radio que lo contiene. */
export const HEART = new THREE.Vector3(0, 0.95, 0)
export const RADIUS = 3.0

// --------------------------------------------------------------- texturas
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
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

function badgeTexture(text) {
  return canvasTexture(1024, 200, (g, w, h) => {
    g.font = '900 170px "Big Shoulders Display", "Arial Black", Impact, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.letterSpacing = '28px'
    g.fillStyle = '#f2f2f2'
    g.fillText(text, w / 2, h / 2 + 6)
  })
}

// --------------------------------------------------------------- carrocería
function bodyShape() {
  const s = new THREE.Shape()
  const AR = 0.47 // radio del paso de rueda
  const AY = 0.4
  s.moveTo(-2.62, 0.44)
  s.lineTo(-WHEEL_X - AR, 0.44)
  s.absarc(-WHEEL_X, AY, AR, Math.PI, 0, true)
  s.lineTo(WHEEL_X - AR, 0.44)
  s.absarc(WHEEL_X, AY, AR, Math.PI, 0, true)
  s.lineTo(2.52, 0.44)
  s.lineTo(2.66, 0.52)
  s.quadraticCurveTo(2.74, 0.6, 2.74, 0.72) // parachoque
  s.lineTo(2.73, 0.98) // frontal
  s.quadraticCurveTo(2.72, 1.08, 2.6, 1.11) // borde del capó
  s.lineTo(1.3, 1.2) // capó
  s.lineTo(0.62, 1.77) // parabrisas
  s.quadraticCurveTo(0.55, 1.83, 0.42, 1.83)
  s.lineTo(-1.08, 1.83) // techo
  s.quadraticCurveTo(-1.18, 1.83, -1.2, 1.73)
  s.lineTo(-1.24, 1.24) // pared trasera de la cabina
  s.lineTo(-2.58, 1.24) // baranda de la tolva
  s.quadraticCurveTo(-2.66, 1.24, -2.66, 1.16)
  s.lineTo(-2.68, 0.62) // portalón
  s.quadraticCurveTo(-2.7, 0.48, -2.62, 0.44)
  return s
}

function polygon(points) {
  const s = new THREE.Shape()
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  return s
}

/** Cuadrilátero a partir de 4 vértices (para parabrisas y luneta). */
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3))
  g.computeVertexNormals()
  return g
}

// ------------------------------------------------------------------- rueda
function buildWheel(m) {
  const wheel = new THREE.Group()
  const spin = new THREE.Group() // lo que gira
  wheel.add(spin)

  // neumático: perfil redondeado revolucionado
  const profile = [
    [0.235, -0.135], [0.3, -0.142], [0.36, -0.136], [0.385, -0.115], [WHEEL_R, -0.07],
    [WHEEL_R, 0.07], [0.385, 0.115], [0.36, 0.136], [0.3, 0.142], [0.235, 0.135],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const tire = new THREE.Mesh(new THREE.LatheGeometry(profile, 72).rotateX(Math.PI / 2), m.tire)
  spin.add(tire)

  // tacos todo terreno, alternados
  const blocks = 34
  const lug = new THREE.InstancedMesh(new RoundedBoxGeometry(0.075, 0.03, 0.105, 2, 0.012), m.tire, blocks * 2)
  const o = new THREE.Object3D()
  for (let i = 0; i < blocks * 2; i += 1) {
    const a = ((i >> 1) / blocks) * Math.PI * 2 + (i % 2 ? Math.PI / blocks : 0)
    const r = WHEEL_R + 0.008
    o.position.set(Math.cos(a) * r, Math.sin(a) * r, i % 2 ? 0.062 : -0.062)
    o.rotation.set(0, 0, a + Math.PI / 2)
    o.updateMatrix()
    lug.setMatrixAt(i, o.matrix)
  }
  spin.add(lug)

  // llanta
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.236, 0.236, 0.22, 48, 1, true).rotateX(Math.PI / 2), m.gunmetal)
  spin.add(rim)
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.225, 0.03, 48).rotateX(Math.PI / 2), m.gunmetal)
  dish.position.z = 0.09
  spin.add(dish)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    const spoke = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.05, 0.035, 2, 0.012), m.chrome)
    spoke.position.set(Math.cos(a) * 0.115, Math.sin(a) * 0.115, 0.112)
    spoke.rotation.z = a
    spin.add(spoke)
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8).rotateX(Math.PI / 2), m.chrome)
    nut.position.set(Math.cos(a + 0.52) * 0.06, Math.sin(a + 0.52) * 0.06, 0.122)
    spin.add(nut)
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.03, 24).rotateX(Math.PI / 2), m.chrome)
  cap.position.z = 0.125
  spin.add(cap)
  return { wheel, spin }
}

// -------------------------------------------------------------- materiales
function materials(paint) {
  const std = (o) => new THREE.MeshStandardMaterial(o)
  return {
    // pintura automotriz: base metálica saturada + barniz transparente
    paint: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.32, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.85, sheen: 0.4, sheenColor: '#ffdd66', sheenRoughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#06090d', metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, side: THREE.DoubleSide }),
    trim: std({ color: '#121314', metalness: 0.2, roughness: 0.62 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: '#0b0b0c', metalness: 0.3, roughness: 0.25, clearcoat: 1 }),
    chrome: std({ color: '#e8e8ea', metalness: 1, roughness: 0.12, envMapIntensity: 1.4 }),
    gunmetal: std({ color: '#3a3d42', metalness: 0.9, roughness: 0.32 }),
    tire: std({ color: '#141414', metalness: 0, roughness: 0.92 }),
    alu: std({ color: '#a7abb0', metalness: 0.95, roughness: 0.35 }),
    head: std({ color: '#ffffff', emissive: '#fff4dc', emissiveIntensity: 0, metalness: 0.4, roughness: 0.15 }),
    drl: std({ color: '#ffffff', emissive: '#e8f2ff', emissiveIntensity: 0 }),
    tail: std({ color: '#5a0508', emissive: '#ff1a1a', emissiveIntensity: 0.25, roughness: 0.2 }),
    beacon: new THREE.MeshPhysicalMaterial({ color: '#ff8a00', emissive: '#ff7a00', emissiveIntensity: 0.4, roughness: 0.15, transmission: 0, clearcoat: 1 }),
    flag: std({ color: '#ff6a00', emissive: '#ff5a00', emissiveIntensity: 0.25, roughness: 0.8, side: THREE.DoubleSide }),
    pole: std({ color: '#f1f1f1', roughness: 0.4 }),
    bed: std({ color: '#0d0e10', metalness: 0.1, roughness: 0.7 }),
  }
}

// ----------------------------------------------------------------- armado
/**
 * @param {{ paint?: string, logoUrl?: string }} opts
 */
export function buildHilux({ paint = '#ffc400', logoUrl } = {}) {
  const m = materials(paint)
  const disposables = []
  const root = new THREE.Group()
  const add = (geo, mat, pos, rot, parent = root) => {
    const mesh = new THREE.Mesh(geo, mat)
    if (pos) mesh.position.set(...pos)
    if (rot) mesh.rotation.set(...rot)
    mesh.castShadow = false
    parent.add(mesh)
    return mesh
  }

  // carrocería extruida con bordes redondeados
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape(), {
    depth: 1.68, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelOffset: -0.06, bevelSegments: 6, curveSegments: 32,
  })
  bodyGeo.translate(0, 0, -0.84)
  add(bodyGeo, m.paint)

  // línea de hombro: el pliegue que recorre la carrocería y atrapa la luz
  ;[1, -1].forEach((side) => {
    const crease = add(new THREE.CapsuleGeometry(0.022, 4.3, 6, 12).rotateZ(Math.PI / 2), m.paint, [0.08, 1.15, side * (SIDE - 0.005)])
    crease.scale.set(1, 1, 0.55)
    // ensanche de los guardabarros, del color de la carrocería
    ;[WHEEL_X, -WHEEL_X].forEach((x) => {
      const bulge = add(new THREE.TorusGeometry(0.6, 0.05, 10, 40, Math.PI * 0.86), m.paint, [x, 0.42, side * (SIDE - 0.01)], [0, 0, Math.PI * 0.07])
      bulge.scale.set(1, 1, 0.6)
    })
  })

  // tolva cubierta (lona negra)
  add(new RoundedBoxGeometry(1.3, 0.03, 1.66, 2, 0.012), m.bed, [-1.93, 1.255, 0])

  // vidrios laterales
  const front = polygon([[1.22, 1.27], [0.6, 1.73], [-0.21, 1.73], [-0.21, 1.27]])
  const rear = polygon([[-0.33, 1.27], [-0.33, 1.73], [-1.06, 1.73], [-1.13, 1.27]])
  ;[1, -1].forEach((side) => {
    ;[front, rear].forEach((shape) => add(new THREE.ShapeGeometry(shape), m.glass, [0, 0, side * (SIDE + 0.004)]))
  })
  // parabrisas
  {
    const a = new THREE.Vector2(1.3, 1.2)
    const b = new THREE.Vector2(0.62, 1.77)
    const d = b.clone().sub(a)
    const n = new THREE.Vector2(d.y, -d.x).normalize().multiplyScalar(-0.008)
    const a2 = a.clone().addScaledVector(d, 0.05).add(n)
    const b2 = b.clone().addScaledVector(d, -0.05).add(n)
    add(quad([a2.x, a2.y, 0.8], [b2.x, b2.y, 0.76], [b2.x, b2.y, -0.76], [a2.x, a2.y, -0.8]), m.glass)
  }
  // luneta
  add(quad([-1.243, 1.4, -0.58], [-1.222, 1.68, -0.55], [-1.222, 1.68, 0.55], [-1.243, 1.4, 0.58]), m.glass)

  // líneas de puertas y manillas
  ;[1, -1].forEach((side) => {
    ;[1.2, -0.27, -1.22].forEach((x) => add(new THREE.PlaneGeometry(0.012, 0.62), m.trim, [x, 0.93, side * (SIDE + 0.003)], [0, side > 0 ? 0 : Math.PI, 0]))
    ;[0.22, -0.98].forEach((x) => add(new RoundedBoxGeometry(0.17, 0.035, 0.03, 2, 0.01), m.chrome, [x, 1.13, side * (SIDE + 0.01)]))
  })

  // logo West en las puertas delanteras
  if (logoUrl) {
    const tex = new THREE.TextureLoader().load(logoUrl)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    disposables.push(tex)
    const logoMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 })
    m.logo = logoMat
    ;[1, -1].forEach((side) => add(new THREE.PlaneGeometry(0.62, 0.23), logoMat, [0.47, 0.92, side * (SIDE + 0.006)], [0, side > 0 ? 0 : Math.PI, 0]))
  }

  // frontal: parrilla, emblema, focos, parachoque
  // parrilla grande trapezoidal con marco cromado (Hilux actual)
  {
    const g = polygon([[-0.62, -0.24], [0.62, -0.24], [0.56, 0.2], [-0.56, 0.2]])
    const grille = new THREE.ExtrudeGeometry(g, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.03, bevelSegments: 3 })
    add(grille, m.gloss, [2.725, 0.8, 0], [0, Math.PI / 2, 0])
    const outline = new THREE.Shape()
    outline.moveTo(-0.66, -0.27)
    outline.lineTo(0.66, -0.27)
    outline.lineTo(0.6, 0.23)
    outline.lineTo(-0.6, 0.23)
    outline.lineTo(-0.66, -0.27)
    const hole = new THREE.Path()
    hole.moveTo(-0.61, -0.235)
    hole.lineTo(-0.55, 0.195)
    hole.lineTo(0.55, 0.195)
    hole.lineTo(0.61, -0.235)
    hole.lineTo(-0.61, -0.235)
    outline.holes.push(hole)
    add(new THREE.ExtrudeGeometry(outline, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }), m.chrome, [2.775, 0.8, 0], [0, Math.PI / 2, 0])
  }
  ;[0.68, 0.76, 0.84, 0.92].forEach((y) => add(new RoundedBoxGeometry(0.02, 0.018, 1.0, 2, 0.006), m.gunmetal, [2.79, y, 0]))
  const emblem = add(new THREE.TorusGeometry(0.085, 0.012, 10, 40), m.chrome, [2.81, 0.84, 0], [0, Math.PI / 2, 0])
  emblem.scale.set(1, 0.68, 1)
  ;[1, -1].forEach((side) => {
    add(new RoundedBoxGeometry(0.06, 0.15, 0.32, 3, 0.03), m.gloss, [2.72, 0.985, side * 0.7])
    add(new RoundedBoxGeometry(0.05, 0.09, 0.2, 2, 0.02), m.head, [2.75, 0.995, side * 0.74])
    add(new RoundedBoxGeometry(0.03, 0.018, 0.28, 1, 0.008), m.drl, [2.758, 0.925, side * 0.7])
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20).rotateZ(Math.PI / 2), m.head, [2.78, 0.53, side * 0.68])
  })
  add(new RoundedBoxGeometry(0.16, 0.19, 1.86, 3, 0.05), m.trim, [2.7, 0.53, 0])
  add(new RoundedBoxGeometry(0.34, 0.04, 1.1, 2, 0.015), m.alu, [2.6, 0.41, 0])

  // trasera: focos, parachoque, insignia
  ;[1, -1].forEach((side) => add(new RoundedBoxGeometry(0.05, 0.38, 0.12, 2, 0.02), m.tail, [-2.69, 0.95, side * 0.84]))
  add(new RoundedBoxGeometry(0.16, 0.16, 1.86, 3, 0.05), m.chrome, [-2.7, 0.5, 0])
  add(new RoundedBoxGeometry(0.12, 0.07, 0.12, 2, 0.02), m.gunmetal, [-2.82, 0.47, 0])
  {
    const badge = badgeTexture('HILUX')
    disposables.push(badge)
    const mat = new THREE.MeshStandardMaterial({ map: badge, transparent: true, metalness: 1, roughness: 0.18, polygonOffset: true, polygonOffsetFactor: -2 })
    m.badge = mat
    add(new THREE.PlaneGeometry(0.9, 0.18), mat, [-2.687, 1.0, 0], [0, -Math.PI / 2, 0])
  }

  // laterales: guardabarros, pisaderas, espejos
  ;[1, -1].forEach((side) => {
    ;[WHEEL_X, -WHEEL_X].forEach((x) => {
      const flare = add(new THREE.TorusGeometry(0.505, 0.06, 12, 48, Math.PI + 0.24), m.trim, [x, 0.4, side * (SIDE + 0.01)], [0, 0, -0.12])
      flare.scale.set(1, 1, 0.8)
      add(new RoundedBoxGeometry(0.03, 0.22, 0.2, 1, 0.01), m.trim, [x - 0.52, 0.27, side * 0.82]) // faldón
    })
    add(new RoundedBoxGeometry(1.86, 0.05, 0.17, 2, 0.02), m.alu, [0, 0.5, side * 0.99])
    add(new RoundedBoxGeometry(0.12, 0.17, 0.22, 3, 0.04), m.gloss, [1.05, 1.38, side * 1.05])
    add(new RoundedBoxGeometry(0.08, 0.04, 0.12, 2, 0.015), m.gloss, [1.08, 1.3, side * 0.95])
  })

  // chasis visible bajo la carrocería
  add(new THREE.BoxGeometry(4.6, 0.16, 1.4), m.trim, [0, 0.36, 0])
  ;[WHEEL_X, -WHEEL_X].forEach((x) => add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12).rotateX(Math.PI / 2), m.trim, [x, WHEEL_R, 0]))
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 12).rotateZ(Math.PI / 2), m.chrome, [-2.62, 0.33, 0.6])

  // equipamiento minero: barra antivuelco, snorkel, baliza, barras de techo, pértiga
  const tube = (pts, r, mat) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, r, 12), mat)
  tube([[-1.42, 1.24, 0.84], [-1.46, 1.78, 0.8], [-1.48, 1.88, 0.6], [-1.48, 1.88, -0.6], [-1.46, 1.78, -0.8], [-1.42, 1.24, -0.84]], 0.035, m.gloss)
  tube([[-1.47, 1.86, 0.55], [-2.2, 1.26, 0.82]], 0.025, m.gloss)
  tube([[-1.47, 1.86, -0.55], [-2.2, 1.26, -0.82]], 0.025, m.gloss)
  tube([[1.95, 1.02, 0.95], [1.35, 1.08, 0.97], [0.78, 1.5, 0.95], [0.6, 1.9, 0.92]], 0.05, m.trim)
  add(new RoundedBoxGeometry(0.2, 0.12, 0.14, 2, 0.04), m.trim, [0.62, 1.95, 0.92], [0, 0, 0.25])
  ;[1, -1].forEach((side) => add(new RoundedBoxGeometry(1.25, 0.04, 0.05, 2, 0.015), m.gloss, [-0.33, 1.86, side * 0.66]))
  add(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 24), m.trim, [-0.72, 1.86, 0])
  const beacon = add(new THREE.SphereGeometry(0.088, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.beacon, [-0.72, 1.885, 0])
  const beaconLight = new THREE.PointLight('#ff8a00', 0, 4.5, 2)
  beaconLight.position.set(-0.72, 2.05, 0)
  root.add(beaconLight)
  add(new THREE.CylinderGeometry(0.011, 0.011, 2.2, 8), m.pole, [-2.52, 2.32, -0.82])
  const flagGeo = new THREE.PlaneGeometry(0.44, 0.28, 16, 4).translate(0.22, 0, 0)
  const flag = add(flagGeo, m.flag, [-2.52, 3.28, -0.82])
  const flagBase = flagGeo.attributes.position.array.slice()

  // ruedas
  const wheels = []
  const proto = buildWheel(m)
  ;[[WHEEL_X, 1], [WHEEL_X, -1], [-WHEEL_X, 1], [-WHEEL_X, -1]].forEach(([x, side], i) => {
    const w = i === 0 ? proto.wheel : proto.wheel.clone(true)
    w.position.set(x, WHEEL_R, side * TRACK)
    if (side < 0) w.rotation.y = Math.PI
    root.add(w)
    wheels.push({ group: w, spin: w.children[0], side })
  })

  // sombra de contacto
  const shadowTex = shadowTexture()
  disposables.push(shadowTex)
  const shadow = add(new THREE.PlaneGeometry(7.2, 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), [0, 0.004, 0])
  shadow.renderOrder = -1

  // ------------------------------------------------------------ animación
  let lightsOn = 0
  /**
   * t: tiempo (s) · roll: avance de las ruedas en radianes · alive: animación
   * lights: 0..1 encendido de focos (intro)
   */
  function update({ t, roll, alive, lights }) {
    lightsOn = lights
    // parpadeo de encendido de los focos
    const flicker = lights < 1 && lights > 0 ? (Math.sin(t * 60) > 0.2 ? 1 : 0.25) : 1
    m.head.emissiveIntensity = 3.2 * lightsOn * flicker
    m.drl.emissiveIntensity = 4 * lightsOn
    m.tail.emissiveIntensity = 0.25 + 1.6 * lightsOn
    const pulse = alive ? Math.pow(Math.max(0, Math.sin(t * 5.2)), 6) : 0.4
    m.beacon.emissiveIntensity = 0.4 + 5 * pulse * lightsOn
    beaconLight.intensity = 6 * pulse * lightsOn
    wheels.forEach(({ spin, side }) => (spin.rotation.z = -roll * side))
    // banderín flameando
    const pos = flag.geometry.attributes.position
    for (let i = 0; i < pos.count; i += 1) {
      const x = flagBase[i * 3]
      pos.array[i * 3 + 2] = alive ? Math.sin(x * 9 - t * 7) * 0.035 * (x / 0.44) : 0
    }
    pos.needsUpdate = true
  }

  function dispose() {
    root.traverse((o) => o.geometry?.dispose())
    Object.values(m).forEach((mat) => mat.dispose?.())
    shadow.material.dispose()
    disposables.forEach((d) => d.dispose())
  }

  return { root, update, dispose, beacon }
}
