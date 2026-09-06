import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtNum, fmtPct } from '../../lib/format'
import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { Card, CardHeader } from '../ui'
import FundamentalsGate from './FundamentalsGate'

function Ratio({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className="text-[15px] num font-mono mt-1 text-zinc-100">{value}</div>
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

function PricePerformance({ data }) {
  const hasAny = [data.price_return_1m, data.price_return_ytd, data.price_return_1y].some((v) => v != null)
  if (!hasAny) return null

  return (
    <Card>
      <CardHeader title="Price performance" subtitle="Total return, from Finnhub" />
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Ratio label="1 month" value={fmtPct(data.price_return_1m)} />
        <Ratio label="Year to date" value={fmtPct(data.price_return_ytd)} />
        <Ratio label="1 year" value={fmtPct(data.price_return_1y)} />
      </div>
    </Card>
  )
}

function EpsHistoryChart({ epsHistory }) {
  if (!epsHistory?.length) return null

  return (
    <Card>
      <CardHeader title="EPS: actual vs. estimate" subtitle="Most recent quarters" />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={epsHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="period" />
            <YAxis {...axisProps} width={44} />
            <Tooltip {...chartTooltipProps} formatter={(v) => fmtNum(v, 2)} />
            <Bar dataKey="estimate" name="Estimate" fill="#52525b" radius={[3, 3, 0, 0]} barSize={18} />
            <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export default function ValuationTab({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="Valuation"
      fallback="Valuation data is unavailable for this symbol."
    >
      {(data) => (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Ratios" subtitle="Computed in-app from Finnhub's raw fundamentals" />
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Ratio label="P/E" value={fmtNum(data.pe_ratio, 2)} />
              <Ratio label="P/S" value={fmtNum(data.ps_ratio, 2)} />
              <Ratio label="P/B" value={fmtNum(data.pb_ratio, 2)} />
              <Ratio label="PEG" value={fmtNum(data.peg_ratio, 2)} />
              <Ratio label="ROE" value={fmtPct(data.roe, { sign: false })} />
              <Ratio label="Net margin" value={fmtPct(data.net_margin, { sign: false })} />
              <Ratio label="Gross margin" value={fmtPct(data.gross_margin, { sign: false })} />
              <Ratio label="Beta" value={fmtNum(data.beta, 2)} />
              <Ratio label="Forward P/E" value={fmtNum(data.forward_pe, 2)} />
              <Ratio label="EV/EBITDA" value={fmtNum(data.ev_ebitda, 2)} />
              <Ratio label="EV/Revenue" value={fmtNum(data.ev_revenue, 2)} />
              <Ratio label="Current ratio" value={fmtNum(data.current_ratio, 2)} />
              <Ratio label="ROA" value={fmtPct(data.roa, { sign: false })} />
              <Ratio label="ROI" value={fmtPct(data.roi, { sign: false })} />
              <Ratio label="Dividend growth (5Y)" value={fmtPct(data.dividend_growth_5y, { sign: false })} />
            </div>
          </Card>

          <PricePerformance data={data} />
          <RecommendationBar recommendation={data.recommendation} />
          <EpsHistoryChart epsHistory={data.eps_history} />
        </div>
      )}
    </FundamentalsGate>
  )
}
