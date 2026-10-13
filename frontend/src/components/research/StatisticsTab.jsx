import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { valuationVerdict } from '../../lib/snapshot'
import { Card, CardHeader } from '../ui'
import FundamentalsGate from './FundamentalsGate'
import RatioHistoryChart from './RatioHistoryChart'
import RatioHistoryTable from './RatioHistoryTable'
import VerdictBadge from './VerdictBadge'

function Ratio({ label, value }) {
  return (
    <div>
      <div className="text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className="text-[var(--fig-md)] num font-mono mt-1 text-zinc-100">{value}</div>
    </div>
  )
}

/** One ratio against its own annual history: a min–median–max track with a
 *  marker at the latest reading. Reserves its slot even without a usable
 *  range, so a row of ratios stays level regardless of which ones have it. */
function HistoryContext({ stats }) {
  const valid = stats && stats.min !== stats.max
  const pos = valid ? Math.min(100, Math.max(0, ((stats.latest - stats.min) / (stats.max - stats.min)) * 100)) : 0
  return (
    <div className={`mt-1.5 ${valid ? '' : 'invisible'}`}>
      <div className="relative h-1 bg-white/[0.07] rounded-full">
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-400"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1 text-[var(--fig-2xs)] num font-mono text-zinc-600">
        {valid ? `${fmtNum(stats.min, 1)} · median ${fmtNum(stats.median, 1)} · ${fmtNum(stats.max, 1)} over ${stats.n} yrs` : ' '}
      </div>
    </div>
  )
}

/** A labelled row within the Ratios card - same "grouped facts under an
 *  uppercase tag" rhythm as SnapshotSection, so the two cards on this page
 *  read as one system instead of two different grids. */
function RatioGroup({ label, children }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium">{label}</div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">{children}</div>
    </div>
  )
}

export default function StatisticsTab({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="Statistics"
      fallback="Statistics are unavailable for this symbol."
    >
      {(data) => (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Ratios"
              subtitle="Computed in-app from Finnhub's raw fundamentals"
              right={<VerdictBadge {...valuationVerdict(data)} />}
            />
            <div className="mt-2 divide-y divide-white/[0.06]">
              <RatioGroup label="Market">
                <Ratio label="Market cap" value={fmtCompact(data.market_cap)} />
                <Ratio label="Dividend yield" value={fmtPct(data.dividend_yield, { sign: false })} />
                <Ratio label="52W range" value={`${fmtNum(data.week52_low, 2)} – ${fmtNum(data.week52_high, 2)}`} />
                <Ratio label="Dividend growth (5Y)" value={fmtPct(data.dividend_growth_5y, { sign: false })} />
              </RatioGroup>

              <RatioGroup label="Valuation multiples">
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
                <div>
                  <Ratio label="EV/EBITDA" value={fmtNum(data.ev_ebitda, 2)} />
                  <HistoryContext stats={data.valuation_history?.ev_ebitda} />
                </div>
                <Ratio label="Forward P/E" value={fmtNum(data.forward_pe, 2)} />
                <Ratio label="PEG" value={fmtNum(data.peg_ratio, 2)} />
                <Ratio label="EV/Revenue" value={fmtNum(data.ev_revenue, 2)} />
                <Ratio label="Beta" value={fmtNum(data.beta, 2)} />
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
          </Card>

          {data.ratio_history?.length > 0 && (
            <Card>
              <CardHeader title="Ratios by year" subtitle="Fiscal years, from Finnhub's annual series" />
              <div className="mt-3">
                <RatioHistoryTable history={data.ratio_history} current={data} />
              </div>
              <div className="mt-5 pt-4 border-t border-white/[0.06]">
                <RatioHistoryChart history={data.ratio_history} />
              </div>
            </Card>
          )}
        </div>
      )}
    </FundamentalsGate>
  )
}
