import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtAxisDollars, fmtTooltipDollars } from '../../lib/axisFormat'
import { axisProps, chartTooltipProps, gridProps, statementSeries } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { CHART_SERIES, chartRows } from '../../lib/statements'

export default function FinancialsChart({ periods }) {
  const c = useChartColors()
  const colors = statementSeries(c)
  const rows = chartRows(periods)
  if (!rows.length) return null
  const series = CHART_SERIES.filter(({ key }) => rows.some((row) => row[key] != null))

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {series.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: colors[key] }} />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-3 h-[var(--chart-h-lg)]" role="img" aria-label="Revenue and profit by period">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="label" />
            <YAxis {...axisProps(c)} width={56} tickFormatter={fmtAxisDollars} />
            <ReferenceLine y={0} stroke={c.axis} />
            <Tooltip
              {...chartTooltipProps(c)}
              cursor={{ fill: gridProps(c).stroke }}
              formatter={(value, name) => [fmtTooltipDollars(value), name]}
            />
            {series.map(({ key, label }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                fill={colors[key]}
                radius={[3, 3, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              >
                {key === 'net_income' &&
                  rows.map((row) => <Cell key={row.label} fill={row[key] < 0 ? c.down : colors[key]} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
