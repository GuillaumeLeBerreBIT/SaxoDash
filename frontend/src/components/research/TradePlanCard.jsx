import { daysUntil } from '../../lib/earnings'
import { fmtDate, fmtEur, fmtMoney, fmtPct } from '../../lib/format'
import { ATR_PERIOD, RISK_CHOICES, STOP_ATRS, planFromPage } from '../../lib/tradePlan'
import { Card, Segmented } from '../ui'
import { useTradeRisk } from './useTradeRisk'

const EARNINGS_WARNING_DAYS = 10
const PLAIN = { sign: false, decimals: 1 }
const RISK_OPTIONS = RISK_CHOICES.map((value) => ({ value, label: `${value}%` }))

function reportsSoon(next) {
  if (!next?.date) return null
  const days = Math.round((new Date(`${next.date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  return days >= 0 && days <= EARNINGS_WARNING_DAYS ? `Reports ${daysUntil(next.date)} (${fmtDate(next.date)}): the price can gap past a stop.` : null
}

function Row({ label, value, note }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-ink-2">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-ink tabular-nums">
        {value}
        {note ? <span className="block text-[12px] font-normal text-ink-3">{note}</span> : null}
      </dd>
    </div>
  )
}

function sizeRows(size, riskPct) {
  if (!size) return null
  if (size.shares === 0) {
    return (
      <Row
        label={`Size at ${riskPct}% risk`}
        value="No room"
        note={size.limitedByCap ? 'You are at the weight cap already' : 'One share risks more than that'}
      />
    )
  }
  return (
    <>
      <Row
        label={`Size at ${riskPct}% risk`}
        value={`${size.shares.toLocaleString('en-US')} shares`}
        note={`${fmtEur(size.value, { decimals: 0 })}, ${fmtPct(size.weightPct, PLAIN)} of your portfolio`}
      />
      <Row
        label="Loss if the stop is hit"
        value={fmtEur(size.lossAtStop, { decimals: 0 })}
        note={size.limitedByCap ? 'Size limited by the weight cap' : null}
      />
    </>
  )
}

export default function TradePlanCard({ bars, currency, note, positions, position, portfolioValue, nextEarnings }) {
  const [riskPct, choose] = useTradeRisk()
  const plan = planFromPage({ bars, currency, note, positions, position, portfolioValue, riskPct })
  if (!plan) return null
  const warning = reportsSoon(nextEarnings)

  return (
    <Card context="Stop distance and position size from the latest close" dot="off" title="Trade plan">
      <dl className="flex flex-col gap-1.5">
        <Row
          label="Stop"
          value={fmtMoney(plan.stop.price, currency)}
          note={plan.stop.source === 'yours' ? 'Your stop' : `${STOP_ATRS} × the average daily range (${ATR_PERIOD} sessions)`}
        />
        <Row
          label="Distance to the stop"
          value={fmtPct(plan.stopDistancePct, { decimals: 1 })}
          note={plan.stopAtrs == null ? null : `${plan.stopAtrs.toFixed(1)} average daily ranges`}
        />
        {plan.target ? (
          <Row
            label="Reward for each unit of risk"
            value={`${plan.rewardToRisk.toFixed(1)} to 1`}
            note={`Your target ${fmtMoney(plan.target, currency)}`}
          />
        ) : null}
        {sizeRows(plan.size, riskPct)}
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-2">Portfolio risked on the trade</span>
        <Segmented label="Portfolio risked on the trade" options={RISK_OPTIONS} value={riskPct} onChange={choose} />
      </div>
      {warning ? <p className="mt-3 text-[12px] font-medium text-warn-text">{warning}</p> : null}
      <p className="mt-3 text-[12px] text-ink-3">
        A stop limits a loss only when the price trades through it; a gap can fill lower. This is arithmetic on your own
        figures, not a recommendation.
      </p>
    </Card>
  )
}
