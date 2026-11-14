import { PAD_R, PAD_T } from '../../lib/chartGeometry'
import { fmtDate, fmtEur, fmtMoney } from '../../lib/format'

const MARK_GAP = 28
const MARK_OFFSET = 9
const BAND_LABEL_WIDTH = 96
const PLAN_MIN_WIDTH = 46
const COMPACT_BELOW = 520

const TAG_HEIGHT = 14
const TAG_CHAR = 5.7

function Tag({ x, y, anchor = 'middle', fill, colors, opacity = 1, children }) {
  const width = String(children).length * TAG_CHAR + 8
  const left = anchor === 'end' ? x - width : x - width / 2
  return (
    <g opacity={opacity}>
      <rect x={left} y={y - TAG_HEIGHT / 2} width={width} height={TAG_HEIGHT} rx="3" fill={colors.pane} opacity="0.88" />
      <text x={left + width / 2} y={y + 3.4} fill={fill} fontSize="9.5" fontWeight="700" textAnchor="middle" className="num">
        {children}
      </text>
    </g>
  )
}

const signed = (value, decimals = 0) => `${value > 0 ? '+' : ''}${value.toFixed(decimals)}%`

function thinned(marks, xAt) {
  const kept = []
  for (const mark of [...marks].sort((a, b) => b.index - a.index)) {
    const x = xAt(mark.index)
    if (kept.every((other) => other.side !== mark.side || Math.abs(other.x - x) >= MARK_GAP)) kept.push({ ...mark, x })
  }
  return kept.reverse()
}

function markLabel(mark) {
  const what = `${mark.label} on ${fmtDate(mark.date)}`
  if (mark.outcomePct == null) return `${what}. Too recent to measure.`
  const span = mark.complete ? `over the next ${mark.sessions} sessions` : `in ${mark.sessions} sessions so far`
  return `${what}. The stock moved ${signed(mark.outcomePct, 1)} ${span}.`
}

export function MomentumBands({ bands, geometry, colors }) {
  const slot = geometry.xAt(1) - geometry.xAt(0)
  return (
    <g data-testid="momentum-bands" pointerEvents="none">
      {bands.map((band) => {
        const x = geometry.xAt(band.from) - slot / 2
        const width = geometry.xAt(band.to) + slot / 2 - x
        return (
          <g key={`${band.key}-${band.from}`} data-testid="momentum-band">
            <rect x={x} y={PAD_T} width={width} height={geometry.chartH} fill={colors.accent} opacity="0.07" />
            <rect x={x} y={PAD_T} width={width} height={2} fill={colors.accent} opacity="0.55" />
            {width >= BAND_LABEL_WIDTH ? (
              <text x={x + 5} y={PAD_T + 13} fill={colors.axis} fontSize="9.5" fontWeight="600">
                {band.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

export function CandleMarks({ marks, data, geometry, colors, onInspect }) {
  return (
    <g data-no-pan data-testid="candle-marks">
      {thinned(marks, geometry.xAt).map((mark) => {
        const below = mark.side === 'below'
        const bar = data[mark.index]
        const y = below ? geometry.scaleY(bar.low) + MARK_OFFSET : geometry.scaleY(bar.high) - MARK_OFFSET
        const tip = below ? -5 : 5
        const color = below ? colors.accent : colors.warn
        const show = () => onInspect(mark)
        const hide = () => onInspect(null)
        return (
          <g
            key={`${mark.key}-${mark.date}`}
            data-testid="candle-mark"
            role="img"
            tabIndex={0}
            aria-label={markLabel(mark)}
            className="cursor-default outline-none"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
          >
            <rect x={mark.x - 14} y={below ? y - 7 : y - 21} width={28} height={28} fill="transparent" />
            <polygon
              points={`${mark.x},${y + tip} ${mark.x - 5},${y - tip * 0.8} ${mark.x + 5},${y - tip * 0.8}`}
              fill={color}
              stroke={colors.pane}
              strokeWidth="1"
            />
            {mark.outcomePct == null ? null : (
              <Tag
                x={mark.x}
                y={below ? y + 15 : y - 15}
                fill={mark.outcomePct >= 0 ? colors.up : colors.down}
                opacity={mark.complete ? 1 : 0.7}
                colors={colors}
              >
                {signed(mark.outcomePct)}
              </Tag>
            )}
          </g>
        )
      })}
    </g>
  )
}

export function OutcomePath({ mark, data, geometry, colors }) {
  if (mark?.entryIndex == null || mark.endIndex == null) return null
  const color = mark.outcomePct >= 0 ? colors.up : colors.down
  const x1 = geometry.xAt(mark.entryIndex)
  const y1 = geometry.scaleY(data[mark.entryIndex].open)
  const x2 = geometry.xAt(mark.endIndex)
  const y2 = geometry.scaleY(data[mark.endIndex].close)
  return (
    <g data-testid="outcome-path" pointerEvents="none">
      <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={color} strokeWidth="1.5" strokeDasharray="5 3" />
      <circle cx={x1} cy={y1} r="2.5" fill={color} />
      <circle cx={x2} cy={y2} r="3.5" fill={color} stroke={colors.pane} />
    </g>
  )
}

export function MarkCard({ mark, x, top, width }) {
  const cardWidth = 264
  const left = Math.max(8, Math.min(width - PAD_R - cardWidth, x - cardWidth / 2))
  const tone = mark.outcomePct == null ? 'text-ink-2' : mark.outcomePct >= 0 ? 'text-up' : 'text-down'
  const outcome =
    mark.outcomePct == null
      ? 'Fired on the latest session, nothing to measure yet.'
      : mark.complete
        ? `This stock then moved ${signed(mark.outcomePct, 1)} over ${mark.sessions} sessions.`
        : `So far ${signed(mark.outcomePct, 1)} in ${mark.sessions} sessions.`
  return (
    <div
      data-testid="mark-card"
      role="tooltip"
      className="absolute z-20 pointer-events-none rounded-lg border border-line bg-raised px-3 py-2 text-[11.5px] leading-5 shadow-lg"
      style={{ left, top, width: cardWidth }}
    >
      <p className="font-semibold text-[12px] text-ink">
        {mark.label} · {fmtDate(mark.date)}
      </p>
      <p className="text-ink-2">{mark.description}</p>
      <p className={`font-semibold ${tone}`}>{outcome}</p>
      <p className="text-ink-3">Across all stocks in testing: {mark.evidence}</p>
    </div>
  )
}

export function TradePlanBox({ plan, data, geometry, colors }) {
  if (!plan || !data.length || data[data.length - 1].date !== plan.asOf) return null
  const right = geometry.chartW
  const left = Math.min(geometry.xAt(data.length - 1) + geometry.candleWidth / 2 + 2, right - PLAN_MIN_WIDTH)
  const floor = PAD_T + geometry.chartH
  const inside = (y) => Math.max(PAD_T + 9, Math.min(floor - 9, y))
  const price = geometry.scaleY(plan.price)
  const stop = geometry.scaleY(plan.stop.price)
  const target = plan.target == null ? null : geometry.scaleY(plan.target)
  const compact = geometry.chartW < COMPACT_BELOW
  const size = !compact && plan.size && plan.size.shares > 0 ? `${plan.size.shares} sh · ${fmtEur(plan.size.lossAtStop, { decimals: 0 })} at risk` : null
  return (
    <g data-testid="trade-plan-box" pointerEvents="none">
      <rect x={left} y={price} width={right - left} height={Math.max(0, stop - price)} fill={colors.down} opacity="0.18" />
      {target == null ? null : (
        <rect x={left} y={target} width={right - left} height={Math.max(0, price - target)} fill={colors.up} opacity="0.18" />
      )}
      <line
        x1={left}
        x2={right}
        y1={stop}
        y2={stop}
        stroke={colors.down}
        strokeWidth="1.2"
        strokeDasharray={plan.stop.source === 'atr' ? '4 3' : undefined}
      />
      <Tag anchor="end" x={right - 3} y={inside(stop - 9)} colors={colors} fill={colors.down}>
        {compact ? `Stop ${signed(plan.stopDistancePct, 1)}` : `Stop ${fmtMoney(plan.stop.price, plan.currency)} · ${signed(plan.stopDistancePct, 1)}`}
      </Tag>
      {size ? (
        <Tag anchor="end" x={right - 3} y={inside((price + stop) / 2)} colors={colors} fill={colors.down}>
          {size}
        </Tag>
      ) : null}
      {target == null ? null : (
        <Tag anchor="end" x={right - 3} y={inside(target + 9)} colors={colors} fill={colors.up}>
          {`Target · ${plan.rewardToRisk.toFixed(1)} to 1`}
        </Tag>
      )}
    </g>
  )
}
