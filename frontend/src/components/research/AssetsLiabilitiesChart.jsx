import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtAxisDollars, fmtTooltipDollars } from '../../lib/axisFormat'
import { HEALTH_SERIES, axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { balanceRows } from '../../lib/financialHealth'
import { Card, CardHeader } from '../ui'

const SERIES = [
  { key: 'current_assets', label: 'Current assets', stackId: 'assets' },
  { key: 'long_term_assets', label: 'Long-term assets', stackId: 'assets' },
  { key: 'current_liabilities', label: 'Current liabilities', stackId: 'liabilities' },
  { key: 'long_term_liabilities', label: 'Long-term liabilities', stackId: 'liabilities' },
]

export default function AssetsLiabilitiesChart({ annual }) {
  const rows = balanceRows(annual)
  if (!rows.length) return null

  return (
    <Card>
      <CardHeader title="Assets against liabilities" subtitle="Short- and long-term, by fiscal year" />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[var(--fig-2xs)] text-zinc-400">
        {SERIES.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: HEALTH_SERIES[key] }} />
            {label}
          </li>
        ))}
      </ul>
      <div
        className="mt-3 h-[var(--chart-h-md)]"
        role="img"
        aria-label="Short- and long-term assets against liabilities by fiscal year"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" />
            <YAxis {...axisProps} width={56} tickFormatter={fmtAxisDollars} />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: gridProps.stroke }}
              formatter={(value, name) => [fmtTooltipDollars(value), name]}
            />
            {SERIES.map(({ key, label, stackId }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId={stackId}
                fill={HEALTH_SERIES[key]}
                maxBarSize={18}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
