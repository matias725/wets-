import { useEffect, useState } from 'react'
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { cx } from '@/lib/format'

const PHONE = '(max-width: 639px)'
function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches)
  useEffect(() => {
    const mq = window.matchMedia(PHONE)
    const sync = () => setPhone(mq.matches)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return phone
}

const headerText = (column) => (typeof column.columnDef.header === 'string' ? column.columnDef.header : '')

/**
 * Tabla con orden y paginación (TanStack Table v8). En el celular cada fila se
 * muestra como tarjeta (sin columnas escondidas a la derecha).
 * Los filtros se aplican antes, en la página, para que los KPIs y la tabla
 * usen exactamente el mismo conjunto de filas.
 */
export function DataTable({ data, columns, onRowClick, pageSize = 12, initialSort = [], emptyText = 'Sin resultados para los filtros aplicados', dense, minWidth = 720 }) {
  const [sorting, setSorting] = useState(initialSort)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })
  // oxlint-disable-next-line react/incompatible-library -- TanStack Table v8; la app no usa React Compiler
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
  })
  const rows = table.getRowModel().rows
  const total = data.length
  const from = total ? pagination.pageIndex * pagination.pageSize + 1 : 0
  const to = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)
  const phone = usePhone()
  const sortable = table.getAllLeafColumns().filter((c) => c.getCanSort() && headerText(c))
  const current = sorting[0]

  return (
    <div>
      {phone ? (
        <div>
          {sortable.length > 1 && (
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-muted">
              <span>Ordenar por</span>
              <select
                value={current?.id ?? ''}
                onChange={(e) => setSorting(e.target.value ? [{ id: e.target.value, desc: current?.desc ?? true }] : [])}
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 text-xs text-fg"
                aria-label="Ordenar por"
              >
                <option value="">Orden original</option>
                {sortable.map((c) => (
                  <option key={c.id} value={c.id}>{headerText(c)}</option>
                ))}
              </select>
              {current && (
                <button type="button" onClick={() => setSorting([{ ...current, desc: !current.desc }])} className="grid size-8 place-items-center rounded-lg border border-line text-fg" aria-label={current.desc ? 'Mayor a menor' : 'Menor a mayor'}>
                  {current.desc ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                </button>
              )}
            </div>
          )}
          <ul>
            {rows.map((row) => {
              const [first, ...rest] = row.getVisibleCells()
              return (
                <li
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cx('border-b border-line px-4 py-3 last:border-0', onRowClick && 'cursor-pointer active:bg-hover')}
                >
                  <div className="min-w-0 text-sm">{flexRender(first.column.columnDef.cell, first.getContext())}</div>
                  {rest.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                      {rest.map((cell) => (
                        <div key={cell.id} className="min-w-0">
                          {headerText(cell.column) && <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">{headerText(cell.column)}</dt>}
                          <dd className="min-w-0 text-[13px] break-words">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>
          {!rows.length && (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-muted">
              <SearchX size={22} className="text-subtle" />
              {emptyText}
            </div>
          )}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  const canSort = h.column.getCanSort()
                  const align = h.column.columnDef.meta?.align === 'right' ? 'text-right' : 'text-left'
                  return (
                    <th key={h.id} className={cx('px-4 py-3 text-[11px] font-medium tracking-wide whitespace-nowrap text-muted uppercase', align)} style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                      {canSort ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={cx('inline-flex items-center gap-1 transition hover:text-fg', align === 'text-right' && 'flex-row-reverse')}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx('border-b border-line transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline-none')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cx('px-4 whitespace-nowrap', dense ? 'py-2' : 'py-3', cell.column.columnDef.meta?.align === 'right' && 'tabular text-right')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-muted">
            <SearchX size={22} className="text-subtle" />
            {emptyText}
          </div>
        )}
      </div>
      )}
      {total > pagination.pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
          <span className="tabular">
            {from}–{to} de {total}
          </span>
          <div className="flex items-center gap-1">
            <PageButton onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} label="Página anterior">
              <ChevronLeft size={16} />
            </PageButton>
            <span className="tabular px-2">
              {pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <PageButton onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} label="Página siguiente">
              <ChevronRight size={16} />
            </PageButton>
          </div>
        </div>
      )}
    </div>
  )
}

function PageButton({ children, label, ...props }) {
  return (
    <button type="button" aria-label={label} className="grid size-8 place-items-center rounded-lg transition hover:bg-hover hover:text-fg disabled:opacity-30" {...props}>
      {children}
    </button>
  )
}
