// Gráfico que el Analista IA pide mostrar (herramienta mostrar_grafico).
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { axisProps } from '@/lib/chart'
import { clp, clpShort, km, num } from '@/lib/format'

const COLORS = ['#ffc400', '#3b82f6', '#22c55e', '#f472b6', '#a78bfa', '#f97316', '#2dd4bf', '#94a3b8']

const FORMAT = {
  clp: { full: clp, short: clpShort },
  numero: { full: num, short: num },
  porcentaje: { full: (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')}%`, short: (v) => `${Math.round(v)}%` },
  dias: { full: (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} días`, short: (v) => `${Math.round(v)} d` },
  km: { full: km, short: (v) => `${num(v / 1000)}k` },
}

export function AiChart({ chart }) {
  const fmt = FORMAT[chart.formato] ?? FORMAT.numero
  const series = chart.series.slice(0, 6)
  const data = chart.etiquetas.map((label, i) => Object.fromEntries([['label', label], ...series.map((s) => [s.nombre, Number(s.valores[i]) || 0])]))
  const horizontal = chart.tipo === 'barras_horizontales'
  const height = horizontal ? Math.max(220, data.length * 30 + 60) : 280
  const tooltip = <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip formatter={(v) => fmt.full(v)} />} />
  const legend = series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />

  let body
  if (chart.tipo === 'torta') {
    const s = series[0]
    const pie = chart.etiquetas.map((label, i) => ({ name: label, value: Number(s.valores[i]) || 0 }))
    body = (
      <PieChart>
        <Pie data={pie} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%" paddingAngle={2} stroke="none">
          {pie.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip formatter={(v) => fmt.full(v)} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    )
  } else if (chart.tipo === 'lineas') {
    body = (
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={fmt.short} width={64} />
        {tooltip}
        {legend}
        {series.map((s, i) => (
          <Line key={s.nombre} type="monotone" dataKey={s.nombre} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    )
  } else {
    body = (
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} tickFormatter={fmt.short} />
            <YAxis type="category" dataKey="label" {...axisProps} width={150} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={fmt.short} width={64} />
          </>
        )}
        {tooltip}
        {legend}
        {series.map((s, i) => (
          <Bar key={s.nombre} dataKey={s.nombre} fill={COLORS[i % COLORS.length]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    )
  }

  return (
    <figure className="rounded-xl border border-line p-3">
      <figcaption className="mb-2 text-xs font-semibold">{chart.titulo}</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {body}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
