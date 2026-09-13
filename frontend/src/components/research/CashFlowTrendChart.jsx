import { Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, gridProps, chartTooltipProps } from '../../lib/charts'
import { fmtCompact } from '../../lib/format'
import { Card, CardHeader, InfoTip } from '../ui'

// cash_flow_trend values are raw dollars from Finnhub's reported-financials
// endpoint, unlike the rest of the fundamentals payload (already in
// millions) - fmtCompact expects millions, so every value here is divided
// down first.
const toMillions = (v) => (v == null ? null : v / 1e6)
const axisFormat = (v) => fmtCompact(toMillions(v))

/** Annual free cash flow, total debt and cash, from SEC 10-K filings -
 *  the one place on the page with real dollar figures rather than ratios.
 *  `null` for a year missing every one of the three. */
export default function CashFlowTrendChart({ trend }) {
  if (!trend?.length) return null

  return (
    <Card>
      <CardHeader
        title="Cash generation & balance sheet"
        subtitle="Annual free cash flow, debt and cash, from SEC 10-K filings"
        right={
          <InfoTip>
            Free cash flow is operating cash flow minus capex. Debt sums whichever of
            commercial paper, current and non-current long-term debt the filing reports.
            US-GAAP filers only - a foreign filer on Form 20-F won't have this section.
          </InfoTip>
        }
      />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="period" tickFormatter={(v) => v.slice(0, 4)} />
            <YAxis {...axisProps} width={48} tickFormatter={axisFormat} />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              formatter={(value, name) => [axisFormat(value), name]}
            />
            <Bar dataKey="fcf" name="Free cash flow" fill="#34d399" radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false} />
            <Bar dataKey="cash" name="Cash" fill="#60a5fa" radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false} />
            <Line dataKey="debt" name="Total debt" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
