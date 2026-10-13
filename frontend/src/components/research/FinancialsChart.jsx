import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtAxisDollars, fmtTooltipDollars } from '../../lib/axisFormat'
import { STATEMENT_SERIES, axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { CHART_SERIES, chartRows } from '../../lib/statements'

export default function FinancialsChart({ periods }) {
  const rows = chartRows(periods)
  if (!rows.length) return null
  const series = CHART_SERIES.filter(({ key }) => rows.some((row) => row[key] != null))

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--fig-2xs)] text-zinc-400">
        {series.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATEMENT_SERIES[key] }} />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-3 h-[var(--chart-h-lg)]" role="img" aria-label="Revenue and profit by period">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" />
            <YAxis {...axisProps} width={56} tickFormatter={fmtAxisDollars} />
            <ReferenceLine y={0} stroke={gridProps.stroke} />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: gridProps.stroke }}
              formatter={(value, name) => [fmtTooltipDollars(value), name]}
            />
            {series.map(({ key, label }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                fill={STATEMENT_SERIES[key]}
                radius={[2, 2, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
