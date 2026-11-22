import { Link } from 'react-router-dom'

import { fmtEur, fmtPct } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { actionLabel } from '../../lib/verdicts'
import { Card, InstrumentLogo } from '../ui'
import UpcomingEarnings from './UpcomingEarnings'
import ChartLink from '../ChartLink'

const WORD_TONE = { warn: 'text-warn', up: 'text-up' }
const hrefFor = (item) => researchHref(item.ticker, item.kind === 'earnings' ? 'earnings' : 'overview', { uic: item.uic, assetType: 'Stock' })
const TODAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

function Change({ amount, pct, suffix }) {
  if (amount == null) return null
  const n = Number(amount)
  const tone = n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-ink-2'
  const arrow = n > 0 ? '▲' : n < 0 ? '▼' : ''
  const share = pct == null ? '' : ` (${fmtPct(Math.abs(Number(pct)), { sign: false, decimals: 1 })})`
  return <span className={`font-semibold ${tone}`}>{`${arrow} ${fmtEur(Math.abs(n), { decimals: 0 })} ${suffix}${share}`.trim()}</span>
}

export function BriefHero({ headline, summary, day, today = new Date(), className = '' }) {
  return (
    <section aria-label="Today" data-testid="brief-hero" className={`flex flex-col gap-3 py-2 md:py-4 ${className}`}>
      <span className="text-[14px] font-medium text-ink-2">{TODAY.format(today)}</span>
      <p data-testid="brief-headline" className="max-w-[760px] text-[26px] font-bold leading-tight tracking-tight text-ink md:text-[34px] [text-wrap:balance]">
        {headline}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 num">
        <span className="text-[32px] font-bold tracking-tight text-ink md:text-[44px]">{fmtEur(summary.total_value)}</span>
        {day ? <Change amount={day.amount} pct={day.pct} suffix="today" /> : null}
        <Change amount={summary.total_pnl} pct={summary.total_pnl_pct} suffix="since purchase" />
      </div>
    </section>
  )
}

export function BriefList({ items, className = '' }) {
  return (
    <Card className={className} title="What to look at">
      {items.length === 0 ? (
        <p className="text-[14px] text-ink-2">Every holding is inside your cap and passes its checks. Nothing to do today.</p>
      ) : (
        <ul data-testid="brief-items">
          {items.map((item) => (
            <li key={`${item.kind}:${item.ticker}`} className="flex gap-3.5 border-t border-line py-4 first:border-t-0 first:pt-1">
              <InstrumentLogo symbol={item.ticker} size={36} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <h3 className="text-[15px] font-bold text-ink">
                    <Link to={hrefFor(item)} className="hover:underline">{item.title}</Link>
                  </h3>
                  {item.word ? <span className={`text-[13px] font-semibold ${WORD_TONE[item.tone] ?? 'text-ink-2'}`}>{item.word}</span> : null}
                </div>
                <p className="max-w-[640px] text-[14px] leading-relaxed text-ink-2">{item.body}</p>
              </div>
              <ChartLink size="lg" symbol={item.ticker} instrument={{ uic: item.uic, assetType: 'Stock' }} className="self-center" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function HoldingsList({ positions, verdictOf, quotes, upcomingEarnings, className = '' }) {
  return (
    <Card
      className={className}
      title="Your holdings"
      right={<Link to="/portfolio" className="text-[13px] font-semibold text-ink-2 hover:text-ink">Portfolio →</Link>}
    >
      <ul className="flex flex-col">
        {positions.map((position) => {
          const verdict = verdictOf(position)
          const change = quotes.get(position.uic)?.change_pct
          return (
            <li key={position.uic ?? position.ticker} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-t border-line py-2.5 first:border-t-0 num">
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-bold text-ink">{position.ticker}</span>
                {verdict ? <span className={`truncate text-[12px] font-semibold ${verdict.action === 'sell_review' || verdict.action === 'trim' ? 'text-warn' : 'text-ink-3'}`}>{actionLabel(verdict)}</span> : null}
              </span>
              <span className="text-[14px] text-ink">{fmtEur(position.value, { decimals: 0 })}</span>
              <span className={`w-16 text-right text-[13px] ${change == null ? 'text-ink-3' : change >= 0 ? 'text-up' : 'text-down'}`}>
                {change == null ? '—' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`}
              </span>
              <ChartLink size="lg" symbol={position.ticker} instrument={{ uic: position.uic, assetType: position.asset_type }} />
            </li>
          )
        })}
      </ul>
      {upcomingEarnings != null ? (
        <div className="mt-4 border-t border-line pt-3">
          <UpcomingEarnings items={upcomingEarnings} />
        </div>
      ) : null}
    </Card>
  )
}
