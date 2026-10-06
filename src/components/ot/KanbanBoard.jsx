import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical, User } from 'lucide-react'
import { KANBAN_COLUMNS, PRIORITY_COLOR } from '@/data/catalog'
import { saveManagement } from '@/data/api'
import { Badge, DaysBadge } from '@/components/ui/Badge'
import { cx } from '@/lib/format'

/**
 * Tablero de mantenciones. Arrastrar una tarjeta a otra columna actualiza el
 * "Estado actual real" de la OT (gestión WEST, no SAP).
 */
export function KanbanBoard({ rows, onOpen }) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const draggingRef = useRef(null)

  const drop = (column, e) => {
    // La OT viaja en el propio arrastre (dataTransfer); el ref cubre navegadores
    // que no exponen los datos durante el evento.
    const id = e.dataTransfer?.getData('text/plain') || draggingRef.current
    draggingRef.current = null
    const ot = rows.find((r) => r.workOrder === id)
    setOver(null)
    setDragging(null)
    if (!ot || ot.kanban === column.id) return
    const patch = { realStatus: column.dropStatus }
    if (column.id === 'ready') patch.blocker = 'Sin bloqueo / liberable'
    if (column.id === 'parts') patch.blocker = 'Repuesto'
    saveManagement(ot.workOrder, patch)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((col) => {
        const items = rows.filter((r) => r.kanban === col.id)
        return (
          <section
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(col.id)
            }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              drop(col, e)
            }}
            className={cx('glass flex min-h-[420px] min-w-[200px] flex-1 basis-0 flex-col rounded-2xl transition-colors', over === col.id && 'ring-2 ring-brand/60')}
            aria-label={col.label}
          >
            <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2 rounded-full" style={{ background: col.color }} />
                  {col.label}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted">{col.hint}</div>
              </div>
              <span className="tabular rounded-md bg-[var(--line)] px-2 py-0.5 text-xs font-medium">{items.length}</span>
            </header>
            <div className="flex flex-1 flex-col gap-2 p-2">
              <AnimatePresence initial={false}>
                {items.map((o) => (
                  <motion.article
                    key={o.workOrder}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: dragging === o.workOrder ? 0.4 : 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    draggable
                    onDragStart={(e) => {
                      draggingRef.current = o.workOrder
                      setDragging(o.workOrder)
                      e.dataTransfer.setData('text/plain', o.workOrder)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    onClick={() => onOpen(o)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(o)}
                    tabIndex={0}
                    className="group cursor-grab rounded-xl border border-[var(--glass-border)] bg-[var(--glass)] p-3 transition-colors hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{o.plate}</div>
                        <div className="truncate text-[11px] text-muted">{o.vehicle}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <DaysBadge days={o.daysOpen} />
                        <GripVertical size={14} className="text-subtle opacity-0 transition group-hover:opacity-100" />
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted">{o.reason}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge color={PRIORITY_COLOR[o.management.priority]}>{o.management.priority}</Badge>
                      <span className="truncate text-[11px] text-subtle">{o.branch}</span>
                    </div>
                    {o.management.responsible && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[11px] text-muted">
                        <User size={12} /> {o.management.responsible}
                      </div>
                    )}
                  </motion.article>
                ))}
              </AnimatePresence>
              {!items.length && <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line text-xs text-subtle">Arrastre una OT aquí</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
