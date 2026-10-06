import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Save } from 'lucide-react'
import { BLOCKERS, INTERVENTION_COLOR, PRIORITIES, REAL_STATUS } from '@/data/catalog'
import { responsiblesFor, saveManagement } from '@/data/api'
import { Drawer } from '@/components/ui/Overlay'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/misc'
import { clp, date, km } from '@/lib/format'

/** Panel lateral de gestión WEST de una OT abierta (no modifica SAP). */
export function ManagementDrawer({ ot: incoming, onClose, onSaved }) {
  // Se conserva la última OT mostrada para que el panel se anime al cerrarse.
  const [ot, setOt] = useState(null)
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  if (incoming && incoming !== ot) {
    setOt(incoming)
    setForm({ ...incoming.management })
    setSaved(false)
  }

  if (!ot || !form) return null
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const responsibles = responsiblesFor(ot.branchId)
  const save = () => {
    saveManagement(ot.workOrder, form)
    setSaved(true)
    onSaved?.()
    setTimeout(onClose, 450)
  }

  return (
    <Drawer
      open={Boolean(incoming)}
      onClose={onClose}
      title={`${ot.plate} · OT ${ot.workOrder}`}
      subtitle={`${ot.vehicle} · ${ot.branch}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            <Save size={16} /> {saved ? 'Guardado' : 'Guardar gestión'}
          </Button>
        </>
      }
    >
      <div className="glass grid grid-cols-2 gap-4 rounded-xl p-4">
        <Stat label="Días detenida" value={<DaysBadge days={ot.daysOpen} />} />
        <Stat label="Estado SAP" value={ot.sapStatus} />
        <Stat label="Ingreso" value={date(ot.receivedDate)} />
        <Stat label="Kilometraje" value={km(ot.mileage)} />
        <Stat label="Cliente" value={ot.client} />
        <Stat label="Costo OT" value={clp(ot.totalCost)} />
        <div className="col-span-2">
          <div className="text-[11px] font-medium tracking-wide text-muted uppercase">Motivo</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <Badge color={INTERVENTION_COLOR[ot.interventionType]}>{ot.interventionType}</Badge>
            {ot.reason}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Estado actual real" id="real" className="sm:col-span-2">
          <Select id="real" value={form.realStatus} onChange={set('realStatus')} options={REAL_STATUS} />
        </Field>
        <Field label="Responsable" id="resp">
          <Select id="resp" value={form.responsible} onChange={set('responsible')} options={[{ value: '', label: 'Sin responsable' }, ...responsibles]} />
        </Field>
        <Field label="Fecha compromiso" id="commit">
          <Input id="commit" type="date" value={form.commitmentDate} onChange={set('commitmentDate')} />
        </Field>
        <Field label="Prioridad operacional" id="prio">
          <Select id="prio" value={form.priority} onChange={set('priority')} options={PRIORITIES} />
        </Field>
        <Field label="Bloqueo actual" id="block">
          <Select id="block" value={form.blocker} onChange={set('blocker')} options={BLOCKERS} />
        </Field>
        <Field label="Próxima acción" id="next" className="sm:col-span-2">
          <Input id="next" value={form.nextAction} onChange={set('nextAction')} placeholder="Ej.: Confirmar llegada de repuesto con proveedor" />
        </Field>
        <Field label="Observación / gestión" id="note" className="sm:col-span-2">
          <Textarea id="note" value={form.note} onChange={set('note')} placeholder="Detalle de la gestión realizada" />
        </Field>
      </div>

      <p className="mt-4 text-xs text-muted">La gestión queda registrada en WEST IA. SAP sigue siendo la fuente oficial de la OT.</p>
      <Link to={`/flota/${ot.plate}`} onClick={onClose} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">
        Ver expediente del vehículo <ArrowRight size={14} />
      </Link>
    </Drawer>
  )
}
