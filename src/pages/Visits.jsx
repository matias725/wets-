import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, Lock, MapPin, Plus, User } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useData } from '@/hooks/useData'
import {
  ALL_BRANCHES, BRANCHES, TODAY, addStalledWithoutOT, branchName, closeVisit, compareWithPrevious, createVisit,
  getOpenWorkOrders, getStalledWithoutOT, getVisits, iso, setVisitItemReviewed,
} from '@/data/api'
import { CURRENT_USER } from '@/data/people'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { PageHeader } from '@/components/ui/misc'
import { cx, date, downloadCSV } from '@/lib/format'

const RESULT_COLOR = { NUEVA: '#3b82f6', 'CONTINÚA': '#f59e0b', LIBERADA: '#22c55e' }

function NewVisitModal({ open, onClose, onCreated }) {
  return (
    <Modal open={open} onClose={onClose} title="Nueva visita a sucursal" subtitle="Se tomará una fotografía de las OT abiertas actuales. No modifica SAP.">
      <NewVisitForm onClose={onClose} onCreated={onCreated} />
    </Modal>
  )
}

// Se monta cada vez que se abre el modal, así el formulario parte limpio.
function NewVisitForm({ onClose, onCreated }) {
  const { branchId } = useApp()
  const openByBranch = useData(() => {
    const counts = {}
    getOpenWorkOrders(ALL_BRANCHES).forEach((o) => (counts[o.branchId] = (counts[o.branchId] || 0) + 1))
    return counts
  })
  const [form, setForm] = useState(() => ({
    branchId: branchId !== ALL_BRANCHES ? branchId : 'calama',
    date: iso(TODAY),
    visitor: CURRENT_USER.name,
    notes: '',
  }))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    const visit = createVisit(form)
    onCreated(visit)
    onClose()
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sucursal / taller" id="v-branch" className="sm:col-span-2">
          <Select id="v-branch" value={form.branchId} onChange={set('branchId')} options={BRANCHES.map((b) => ({ value: b.id, label: `${b.name} · ${openByBranch[b.id] || 0} OT abiertas` }))} />
        </Field>
        <Field label="Fecha" id="v-date">
          <Input id="v-date" type="date" value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Responsable de la visita" id="v-visitor">
          <Input id="v-visitor" value={form.visitor} onChange={set('visitor')} />
        </Field>
        <Field label="Notas" id="v-notes" className="sm:col-span-2">
          <Textarea id="v-notes" value={form.notes} onChange={set('notes')} placeholder="Objetivo de la visita, acuerdos previos…" />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={submit} disabled={!form.branchId || !form.date}>
          Crear visita
        </Button>
      </div>
    </>
  )
}

function StalledModal({ open, onClose, visit }) {
  const [form, setForm] = useState({ plate: '', reason: '', responsible: '', commitmentDate: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    const plate = form.plate.trim().toUpperCase()
    if (!/^[A-Z]{4}-?\d{2}$/.test(plate)) return setError('Ingrese una patente con formato ABCD-12.')
    const normalized = plate.includes('-') ? plate : `${plate.slice(0, 4)}-${plate.slice(4)}`
    const open = getOpenWorkOrders(ALL_BRANCHES).find((o) => o.plate === normalized)
    if (open) return setError(`${normalized} ya tiene la OT ${open.workOrder} abierta: gestiónela desde Control OT.`)
    addStalledWithoutOT({ ...form, plate: normalized, branchId: visit.branchId, detectedAt: iso(TODAY), visitId: visit.id })
    setForm({ plate: '', reason: '', responsible: '', commitmentDate: '' })
    setError('')
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unidad detenida sin OT en SAP"
      subtitle="Excepción operacional: debe regularizarse creando la OT oficial en SAP."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>Registrar excepción</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Patente" id="s-plate"><Input id="s-plate" value={form.plate} onChange={set('plate')} placeholder="ABCD-12" /></Field>
        <Field label="Motivo de detención" id="s-reason"><Input id="s-reason" value={form.reason} onChange={set('reason')} /></Field>
        <Field label="Responsable de regularizar" id="s-resp"><Input id="s-resp" value={form.responsible} onChange={set('responsible')} /></Field>
        <Field label="Compromiso de creación de OT" id="s-commit"><Input id="s-commit" type="date" value={form.commitmentDate} onChange={set('commitmentDate')} /></Field>
        {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

function VisitDetail({ visit }) {
  const { previous, released } = useMemo(() => compareWithPrevious(visit), [visit])
  const stalled = useData(() => getStalledWithoutOT(visit.id), [visit.id])
  const [reporting, setReporting] = useState(false)
  const items = visit.items
  const isOpen = visit.status === 'Abierta'
  const stats = [
    ['Detenidas', items.length, '#f59e0b'],
    ['Visita anterior', previous?.items.length ?? 0, '#94a3b8'],
    ['Liberadas', released.length, '#22c55e'],
    ['Continúan', items.filter((i) => i.result === 'CONTINÚA').length, '#f97316'],
    ['Nuevas', items.filter((i) => i.result === 'NUEVA').length, '#3b82f6'],
    ['Sin OT SAP', stalled.filter((s) => s.status === 'Pendiente').length, '#ef4444'],
  ]

  const exportCSV = () =>
    downloadCSV(`west-visita-${branchName(visit.branchId).replace(/\W+/g, '-')}-${visit.date}.csv`, [...items, ...released.map((r) => ({ ...r, result: 'LIBERADA' }))], [
      { label: 'Resultado vs anterior', value: 'result' },
      { label: 'Revisada', value: (i) => (i.reviewed ? 'Sí' : 'No') },
      { label: 'Patente', value: 'plate' },
      { label: 'N° OT', value: 'workOrder' },
      { label: 'Días', value: 'daysOpen' },
      { label: 'Estado real', value: 'realStatus' },
      { label: 'Responsable', value: 'responsible' },
    ])

  return (
    <Card key={visit.id} delay={0.05}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{branchName(visit.branchId)}</h2>
            <Badge color={isOpen ? '#22c55e' : '#94a3b8'}>{visit.status}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {date(visit.date)} · {visit.visitor} · {previous ? `Visita anterior: ${date(previous.date)}` : 'Primera visita registrada'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setReporting(true)}>
            <AlertTriangle size={14} /> Detenida sin OT
          </Button>
          <Button size="sm" onClick={exportCSV}>
            <Download size={14} /> CSV
          </Button>
          {isOpen && (
            <Button size="sm" variant="primary" onClick={() => closeVisit(visit.id)}>
              <Lock size={14} /> Cerrar visita
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 pt-4 sm:grid-cols-6">
        {stats.map(([label, value, color]) => (
          <div key={label} className="rounded-xl bg-[var(--line)] px-3 py-2.5">
            <div className="truncate text-[11px] text-muted">{label}</div>
            <div className="tabular mt-0.5 text-xl font-semibold" style={{ color: value ? color : undefined }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-y border-line text-[11px] tracking-wide text-muted uppercase">
              <th className="px-5 py-2.5 text-left font-medium">Rev.</th>
              <th className="px-3 py-2.5 text-left font-medium">Vs anterior</th>
              <th className="px-3 py-2.5 text-left font-medium">Patente</th>
              <th className="px-3 py-2.5 text-left font-medium">N° OT</th>
              <th className="px-3 py-2.5 text-right font-medium">Días</th>
              <th className="px-3 py-2.5 text-left font-medium">Estado real</th>
              <th className="px-3 py-2.5 text-left font-medium">Responsable</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.workOrder} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">
                  <input
                    type="checkbox"
                    checked={Boolean(i.reviewed)}
                    disabled={!isOpen}
                    onChange={(e) => setVisitItemReviewed(visit.id, i.workOrder, e.target.checked)}
                    className="size-4 cursor-pointer accent-[#ffc400] disabled:cursor-default"
                    aria-label={`Marcar ${i.plate} como revisada`}
                  />
                </td>
                <td className="px-3 py-2.5"><Badge color={RESULT_COLOR[i.result]}>{i.result}</Badge></td>
                <td className="px-3 py-2.5 font-medium">{i.plate}</td>
                <td className="tabular px-3 py-2.5 text-muted">{i.workOrder}</td>
                <td className="px-3 py-2.5 text-right"><DaysBadge days={i.daysOpen} /></td>
                <td className="px-3 py-2.5 text-muted">{i.realStatus}</td>
                <td className="px-3 py-2.5">{i.responsible || <span className="text-subtle">—</span>}</td>
              </tr>
            ))}
            {released.map((i) => (
              <tr key={`rel-${i.workOrder}`} className="border-b border-line opacity-70 last:border-0">
                <td className="px-5 py-2.5"><CheckCircle2 size={16} className="text-emerald-400" /></td>
                <td className="px-3 py-2.5"><Badge color={RESULT_COLOR.LIBERADA}>LIBERADA</Badge></td>
                <td className="px-3 py-2.5 font-medium">{i.plate}</td>
                <td className="tabular px-3 py-2.5 text-muted">{i.workOrder}</td>
                <td className="px-3 py-2.5 text-right text-muted">—</td>
                <td className="px-3 py-2.5 text-muted">Ya no figura abierta en SAP</td>
                <td className="px-3 py-2.5">{i.responsible || '—'}</td>
              </tr>
            ))}
            {!items.length && !released.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted">La sucursal no tenía unidades detenidas en esta visita</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {stalled.length > 0 && (
        <div className="m-5 rounded-xl border border-red-500/25 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle size={16} /> Unidades detenidas sin OT en SAP
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {stalled.map((s) => (
              <li key={s.id}>
                <b className="text-fg">{s.plate}</b> · {s.reason || 'Sin motivo'} · {s.responsible || 'sin responsable'} · compromiso {date(s.commitmentDate)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {visit.notes && <p className="px-5 pb-5 text-xs text-muted">Notas: {visit.notes}</p>}
      <StalledModal open={reporting} onClose={() => setReporting(false)} visit={visit} />
    </Card>
  )
}

export default function Visits() {
  const visits = useData((b) => getVisits(b))
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const selected = visits.find((v) => v.id === selectedId) ?? visits[0]

  return (
    <>
      <PageHeader
        title="Visitas a sucursal"
        description="Seguimiento de flota detenida · visita anterior contra visita actual"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Nueva visita
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Historial de visitas" subtitle={`${visits.length} registradas`} icon={MapPin} />
          <ul className="space-y-1 px-3 pb-3">
            {visits.map((v, i) => (
              <motion.li key={v.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <button
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={cx('w-full rounded-xl px-3 py-2.5 text-left transition', selected?.id === v.id ? 'bg-brand/12 ring-1 ring-brand/50' : 'hover:bg-hover')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{branchName(v.branchId)}</span>
                    <Badge color={v.status === 'Abierta' ? '#22c55e' : '#94a3b8'}>{v.status}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1"><CalendarDays size={12} /> {date(v.date)}</span>
                    <span className="flex items-center gap-1"><User size={12} /> {v.items.length} detenidas</span>
                  </div>
                </button>
              </motion.li>
            ))}
            {!visits.length && <li className="px-3 py-8 text-center text-sm text-muted">Sin visitas para esta sucursal</li>}
          </ul>
        </Card>
        {selected ? (
          <VisitDetail visit={selected} />
        ) : (
          <Card className="grid place-items-center p-16 text-center text-sm text-muted">Cree la primera visita con “Nueva visita”.</Card>
        )}
      </div>
      <NewVisitModal open={creating} onClose={() => setCreating(false)} onCreated={(v) => setSelectedId(v.id)} />
    </>
  )
}
