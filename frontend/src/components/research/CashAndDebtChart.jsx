import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtAxisDollars, fmtTooltipDollars } from '../../lib/axisFormat'
import { HEALTH_SERIES, axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { cashAndDebtRows } from '../../lib/financialHealth'
import { Card, CardHeader, InfoTip } from '../ui'

const SERIES = [
  { key: 'free_cash_flow', label: 'Free cash flow', kind: 'bar' },
  { key: 'cash', label: 'Cash', kind: 'bar' },
  { key: 'total_debt', label: 'Total debt', kind: 'line' },
]

export default function CashAndDebtChart({ annual }) {
  const rows = cashAndDebtRows(annual)
  if (!rows.length) return null
  const series = SERIES.filter(({ key }) => rows.some((row) => row[key] != null))
  const title = 'Free cash flow, cash and total debt by fiscal year'

  return (
    <Card>
      <CardHeader
        title="Cash and debt"
        subtitle={title}
        right={
          <InfoTip>
            Free cash flow is operating cash flow minus capital expenditure. Total debt sums commercial paper and
            current and non-current long-term debt, where the filing reports them.
          </InfoTip>
        }
      />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[var(--fig-2xs)] text-zinc-400">
        {series.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: HEALTH_SERIES[key] }} />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-3 h-[var(--chart-h-md)]" role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" />
            <YAxis {...axisProps} width={56} tickFormatter={fmtAxisDollars} />
            <ReferenceLine y={0} stroke={gridProps.stroke} />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: gridProps.stroke }}
              formatter={(value, name) => [fmtTooltipDollars(value), name]}
            />
            {series.map(({ key, label, kind }) =>
              kind === 'bar' ? (
                <Bar
                  key={key}
                  dataKey={key}
                  name={label}
                  fill={HEALTH_SERIES[key]}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={14}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={key}
                  dataKey={key}
                  name={label}
                  stroke={HEALTH_SERIES[key]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
