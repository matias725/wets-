// Ficha de un vehículo como imagen PNG (para enviar por WhatsApp o correo).
// Se dibuja en un canvas: no depende de cómo se vea la página en ese momento.
import logoUrl from '@/assets/img/west_logo_yellow.png'
import { INTERVENTION_COLOR, VEHICLE_STATUS } from '@/data/catalog'
import { clp, date, km, num } from '@/lib/format'

const W = 1080
const PAD = 56
const FONT = '"Inter Variable", "Segoe UI", system-ui, sans-serif'
const C = {
  bg: '#f6f5f1',
  ink: '#2a2723',
  muted: '#6b7280',
  line: '#e5e3dc',
  card: '#ffffff',
  brand: '#ffc400',
  dark: '#1f1d1a',
}

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

function font(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`
}

/** Corta el texto en líneas que caben en maxWidth (máx. maxLines, con "…"). */
function wrap(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text ?? '').split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxWidth) line = test
    else {
      if (line) lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines)
    let last = cut[maxLines - 1]
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    cut[maxLines - 1] = `${last}…`
    return cut
  }
  return lines
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function pill(ctx, x, y, text, color) {
  font(ctx, 22, 600)
  const w = ctx.measureText(text).width + 40
  roundRect(ctx, x, y, w, 40, 20, `${color}26`)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x + 18, y + 20, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = C.ink
  ctx.fillText(text, x + 30, y + 28)
  return w
}

/** Dibuja la imagen "cover" dentro del rectángulo (recorta lo que sobra). */
function cover(ctx, img, x, y, w, h, r) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.clip()
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
  ctx.restore()
}

function newCanvas(H) {
  const scale = 2 // nítida en pantallas de alta densidad
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.textBaseline = 'alphabetic'
  return { canvas, ctx }
}

function drawHeader(ctx, H, logo, title) {
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = C.dark
  ctx.fillRect(0, 0, W, 150)
  ctx.fillStyle = C.brand
  ctx.fillRect(0, 150, W, 8)
  if (logo) ctx.drawImage(logo, PAD, 42, 176, 65)
  font(ctx, 30, 700)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'right'
  ctx.fillText(title, W - PAD, 76)
  font(ctx, 20)
  ctx.fillStyle = '#c9c6be'
  ctx.fillText(`WEST IA · ${date(new Date().toISOString().slice(0, 10))}`, W - PAD, 108)
  ctx.textAlign = 'left'
}

/** Placa estilo chileno: blanca con borde negro. Devuelve su ancho. */
function drawPlate(ctx, plate, y) {
  const plateText = plate.replace('-', ' · ')
  font(ctx, 64, 800)
  const pw = ctx.measureText(plateText).width + 60
  roundRect(ctx, PAD, y, pw, 108, 14, '#ffffff', C.ink)
  ctx.fillStyle = C.ink
  ctx.fillText(plateText, PAD + 30, y + 70)
  font(ctx, 16, 700)
  ctx.fillStyle = C.muted
  ctx.textAlign = 'center'
  ctx.fillText('C H I L E', PAD + pw / 2, y + 95)
  ctx.textAlign = 'left'
  return pw
}

function footer(ctx, H, source) {
  font(ctx, 18)
  ctx.fillStyle = C.muted
  ctx.fillText(`Generado con WEST IA · Gestión de flota${source ? ` · ${source}` : ''}`, PAD, H - 44)
}

/**
 * Estado de una OT abierta para enviar al cliente o al taller externo.
 * No muestra montos. ot: fila de getOpenWorkOrders().
 */
export async function renderOrderCard(ot, { source = '' } = {}) {
  await document.fonts?.load?.(`600 40px ${FONT}`).catch(() => {})
  const m = ot.management ?? {}
  const [logo, ...photos] = await Promise.all([loadImage(logoUrl), ...(ot.photos ?? []).slice(0, 4).map(loadImage)])
  const pics = photos.filter(Boolean)

  // medir el texto largo antes de fijar el alto
  const probe = newCanvas(10).ctx
  font(probe, 24)
  const reasonLines = wrap(probe, ot.reason, W - PAD * 2 - 64, 4)
  const noteLines = m.note ? wrap(probe, m.note, W - PAD * 2 - 64, 6) : []
  const actionLines = m.nextAction ? wrap(probe, m.nextAction, W - PAD * 2 - 64, 3) : []
  const photoH = pics.length === 1 ? 460 : pics.length ? Math.ceil(pics.length / 2) * 300 + 20 : 0

  const H =
    200 + 150 + 90 + 220 + (photoH ? photoH + 40 : 0) + 300 +
    120 + reasonLines.length * 34 +
    (noteLines.length ? 90 + noteLines.length * 34 : 0) +
    (actionLines.length ? 90 + actionLines.length * 34 : 0) + 110
  const { canvas, ctx } = newCanvas(H)
  drawHeader(ctx, H, logo, 'Estado de la OT')

  let y = 200
  const pw = drawPlate(ctx, ot.plate, y)
  pill(ctx, PAD + pw + 24, y + 30, `OT ${ot.workOrder}`, '#3b82f6')
  y += 150
  font(ctx, 34, 700)
  ctx.fillStyle = C.ink
  ctx.fillText(wrap(ctx, ot.vehicle || ot.plate, W - PAD * 2, 1)[0] ?? '', PAD, y)
  y += 40
  font(ctx, 22)
  ctx.fillStyle = C.muted
  ctx.fillText(wrap(ctx, [ot.client, ot.branch].filter(Boolean).join(' · '), W - PAD * 2, 1)[0] ?? '', PAD, y)
  y += 50

  // estado real, destacado
  const statusColor = /liberada|cierre/i.test(m.realStatus) ? '#16a34a' : /repuesto|externo|concesionario|seguro|documentos/i.test(m.realStatus) ? '#ea580c' : '#2563eb'
  roundRect(ctx, PAD, y, W - PAD * 2, 190, 24, C.card, C.line)
  ctx.fillStyle = statusColor
  ctx.fillRect(PAD, y + 24, 8, 142)
  font(ctx, 18, 600)
  ctx.fillStyle = C.muted
  ctx.fillText('ESTADO ACTUAL', PAD + 36, y + 46)
  font(ctx, 38, 800)
  ctx.fillStyle = statusColor
  ctx.fillText(wrap(ctx, m.realStatus || 'Pendiente actualizar', W - PAD * 2 - 72, 1)[0], PAD + 36, y + 96)
  font(ctx, 22)
  ctx.fillStyle = C.ink
  ctx.fillText(`${ot.daysOpen === 0 ? 'Ingresó hoy' : `${ot.daysOpen} ${ot.daysOpen === 1 ? 'día' : 'días'} en taller`} · ingreso ${date(ot.receivedDate)}`, PAD + 36, y + 140)
  y += 220

  // fotos (hasta 4)
  if (pics.length === 1) {
    cover(ctx, pics[0], PAD, y, W - PAD * 2, 460, 24)
    y += photoH + 40
  } else if (pics.length) {
    const pwid = (W - PAD * 2 - 20) / 2
    pics.forEach((img, i) => cover(ctx, img, PAD + (i % 2) * (pwid + 20), y + Math.floor(i / 2) * 300, pwid, 280, 20))
    y += photoH + 40
  }

  // datos de la gestión
  const stats = [
    ['Responsable', m.responsible || 'Sin asignar'],
    ['Fecha compromiso', m.commitmentDate ? date(m.commitmentDate) : 'Sin fecha'],
    ['Kilometraje al ingreso', ot.mileage ? km(ot.mileage) : 'Sin registro'],
    ['Bloqueo', m.blocker && m.blocker !== 'Sin definir' ? m.blocker : '—'],
  ]
  const colW = (W - PAD * 2 - 24) / 2
  stats.forEach(([label, value], i) => {
    const x = PAD + (i % 2) * (colW + 24)
    const yy = y + Math.floor(i / 2) * 104
    roundRect(ctx, x, yy, colW, 88, 18, C.card, C.line)
    font(ctx, 18, 600)
    ctx.fillStyle = C.muted
    ctx.fillText(label.toUpperCase(), x + 24, yy + 34)
    font(ctx, 26, 700)
    ctx.fillStyle = C.ink
    ctx.fillText(wrap(ctx, value, colW - 48, 1)[0] ?? '', x + 24, yy + 70)
  })
  y += 230

  const block = (title, lines) => {
    font(ctx, 24, 700)
    ctx.fillStyle = C.ink
    ctx.fillText(title, PAD, y + 24)
    ctx.fillStyle = C.brand
    ctx.fillRect(PAD, y + 38, 70, 5)
    y += 76
    font(ctx, 24)
    ctx.fillStyle = C.ink
    for (const line of lines) {
      ctx.fillText(line, PAD + 4, y)
      y += 34
    }
    y += 24
  }
  block(`Motivo de ingreso · ${ot.interventionType}`, reasonLines)
  if (noteLines.length) block('Observación', noteLines)
  if (actionLines.length) block('Próxima acción', actionLines)

  footer(ctx, H, source)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * v: vehículo de getVehicle(); openOT: OT abiertas del vehículo (getOpenWorkOrders).
 * Devuelve un Blob PNG.
 */
export async function renderVehicleCard(v, openOT = [], { source = '' } = {}) {
  await document.fonts?.load?.(`600 40px ${FONT}`).catch(() => {})
  const current = openOT[0] ?? null
  const photoSrc = current?.photos?.[0]
  const [logo, photo] = await Promise.all([loadImage(logoUrl), photoSrc ? loadImage(photoSrc) : null])
  const recent = v.history.slice(0, 5)

  // alto según el contenido
  const H = 260 + 250 + (photo ? 420 : 0) + (current ? 190 : 0) + 330 + 80 + recent.length * 92 + 120
  const { canvas, ctx } = newCanvas(H)

  drawHeader(ctx, H, logo, 'Ficha del vehículo')

  // ------------------------------------------------------- patente y modelo
  let y = 200
  const pw = drawPlate(ctx, v.plate, y)

  const status = VEHICLE_STATUS[v.status]
  pill(ctx, PAD + pw + 24, y + 30, current ? `En taller · ${current.daysOpen} días` : status?.label ?? v.statusLabel, current ? '#f97316' : status?.color ?? '#94a3b8')

  y += 150
  font(ctx, 36, 700)
  ctx.fillStyle = C.ink
  for (const line of wrap(ctx, `${v.brand} ${v.model}`, W - PAD * 2, 2)) {
    ctx.fillText(line, PAD, y)
    y += 46
  }
  font(ctx, 24)
  ctx.fillStyle = C.muted
  ctx.fillText([v.year, v.categoryLabel, v.fuel, v.area].filter(Boolean).join(' · '), PAD, y)
  y += 50

  // --------------------------------------------------------------- foto
  if (photo) {
    cover(ctx, photo, PAD, y, W - PAD * 2, 380, 24)
    font(ctx, 18, 600)
    roundRect(ctx, PAD + 16, y + 380 - 52, 330, 36, 18, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`Foto de taller · OT ${current.workOrder}`, PAD + 32, y + 380 - 27)
    y += 420
  }

  // ------------------------------------------------------- en taller ahora
  if (current) {
    roundRect(ctx, PAD, y, W - PAD * 2, 160, 24, '#fff4e5', '#f9c784')
    font(ctx, 26, 700)
    ctx.fillStyle = '#9a4d00'
    ctx.fillText(`En taller hace ${current.daysOpen} días · OT ${current.workOrder}`, PAD + 32, y + 50)
    font(ctx, 22)
    ctx.fillStyle = C.ink
    const m = current.management ?? {}
    const lines = wrap(ctx, current.reason, W - PAD * 2 - 64, 1)
    ctx.fillText(lines[0] ?? '', PAD + 32, y + 90)
    ctx.fillStyle = C.muted
    ctx.fillText(wrap(ctx, `${m.realStatus || 'Sin estado real'} · ${m.responsible || 'sin responsable'}${m.commitmentDate ? ` · compromiso ${date(m.commitmentDate)}` : ''}`, W - PAD * 2 - 64, 1)[0], PAD + 32, y + 128)
    y += 190
  }

  // ------------------------------------------------------- datos clave
  const stats = [
    ['Sucursal', v.branch],
    ['Cliente', v.client || 'Sin cliente'],
    ['Kilometraje', v.mileage ? km(v.estMileage ?? v.mileage) + (v.estMileage ? ' (est. hoy)' : '') : 'Sin registro'],
    ['Próxima mantención', !v.mileage ? '—' : v.estDueDate ? `${v.estDaysToMaintenance < 0 ? 'Vencida' : date(v.estDueDate)} · ${km(v.nextMaintenanceKm)}` : v.kmToMaintenance < 0 ? `Vencida · ${km(v.nextMaintenanceKm)}` : km(v.nextMaintenanceKm)],
    ['Gasto acumulado', clp(v.totalCost)],
    ['OT históricas', num(v.history.length)],
  ]
  const colW = (W - PAD * 2 - 24) / 2
  stats.forEach(([label, value], i) => {
    const x = PAD + (i % 2) * (colW + 24)
    const yy = y + Math.floor(i / 2) * 104
    roundRect(ctx, x, yy, colW, 88, 18, C.card, C.line)
    font(ctx, 18, 600)
    ctx.fillStyle = C.muted
    ctx.fillText(label.toUpperCase(), x + 24, yy + 34)
    font(ctx, 26, 700)
    ctx.fillStyle = C.ink
    ctx.fillText(wrap(ctx, value, colW - 48, 1)[0] ?? '', x + 24, yy + 70)
  })
  y += 330

  // ------------------------------------------------- últimas intervenciones
  font(ctx, 26, 700)
  ctx.fillStyle = C.ink
  ctx.fillText('Últimas intervenciones', PAD, y + 20)
  ctx.fillStyle = C.brand
  ctx.fillRect(PAD, y + 36, 80, 5)
  y += 80
  if (!recent.length) {
    font(ctx, 22)
    ctx.fillStyle = C.muted
    ctx.fillText('Sin OT registradas', PAD, y + 20)
  }
  for (const o of recent) {
    const color = INTERVENTION_COLOR[o.interventionType] ?? '#94a3b8'
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(PAD + 8, y + 18, 8, 0, Math.PI * 2)
    ctx.fill()
    font(ctx, 22, 600)
    ctx.fillStyle = C.ink
    const amount = clp(o.totalCost)
    const aw = ctx.measureText(amount).width
    ctx.fillText(wrap(ctx, o.reason, W - PAD * 2 - aw - 70, 1)[0] ?? '', PAD + 32, y + 26)
    ctx.textAlign = 'right'
    ctx.fillText(amount, W - PAD, y + 26)
    ctx.textAlign = 'left'
    font(ctx, 19)
    ctx.fillStyle = C.muted
    ctx.fillText(`${date(o.receivedDate)} · ${o.interventionType} · OT ${o.workOrder}${o.active ? ' · abierta' : ''}`, PAD + 32, y + 58)
    ctx.fillStyle = C.line
    ctx.fillRect(PAD + 32, y + 78, W - PAD * 2 - 32, 2)
    y += 92
  }

  footer(ctx, H, source)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
