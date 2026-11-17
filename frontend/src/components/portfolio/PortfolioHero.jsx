import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useNetWorthHistory, useTransactions } from '../../api/queries'
import { chartTooltipProps, dateAxisProps, formatAxisDate, gridProps, moneyAxisProps, seriesAxis } from '../../lib/charts'
import { chartPlaceholderFor } from '../../lib/chartState'
import { fmtDate, fmtEur, fmtPct } from '../../lib/format'
import { dayChange, tradeMarkers } from '../../lib/portfolioHero'
import { useChartColors } from '../../theme/useChartColors'
import { RangePills } from '../RangePills'

const KIND_WORD = { buy: 'Bought', sell: 'Sold' }

function Change({ amount, pct, suffix }) {
  if (amount == null) return null
  const n = Number(amount)
  const tone = n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-ink-2'
  const arrow = n > 0 ? '▲' : n < 0 ? '▼' : ''
  const share = pct == null ? '' : ` (${fmtPct(Math.abs(Number(pct)), { sign: false, decimals: 1 })})`
  return (
    <span className={`font-semibold ${tone}`}>
      {`${arrow} ${fmtEur(Math.abs(n), { decimals: 0 })} ${suffix}${share}`.trim()}
    </span>
  )
}

function HeroTooltip({ active, payload, markers, c }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const trades = markers.filter((marker) => marker.date === String(row.date).slice(0, 10))
  const style = chartTooltipProps(c).contentStyle
  return (
    <div style={{ ...style, color: c.tooltip.text }} className="num">
      <div className="font-semibold">{fmtDate(row.date)}</div>
      <div>{fmtEur(row.portfolio_value)}</div>
      {trades.map((trade) => (
        <div key={trade.kind} className="text-ink-2">{`${KIND_WORD[trade.kind]} ${trade.tickers.join(', ')}`}</div>
      ))}
    </div>
  )
}

function Legend({ hasBuy, hasSell }) {
  if (!hasBuy && !hasSell) return null
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
      {hasBuy ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-up" />
          Buy
        </span>
      ) : null}
      {hasSell ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-pane" />
          Sale: money taken out, not a loss
        </span>
      ) : null}
    </div>
  )
}

export default function PortfolioHero({ summary, positions, quotes, holdingsCount, right }) {
  const c = useChartColors()
  const [range, setRange] = useState('6M')
  const history = useNetWorthHistory(range)
  const transactions = useTransactions()
  const data = useMemo(
    () =>
      (history.data ?? [])
        .filter((row) => row.portfolio_value != null)
        .map((row) => ({ ...row, portfolio_value: Number(row.portfolio_value) })),
    [history.data],
  )
  const markers = useMemo(() => tradeMarkers(data, transactions.data), [data, transactions.data])
  const day = dayChange(positions, quotes)
  const placeholder = chartPlaceholderFor({ isLoading: history.isLoading, error: history.error, data, minPoints: 2, onRetry: history.refetch })
  const label = holdingsCount == null ? 'Your portfolio' : `Your portfolio · ${holdingsCount} holding${holdingsCount === 1 ? '' : 's'} at Saxo`

  return (
    <section aria-label="Your portfolio" data-testid="portfolio-hero" className="sd-panel bg-pane rounded-2xl p-4 md:p-6 flex flex-col gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2 min-w-0">
          <span className="text-[14px] font-semibold text-ink-2">{label}</span>
          <span data-testid="portfolio-value" className="text-[36px] md:text-[52px] leading-none font-bold tracking-tight text-ink num">
            {fmtEur(summary.total_value)}
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] num">
            {day ? <Change amount={day.amount} pct={day.pct} suffix="today" /> : null}
            <Change amount={summary.total_pnl} pct={summary.total_pnl_pct} suffix="since purchase" />
            {summary.total_cost == null ? null : <span className="text-ink-3">{`${fmtEur(summary.total_cost, { decimals: 0 })} invested`}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {right}
          <RangePills value={range} onChange={setRange} />
        </div>
      </div>
      <div className="h-[220px] md:h-[300px]" data-testid="portfolio-history">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="portfolioHeroFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps(c)} />
              <XAxis {...dateAxisProps(c)} tickFormatter={formatAxisDate} minTickGap={56} interval="preserveStartEnd" />
              <YAxis {...moneyAxisProps(c)} {...seriesAxis(data, ['portfolio_value'])} />
              <Tooltip cursor={{ stroke: c.crosshair, strokeDasharray: '3 3' }} content={<HeroTooltip markers={markers} c={c} />} />
              <Area
                type="monotone"
                dataKey="portfolio_value"
                name="Portfolio"
                stroke={c.primary}
                strokeWidth={2.5}
                fill="url(#portfolioHeroFill)"
                dot={false}
                activeDot={{ r: 4, fill: c.primary, stroke: c.tooltip.bg, strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {markers.map((marker) => (
                <ReferenceDot
                  key={`${marker.date}:${marker.kind}`}
                  x={marker.date}
                  y={marker.value}
                  r={5}
                  fill={marker.kind === 'buy' ? c.up : c.tooltip.bg}
                  stroke={marker.kind === 'buy' ? c.tooltip.bg : c.ink}
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <Legend hasBuy={markers.some((m) => m.kind === 'buy')} hasSell={markers.some((m) => m.kind === 'sell')} />
    </section>
  )
}
