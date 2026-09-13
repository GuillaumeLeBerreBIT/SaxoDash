import { daysUntil } from '../../lib/earnings'
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { valuationVerdict } from '../../lib/snapshot'
import { Card, CardHeader } from '../ui'
import FundamentalsGate from './FundamentalsGate'
import VerdictBadge from './VerdictBadge'

function Ratio({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className="text-[15px] num font-mono mt-1 text-zinc-100">{value}</div>
    </div>
  )
}

/** One ratio against its own annual history: a min–median–max track with a
 *  marker at the latest reading. Silent without a usable range. */
function HistoryContext({ stats }) {
  if (!stats || stats.min === stats.max) return null
  const pos = Math.min(100, Math.max(0, ((stats.latest - stats.min) / (stats.max - stats.min)) * 100))
  return (
    <div className="mt-1.5">
      <div className="relative h-1 bg-white/[0.07] rounded-full">
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-400"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1 text-[9.5px] num font-mono text-zinc-600">
        {fmtNum(stats.min, 1)} · median {fmtNum(stats.median, 1)} · {fmtNum(stats.max, 1)} over {stats.n} yrs
      </div>
    </div>
  )
}

const RECOMMENDATION_SEGMENTS = [
  ['strong_buy', 'Strong buy', 'bg-emerald-500'],
  ['buy', 'Buy', 'bg-emerald-700'],
  ['hold', 'Hold', 'bg-zinc-500'],
  ['sell', 'Sell', 'bg-red-700'],
  ['strong_sell', 'Strong sell', 'bg-red-500'],
]

function RecommendationBar({ recommendation }) {
  if (!recommendation) return null

  const total = RECOMMENDATION_SEGMENTS.reduce((sum, [key]) => sum + (recommendation[key] || 0), 0)
  if (total === 0) return null

  return (
    <Card>
      <CardHeader title="Analyst recommendations" subtitle={`As of ${recommendation.period}`} />
      <div className="mt-4 flex h-2.5 rounded-full overflow-hidden">
        {RECOMMENDATION_SEGMENTS.map(([key, , color]) => {
          const count = recommendation[key] || 0
          return count > 0 ? (
            <span key={key} className={color} style={{ width: `${(count / total) * 100}%` }} />
          ) : null
        })}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-center">
        {RECOMMENDATION_SEGMENTS.map(([key, label]) => (
          <div key={key}>
            <div className="text-[15px] num font-mono text-zinc-100">{recommendation[key] || 0}</div>
            <div className="text-[10px] text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Earnings delivery as a valuation input: the next scheduled date, from the
 *  earnings feed when we have it. The actual-vs-estimate EPS chart lives on
 *  the Earnings tab only, so it isn't shown twice. */
function EarningsDelivery({ earnings }) {
  const next = earnings?.data?.available ? earnings.data.next : null
  if (!next) return null

  return (
    <Card>
      <CardHeader title="Next earnings" subtitle={daysUntil(next.date)} />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Ratio label="Date" value={next.date} />
        <Ratio label="EPS estimate" value={fmtNum(next.eps_estimate, 2)} />
      </div>
    </Card>
  )
}

export default function ValuationTab({ fundamentals, earnings }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="Valuation"
      fallback="Valuation data is unavailable for this symbol."
    >
      {(data) => (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Ratios"
              subtitle="Computed in-app from Finnhub's raw fundamentals"
              right={<VerdictBadge {...valuationVerdict(data)} />}
            />
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Ratio label="Market cap" value={fmtCompact(data.market_cap)} />
              <Ratio label="Dividend yield" value={fmtPct(data.dividend_yield, { sign: false })} />
              <Ratio label="52W range" value={`${fmtNum(data.week52_low, 2)} – ${fmtNum(data.week52_high, 2)}`} />
              <div>
                <Ratio label="P/E" value={fmtNum(data.pe_ratio, 2)} />
                <HistoryContext stats={data.valuation_history?.pe} />
              </div>
              <div>
                <Ratio label="P/S" value={fmtNum(data.ps_ratio, 2)} />
                <HistoryContext stats={data.valuation_history?.ps} />
              </div>
              <div>
                <Ratio label="P/B" value={fmtNum(data.pb_ratio, 2)} />
                <HistoryContext stats={data.valuation_history?.pb} />
              </div>
              <Ratio label="PEG" value={fmtNum(data.peg_ratio, 2)} />
              <Ratio label="ROE" value={fmtPct(data.roe, { sign: false })} />
              <Ratio label="Net margin" value={fmtPct(data.net_margin, { sign: false })} />
              <Ratio label="Gross margin" value={fmtPct(data.gross_margin, { sign: false })} />
              <Ratio label="Beta" value={fmtNum(data.beta, 2)} />
              <Ratio label="Forward P/E" value={fmtNum(data.forward_pe, 2)} />
              <div>
                <Ratio label="EV/EBITDA" value={fmtNum(data.ev_ebitda, 2)} />
                <HistoryContext stats={data.valuation_history?.ev_ebitda} />
              </div>
              <Ratio label="EV/Revenue" value={fmtNum(data.ev_revenue, 2)} />
              <Ratio label="Current ratio" value={fmtNum(data.current_ratio, 2)} />
              <Ratio label="ROA" value={fmtPct(data.roa, { sign: false })} />
              <Ratio label="ROI" value={fmtPct(data.roi, { sign: false })} />
              <Ratio label="Dividend growth (5Y)" value={fmtPct(data.dividend_growth_5y, { sign: false })} />
            </div>
          </Card>

          <EarningsDelivery earnings={earnings} />
          <RecommendationBar recommendation={data.recommendation} />
        </div>
      )}
    </FundamentalsGate>
  )
}
