import {
  CartesianGrid,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts'

import { axisProps, gridProps, chartTooltipProps } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { Card, InfoTip } from '../ui'

const MIN_POINTS = 2

// Scores are 0-100, but plotting them flush against that exact boundary
// pins edge-case dots (and their symbol labels) to the SVG's own border,
// where they clip. A few points of headroom on each side fixes that without
// changing what the numbers mean.
const PAD = 8
const DOMAIN = [-PAD, 100 + PAD]
const TICKS = [0, 25, 50, 75, 100]

function QuadrantTooltip({ active, payload }) {
  const c = useChartColors()
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div
      style={chartTooltipProps(c).contentStyle}
      className="text-[12px]"
    >
      <div className="font-semibold text-ink mb-1">{p.symbol}</div>
      <div style={chartTooltipProps(c).itemStyle}>Quality: {p.quality}</div>
      <div style={chartTooltipProps(c).itemStyle}>Valuation: {p.valuation} (higher = pricier)</div>
    </div>
  )
}

/** Business quality x valuation richness, so "excellent business, bad
 *  price" and "average business, cheap price" are a glance instead of an
 *  inference across the ratios table above. `points`: `[{symbol, quality,
 *  valuation, isSelf}]`, 0-100 each, from lib/quadrant.js. */
export default function QualityValuationQuadrant({ points, unscored = [], className = '' }) {
  const c = useChartColors()
  if (!points || points.length < MIN_POINTS) return null

  const self = points.filter((p) => p.isSelf)
  const peers = points.filter((p) => !p.isSelf)

  return (
    <Card
      className={className}
      context="Quality: ROE, net margin, leverage · Valuation: PEG, P/E vs own history"
      dot="ok"
      title="Quality vs. valuation"
      right={
        <InfoTip>
          Quality averages ROE, net margin and leverage against the same thresholds the
          Investment Snapshot uses. Valuation reads PEG and P/E vs. its own history. Both are
          0-100 reads, not fundamentals themselves - a quick placement, not a verdict.
        </InfoTip>
      }
    >
      <div className="flex items-center justify-between px-1 text-[12px] text-ink-3">
        <span>Cheaper</span>
        <span>Pricier →</span>
      </div>
      <div className="flex gap-2 mt-1">
        <span className="text-[12px] text-ink-3 [writing-mode:vertical-rl] rotate-180 shrink-0">
          Quality →
        </span>
        <div className="h-[var(--chart-h-md)] flex-1 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 14, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid {...gridProps(c)} />
              <ReferenceArea x1={50} x2={100 + PAD} y1={50} y2={100 + PAD} fill={c.down} fillOpacity={0.05} />
              <ReferenceArea x1={-PAD} x2={50} y1={-PAD} y2={50} fill={c.down} fillOpacity={0.05} />
              <ReferenceArea x1={-PAD} x2={50} y1={50} y2={100 + PAD} fill={c.up} fillOpacity={0.06} />
              <XAxis
                {...axisProps(c)}
                type="number"
                dataKey="valuation"
                domain={DOMAIN}
                ticks={TICKS}
                allowDataOverflow
              />
              <YAxis
                {...axisProps(c)}
                type="number"
                dataKey="quality"
                domain={DOMAIN}
                ticks={TICKS}
                allowDataOverflow
                width={28}
              />
              <ReferenceLine x={50} stroke={c.axis} strokeDasharray="3 3" />
              <ReferenceLine y={50} stroke={c.axis} strokeDasharray="3 3" />
              <Tooltip content={<QuadrantTooltip />} cursor={{ stroke: c.crosshair, strokeDasharray: '3 3' }} />
              <Scatter data={peers} fill={c.axisCategory}>
                <LabelList dataKey="symbol" position="top" offset={6} style={{ fontSize: 11, fontWeight: 600, fill: c.axisCategory }} />
              </Scatter>
              <Scatter data={self} fill={c.primary} shape="star">
                <LabelList dataKey="symbol" position="top" offset={6} style={{ fontSize: 11, fontWeight: 700, fill: c.primary }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        {`A company missing either score is left off, never guessed.${
          unscored.length ? ` ${unscored.join(', ')} could not be scored.` : ''
        }`}
      </p>
    </Card>
  )
}
