import { useState } from 'react'
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { cx } from '@/lib/format'

/**
 * Tabla con orden y paginación (TanStack Table v8).
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

  return (
    <div>
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
