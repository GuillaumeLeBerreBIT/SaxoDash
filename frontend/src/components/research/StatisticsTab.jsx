import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { valuationVerdict } from '../../lib/snapshot'
import { Card } from '../ui'
import FundamentalsGate from './FundamentalsGate'
import RatioHistoryChart from './RatioHistoryChart'
import RatioHistoryTable from './RatioHistoryTable'
import VerdictBadge from './VerdictBadge'

const SPAN_5 = 'min-[1100px]:col-span-5'
const SPAN_7 = 'min-[1100px]:col-span-7'
const SPAN_12 = 'min-[1100px]:col-span-12'

const HISTORY_RATIOS = [
  ['pe', 'P/E'],
  ['ps', 'P/S'],
  ['pb', 'P/B'],
  ['ev_ebitda', 'EV/EBITDA'],
]

const hasRange = (stats) => Boolean(stats) && stats.min !== stats.max

function Ratio({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-t border-line">
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className="text-[13px] num text-ink">{value}</span>
    </div>
  )
}

function RatioGroup({ label, children }) {
  return (
    <div>
      <div className="text-[13.5px] font-bold text-ink mb-1">{label}</div>
      {children}
    </div>
  )
}

function HistoryRange({ label, stats }) {
  const pos = Math.min(100, Math.max(0, ((stats.latest - stats.min) / (stats.max - stats.min)) * 100))
  const medianPos = Math.min(100, Math.max(0, ((stats.median - stats.min) / (stats.max - stats.min)) * 100))
  return (
    <div className="py-2 first:pt-0">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-bold text-ink">{label}</span>
        <span className="num text-ink-3">
          <span className="font-semibold text-ink">{fmtNum(stats.latest, 1)}</span> now
        </span>
      </div>
      <div className="relative h-3.5 mt-2">
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-track" />
        <span className="absolute top-0 h-3.5 w-0.5 bg-ink-3" style={{ left: `${medianPos}%` }} />
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink ring-2 ring-pane"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1 text-[12px] num text-ink-3">
        {`${fmtNum(stats.min, 1)} · median ${fmtNum(stats.median, 1)} · ${fmtNum(stats.max, 1)} over ${stats.n} yrs`}
      </div>
    </div>
  )
}

function ValuationHistory({ history, className }) {
  const rows = HISTORY_RATIOS.filter(([key]) => hasRange(history?.[key]))
  if (!rows.length) return null
  return (
    <Card className={className} context="Against its own annual range" dot="ok" title="Valuation vs its history">
      {rows.map(([key, label]) => (
        <HistoryRange key={key} label={label} stats={history[key]} />
      ))}
    </Card>
  )
}

export default function StatisticsTab({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="Statistics"
      fallback="Statistics are unavailable for this symbol."
    >
      {(data) => {
        const withHistory = HISTORY_RATIOS.some(([key]) => hasRange(data.valuation_history?.[key]))
        const byYear = data.ratio_history?.length > 0
        return (
          <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
            <Card
              className={SPAN_12}
              context="Computed in-app from Finnhub's raw fundamentals"
              dot="ok"
              title="Ratios"
              right={<VerdictBadge {...valuationVerdict(data)} />}
            >
              <div className="grid gap-x-7 gap-y-4 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
                <RatioGroup label="Market">
                  <Ratio label="Market cap" value={fmtCompact(data.market_cap)} />
                  <Ratio label="Dividend yield" value={fmtPct(data.dividend_yield, { sign: false })} />
                  <Ratio label="52W range" value={`${fmtNum(data.week52_low, 2)} – ${fmtNum(data.week52_high, 2)}`} />
                  <Ratio label="Dividend growth (5Y)" value={fmtPct(data.dividend_growth_5y, { sign: false })} />
                  <Ratio label="Beta" value={fmtNum(data.beta, 2)} />
                </RatioGroup>

                <RatioGroup label="Valuation multiples">
                  <Ratio label="P/E" value={fmtNum(data.pe_ratio, 2)} />
                  <Ratio label="Forward P/E" value={fmtNum(data.forward_pe, 2)} />
                  <Ratio label="PEG" value={fmtNum(data.peg_ratio, 2)} />
                  <Ratio label="P/S" value={fmtNum(data.ps_ratio, 2)} />
                  <Ratio label="P/B" value={fmtNum(data.pb_ratio, 2)} />
                  <Ratio label="EV/EBITDA" value={fmtNum(data.ev_ebitda, 2)} />
                  <Ratio label="EV/Revenue" value={fmtNum(data.ev_revenue, 2)} />
                </RatioGroup>

                <RatioGroup label="Profitability & health">
                  <Ratio label="ROE" value={fmtPct(data.roe, { sign: false })} />
                  <Ratio label="ROA" value={fmtPct(data.roa, { sign: false })} />
                  <Ratio label="ROI" value={fmtPct(data.roi, { sign: false })} />
                  <Ratio label="Net margin" value={fmtPct(data.net_margin, { sign: false })} />
                  <Ratio label="Gross margin" value={fmtPct(data.gross_margin, { sign: false })} />
                  <Ratio label="Current ratio" value={fmtNum(data.current_ratio, 2)} />
                </RatioGroup>
              </div>
              <p className="mt-3 text-[12px] text-ink-3">
                A ratio Finnhub&apos;s free tier doesn&apos;t return shows as a dash, never as zero.
              </p>
            </Card>

            {withHistory && <ValuationHistory history={data.valuation_history} className={byYear ? SPAN_5 : SPAN_12} />}

            {byYear && (
              <>
                <RatioHistoryChart history={data.ratio_history} className={withHistory ? SPAN_7 : SPAN_12} />
                <Card flush className={SPAN_12} context="Year end, with today's figure beside it" dot="ok" title="Ratio history">
                  <RatioHistoryTable history={data.ratio_history} current={data} />
                </Card>
              </>
            )}
          </div>
        )
      }}
    </FundamentalsGate>
  )
}
