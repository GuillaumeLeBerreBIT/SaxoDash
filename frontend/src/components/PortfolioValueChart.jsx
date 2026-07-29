import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getNetWorthHistory } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, formatAxisDate } from '../lib/charts'
import { RangePills } from './RangePills'
import { Card, CardHeader } from './ui'

export default function PortfolioValueChart() {
  const [range, setRange] = useState('6M')
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getNetWorthHistory(range)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load portfolio history')
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (error) {
    return (
      <Card>
        <div className="text-red-400 text-sm">{error}</div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Portfolio value"
        subtitle="Investment value over time"
        right={<RangePills value={range} onChange={setRange} />}
      />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v) => fmtEur(v, { decimals: 0 })}
            />
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v) => [fmtEur(v), 'Portfolio']} />
            <Area
              type="monotone"
              dataKey="portfolio_value"
              name="Portfolio"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#portfolioFill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
