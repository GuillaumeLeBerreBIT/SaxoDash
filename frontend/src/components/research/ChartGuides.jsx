import { useId } from 'react'
import { PAD_R, PAD_T } from '../../lib/chartGeometry'
import { fmtMoney } from '../../lib/format'
import { badgePrice } from '../../lib/priceLines'
import { bandAt, stepAt } from '../../lib/valueGuides'

const TAG_HEIGHT = 18
const COMPACT_BELOW = 520
const STOP_FONT = 11

function Tag({ x, y, anchor = 'start', fill, colors, size, children }) {
  const width = String(children).length * size * 0.6 + 10
  const left = anchor === 'end' ? x - width : x
  return (
    <g>
      <rect x={left} y={y - TAG_HEIGHT / 2} width={width} height={TAG_HEIGHT} rx="3" fill={colors.pane} opacity="0.9" />
      <text x={left + 5} y={y + size * 0.36} fill={fill} fontSize={size} fontWeight="700" className="num">
        {children}
      </text>
    </g>
  )
}

function stepPath(values, xAt, scaleY, last) {
  let d = ''
  let previous = null
  values.forEach((value, i) => {
    if (value == null) {
      if (previous != null) d += ` H ${xAt(i - 1)}`
      previous = null
      return
    }
    if (previous == null) d += `${d ? ' ' : ''}M ${xAt(i)} ${scaleY(value)}`
    else if (value !== previous) d += ` H ${xAt(i)} V ${scaleY(value)}`
    previous = value
  })
  return previous != null ? `${d} H ${xAt(last)}` : d
}

const ZONE_DEPTH = 0.1
const ZONE_OPACITY = 0.3
const EDGE_OPACITY = 0.8

function stepRuns(data, line, band) {
  const runs = []
  data.forEach((bar, i) => {
    const step = stepAt(line, bar.date)
    const open = runs[runs.length - 1]
    if (open && open.step === step) open.end = i
    else runs.push({ step, start: i, end: i })
  })
  return runs
    .map((run, i) => ({ ...run, levels: bandAt(run.step, band), right: i + 1 < runs.length && bandAt(runs[i + 1].step, band) ? run.end + 1 : run.end }))
    .filter((run) => run.levels)
}

function Fade({ id, color, from }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity={from} />
      <stop offset="1" stopColor={color} stopOpacity={ZONE_OPACITY - from} />
    </linearGradient>
  )
}

export function ValueZones({ line, band, data, geometry, colors }) {
  const id = useId()
  if (!band || !line?.length || !data.length) return null
  const runs = stepRuns(data, line, band)
  if (!runs.length) return null
  const { xAt, scaleY } = geometry
  const last = data.length - 1
  const levels = data.map((bar) => bandAt(stepAt(line, bar.date), band))
  const cheapPath = stepPath(levels.map((level) => level?.cheap ?? null), xAt, scaleY, last)
  const expensivePath = stepPath(levels.map((level) => level?.expensive ?? null), xAt, scaleY, last)
  const zone = (kind, edge, far, start, right) => {
    const top = scaleY(Math.max(edge, far))
    return (
      <rect key={`${kind}-${start}`} data-zone={kind} x={xAt(start)} y={top} width={xAt(right) - xAt(start)} height={scaleY(Math.min(edge, far)) - top} fill={`url(#${id}${kind})`} />
    )
  }
  return (
    <g data-testid="value-zones" pointerEvents="none">
      <defs>
        <Fade id={`${id}cheap`} color={colors.axisCategory} from={ZONE_OPACITY} />
        <Fade id={`${id}expensive`} color={colors.axisCategory} from={0} />
      </defs>
      {runs.map(({ levels: { cheap, expensive }, start, right }) => [
        zone('cheap', cheap, cheap * (1 - ZONE_DEPTH), start, right),
        zone('expensive', expensive, expensive * (1 + ZONE_DEPTH), start, right),
      ])}
      {cheapPath ? <path data-edge="cheap" d={cheapPath} fill="none" stroke={colors.axisCategory} strokeOpacity={EDGE_OPACITY} strokeWidth="1.2" /> : null}
      {expensivePath ? <path data-edge="expensive" d={expensivePath} fill="none" stroke={colors.axisCategory} strokeOpacity={EDGE_OPACITY} strokeWidth="1.2" /> : null}
    </g>
  )
}

export function HighLine({ highs, geometry, colors }) {
  if (!highs?.length) return null
  const last = highs.findLastIndex((value) => value != null)
  if (last < 0) return null
  const d = stepPath(highs, geometry.xAt, geometry.scaleY, last)
  return <path data-testid="high-line" d={d} fill="none" stroke={colors.axisCategory} strokeWidth="1.2" strokeDasharray="1.5 3" pointerEvents="none" />
}

const gapWords = (gap) => `Gap ${gap.up ? 'up' : 'down'} ${gap.rvol.toFixed(1)}x vol`
const GAP_FONT = 10

function gapLabelX(x, words, chartW) {
  const width = words.length * GAP_FONT * 0.6
  return Math.max(3, Math.min(x + 3, chartW - width - 3))
}

export function GapBoxes({ gaps, geometry, colors }) {
  if (!gaps?.length) return null
  const { xAt, scaleY, candleWidth, chartW } = geometry
  return (
    <g data-testid="gap-boxes" pointerEvents="none">
      {gaps.map((gap) => {
        const color = gap.up ? colors.up : colors.down
        const x = xAt(gap.index)
        const y = scaleY(Math.max(gap.from, gap.to))
        const height = Math.abs(scaleY(gap.from) - scaleY(gap.to))
        return (
          <g key={gap.index}>
            <rect
              x={x}
              y={y}
              width={Math.max(candleWidth, xAt(gap.end) - x)}
              height={height}
              fill={color}
              opacity={gap.filled ? 0.12 : 0.22}
              stroke={gap.filled ? undefined : color}
              strokeDasharray={gap.filled ? undefined : '4 3'}
            />
            {gap.filled ? null : (
              <text x={gapLabelX(x, gapWords(gap), chartW)} y={y - 4} fill={color} fontSize={GAP_FONT} fontWeight="600" className="num">
                {gapWords(gap)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

const GUIDE_TAG_HEIGHT = 16
const GUIDE_TAG_GAP = 17
const GUIDE_FONT = 11

const signedPercent = (value) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}%`

function guideTagItems({ line, band, highs, data, colors }) {
  const lastBar = data[data.length - 1]
  if (!lastBar) return []
  const items = []
  const levels = bandAt(stepAt(line, lastBar.date), band)
  if (levels) {
    items.push({ key: 'expensive', price: levels.expensive, words: `High end · P/E ${Math.round(band.high)}`, stroke: colors.axisCategory, text: colors.axisCategory })
    items.push({ key: 'cheap', price: levels.cheap, words: `Low end · P/E ${Math.round(band.low)}`, stroke: colors.axisCategory, text: colors.axisCategory })
  }
  const high = highs?.[highs.length - 1]
  if (high != null) {
    const words = `52w high ${signedPercent((lastBar.close / high - 1) * 100)}`
    items.push({ key: 'high', price: high, words, stroke: colors.axisCategory, text: colors.axisCategory })
  }
  return items
}

function placeTags(items, geometry) {
  const top = PAD_T + GUIDE_TAG_HEIGHT / 2
  const floor = PAD_T + geometry.chartH - GUIDE_TAG_HEIGHT / 2
  const placed = items
    .map((item) => {
      const y = geometry.scaleY(item.price)
      const edge = y < top ? 'above' : y > floor ? 'below' : null
      return { ...item, edge, y: Math.min(floor, Math.max(top, y)) }
    })
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < placed.length; i++) placed[i].y = Math.max(placed[i].y, placed[i - 1].y + GUIDE_TAG_GAP)
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? floor : placed[i + 1].y - GUIDE_TAG_GAP
    placed[i].y = Math.min(placed[i].y, limit)
  }
  return placed
}

function EdgeArrow({ x, y, edge, fill }) {
  const points = edge === 'above' ? `${x - 4},${y + 3} ${x + 4},${y + 3} ${x},${y - 4}` : `${x - 4},${y - 3} ${x + 4},${y - 3} ${x},${y + 4}`
  return <polygon data-edge={edge} points={points} fill={fill} />
}

export function GuideTags({ line, band = null, highs, data, geometry, width, colors }) {
  const tags = placeTags(guideTagItems({ line, band, highs, data, colors }), geometry)
  if (!tags.length) return null
  const gutter = width - PAD_R
  return (
    <g data-testid="guide-tags" pointerEvents="none">
      {tags.map((tag) => {
        const wordsWidth = tag.words.length * GUIDE_FONT * 0.6 + 10
        const wordsRight = gutter - 4
        const wordsLeft = wordsRight - wordsWidth
        return (
          <g key={tag.key} data-testid={`guide-tag-${tag.key}`}>
            <rect x={wordsLeft} y={tag.y - GUIDE_TAG_HEIGHT / 2} width={wordsWidth} height={GUIDE_TAG_HEIGHT} rx="3" fill={colors.pane} opacity="0.85" />
            <text x={wordsRight - 5} y={tag.y + 3.5} textAnchor="end" fill={tag.text} fontSize={GUIDE_FONT} fontWeight="600" className="num">
              {tag.words}
            </text>
            {tag.edge ? <EdgeArrow x={wordsLeft - 7} y={tag.y} edge={tag.edge} fill={tag.stroke} /> : null}
            <rect
              data-badge
              x={gutter + 2}
              y={tag.y - GUIDE_TAG_HEIGHT / 2}
              width={PAD_R - 4}
              height={GUIDE_TAG_HEIGHT}
              rx={2}
              fill={colors.tooltip.bg}
              stroke={tag.stroke}
            />
            <text x={gutter + 6} y={tag.y + 3.5} fill={tag.text} fontSize={GUIDE_FONT} className="num">
              {badgePrice(tag.price)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function stopWords(plan, compact) {
  const stop = fmtMoney(plan.stop.price, plan.currency)
  if (compact) return `Stop-loss ${stop}`
  return `Stop-loss ${stop} · ${Math.abs(plan.stopDistancePct).toFixed(1)}% below today's close`
}

export function StopGuide({ plan, data, geometry, colors }) {
  if (!plan || !data.length || data[data.length - 1].date !== plan.asOf) return null
  const y = geometry.scaleY(plan.stop.price)
  const floor = PAD_T + geometry.chartH
  if (y < PAD_T || y > floor) return null
  return (
    <g data-testid="stop-guide" pointerEvents="none">
      {plan.stop.source === 'atr' ? (
        <line x1={0} x2={geometry.chartW} y1={y} y2={y} stroke={colors.down} strokeWidth="1.2" strokeDasharray="6 4" />
      ) : null}
      <Tag anchor="end" x={geometry.chartW - 4} y={Math.min(floor - 10, y + 12)} fill={colors.down} colors={colors} size={STOP_FONT}>
        {stopWords(plan, geometry.chartW < COMPACT_BELOW)}
      </Tag>
    </g>
  )
}
