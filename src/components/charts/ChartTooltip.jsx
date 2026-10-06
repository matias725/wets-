// Tooltip de Recharts con el estilo de la app.
export function ChartTooltip({ active, payload, label, formatter = (v) => v, labelFormatter = (l) => l }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-strong min-w-36 rounded-xl px-3 py-2 text-xs">
      {label != null && <div className="mb-1.5 font-medium">{labelFormatter(label)}</div>}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey ?? p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
              {p.name}
            </span>
            <span className="tabular font-medium">{formatter(p.value, p.name)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

