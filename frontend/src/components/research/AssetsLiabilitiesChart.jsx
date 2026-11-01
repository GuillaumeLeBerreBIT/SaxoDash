import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtAxisDollars, fmtTooltipDollars } from '../../lib/axisFormat'
import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { balanceRows } from '../../lib/financialHealth'
import { Card } from '../ui'

const SERIES = [
  { key: 'current_assets', label: 'Current assets', stackId: 'assets', slot: 0 },
  { key: 'long_term_assets', label: 'Long-term assets', stackId: 'assets', slot: 6 },
  { key: 'current_liabilities', label: 'Current liabilities', stackId: 'liabilities', slot: 1 },
  { key: 'long_term_liabilities', label: 'Long-term liabilities', stackId: 'liabilities', slot: 7 },
]

export default function AssetsLiabilitiesChart({ annual, className = '' }) {
  const c = useChartColors()
  const rows = balanceRows(annual)
  if (!rows.length) return null

  return (
    <Card className={className} context="Short- and long-term, by fiscal year" dot="ok" title="Assets against liabilities">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {SERIES.map(({ key, label, slot }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: c.series[slot] }} />
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
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="label" />
            <YAxis {...axisProps(c)} width={56} tickFormatter={fmtAxisDollars} />
            <Tooltip
              {...chartTooltipProps(c)}
              cursor={{ fill: gridProps(c).stroke }}
              formatter={(value, name) => [fmtTooltipDollars(value), name]}
            />
            {SERIES.map(({ key, label, stackId, slot }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId={stackId}
                fill={c.series[slot]}
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
