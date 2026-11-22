import { HIGH_WINDOW } from './indicators'
import { niceTicks } from './niceTicks'

const PAD = { left: 4, right: 64, top: 10, bottom: 22 }
const VOLUME_HEIGHT = 36
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const X_TICK_COUNT = 5
const Y_TICK_TARGET = 4

export const PRICE_PAD = PAD

const HEIGHTS = [
  [700, 380],
  [520, 300],
  [0, 220],
]

export function priceChartHeight(width) {
  return HEIGHTS.find(([minWidth]) => width >= minWidth)[1]
}

export function previousClose(bars = []) {
  return bars.length >= 2 ? bars[bars.length - 2].close : null
}

export function yearRange(bars = []) {
  if (bars.length < HIGH_WINDOW) return null
  const tail = bars.slice(-HIGH_WINDOW)
  return {
    low: Math.min(...tail.map((bar) => bar.low)),
    high: Math.max(...tail.map((bar) => bar.high)),
  }
}

function axisLabel(date, count) {
  const [year, month, day] = date.split('-').map(Number)
  if (count > 300) return String(year)
  if (count > 150) return `${MONTHS[month - 1]} ${String(year).slice(2)}`
  if (count > 30) return MONTHS[month - 1]
  return `${day} ${MONTHS[month - 1]}`
}

function dateTicks(bars, x) {
  const labels = []
  const seen = new Set()
  for (let step = 0; step < X_TICK_COUNT; step += 1) {
    const index = Math.round((step / (X_TICK_COUNT - 1)) * (bars.length - 1))
    const text = axisLabel(bars[index].date, bars.length)
    if (seen.has(text)) continue
    seen.add(text)
    labels.push({
      x: x(index),
      text,
      anchor: step === 0 ? 'start' : step === X_TICK_COUNT - 1 ? 'end' : 'middle',
    })
  }
  return labels
}

export function priceChartGeometry(bars, { width, height, showVolume = false, previous = null }) {
  if (!bars || bars.length < 2) return null

  const plotWidth = width - PAD.left - PAD.right
  const volumeHeight = showVolume ? VOLUME_HEIGHT : 0
  const plotHeight = height - PAD.top - PAD.bottom - volumeHeight
  const bottom = PAD.top + plotHeight

  const closes = bars.map((bar) => bar.close)
  let low = Math.min(...closes)
  let high = Math.max(...closes)
  if (previous != null) {
    low = Math.min(low, previous)
    high = Math.max(high, previous)
  }
  const margin = (high - low) * 0.08 || high * 0.01 || 1
  low -= margin
  high += margin

  const x = (index) => PAD.left + (index / (bars.length - 1)) * plotWidth
  const y = (value) => PAD.top + ((high - value) / (high - low)) * plotHeight

  const line = closes.map((close, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(close).toFixed(1)}`).join('')
  const area = `${line}L${x(bars.length - 1).toFixed(1)} ${bottom}L${x(0).toFixed(1)} ${bottom}Z`

  const maxVolume = Math.max(...bars.map((bar) => bar.volume ?? 0))
  const barWidth = Math.max(1, (plotWidth / bars.length) * 0.7)
  const volume = showVolume && maxVolume > 0
    ? bars.map((bar, index) => {
        const barHeight = Math.max(1, ((bar.volume ?? 0) / maxVolume) * (volumeHeight - 6))
        return { x: x(index) - barWidth / 2, y: bottom + volumeHeight - barHeight, width: barWidth, height: barHeight }
      })
    : []

  return {
    width,
    height,
    plotRight: PAD.left + plotWidth,
    plotWidth,
    top: PAD.top,
    bottom,
    x,
    y,
    line,
    area,
    volume,
    previousY: previous == null ? null : y(previous),
    ticks: niceTicks(low, high, Y_TICK_TARGET)
      .filter((value) => value >= low && value <= high)
      .map((value) => ({ value, y: y(value) })),
    dates: dateTicks(bars, x),
  }
}

export function indexAtPointer(offsetX, geometry, count) {
  const ratio = (offsetX - PAD.left) / geometry.plotWidth
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))))
}
