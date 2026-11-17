/** Technical indicators for the Research chart.
 *
 *  Every series returned is the same length as its input and holds null for
 *  the leading bars where the indicator has no value yet, so a value at index
 *  i always belongs to bar i and the chart can draw straight from the array.
 */

export function sma(values, period) {
  const out = values.map(() => null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values, period) {
  const out = values.map(() => null)
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < values.length; i++) {
    prev = prev == null ? values[i] : values[i] * k + prev * (1 - k)
    if (i >= period - 1) out[i] = prev
  }
  return out
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period)
  const up = []
  const lo = []

  for (let i = 0; i < values.length; i++) {
    if (mid[i] == null) {
      up.push(null)
      lo.push(null)
      continue
    }
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mid[i]) ** 2
    const sd = Math.sqrt(variance / period)
    up.push(mid[i] + mult * sd)
    lo.push(mid[i] - mult * sd)
  }

  return { mid, up, lo }
}

export function rsi(values, period = 14) {
  const out = values.map(() => null)
  let gain = 0
  let loss = 0

  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    const up = Math.max(0, change)
    const down = Math.max(0, -change)

    if (i <= period) {
      gain += up / period
      loss += down / period
      if (i === period) out[i] = 100 - 100 / (1 + gain / (loss || 1e-9))
    } else {
      gain = (gain * (period - 1) + up) / period
      loss = (loss * (period - 1) + down) / period
      out[i] = 100 - 100 / (1 + gain / (loss || 1e-9))
    }
  }

  return out
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const line = values.map((_, i) =>
    fastEma[i] == null || slowEma[i] == null ? null : fastEma[i] - slowEma[i],
  )

  // The signal is an EMA of the MACD line, which only starts once both EMAs
  // exist - so it is computed over the non-null values and put back in place.
  const defined = line.filter((v) => v != null)
  const signalRaw = ema(defined, signalPeriod)
  const signal = line.map(() => null)
  let k = 0
  line.forEach((v, i) => {
    if (v != null) {
      signal[i] = signalRaw[k]
      k++
    }
  })

  const hist = line.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]))
  return { line, signal, hist }
}

export function vwapSeries(bars) {
  let priceVolume = 0
  let volume = 0
  return bars.map((bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3
    priceVolume += typical * bar.volume
    volume += bar.volume
    return volume === 0 ? null : priceVolume / volume
  })
}

export const RVOL_WINDOW = 20
export const RVOL_ELEVATED = 2

export function relativeVolume(bars, window = RVOL_WINDOW) {
  const minSamples = Math.ceil(window * 0.75)
  return bars.map((bar, i) => {
    if (!(bar.volume > 0)) return null
    const prior = bars
      .slice(Math.max(0, i - window), i)
      .map((b) => b.volume)
      .filter((volume) => volume > 0)
    if (prior.length < minSamples) return null
    return bar.volume / (prior.reduce((sum, volume) => sum + volume, 0) / prior.length)
  })
}

/** Indicators for the last `count` bars, warmed up on the bars before them.
 *
 *  The lagging series need their leading period of history to hold a value at
 *  the first visible bar: MA-50 over a 22-bar month is otherwise entirely null
 *  even when the fifty bars it needs were already fetched.
 *
 *  VWAP is deliberately not warmed up. It is cumulative, so running it from
 *  the widest fetch would silently turn a one-week VWAP into a two-year one;
 *  it stays anchored to the range on screen.
 */
export function computeIndicatorsForRange(bars, count) {
  const shown = count == null ? bars.length : Math.min(count, bars.length)
  return computeIndicatorsForWindow(bars, { start: bars.length - shown, end: bars.length })
}

export function computeIndicatorsForWindow(bars, { start, end }) {
  const closes = bars.map((bar) => bar.close)
  const cut = (series) => series.slice(start, end)
  const cutEach = (group) => Object.fromEntries(Object.entries(group).map(([key, series]) => [key, cut(series)]))

  return {
    ma20: cut(sma(closes, 20)),
    ma50: cut(sma(closes, 50)),
    ma200: cut(sma(closes, 200)),
    ema9: cut(ema(closes, 9)),
    bb: cutEach(bollinger(closes)),
    rsi: cut(rsi(closes)),
    macd: cutEach(macd(closes)),
    vwap: vwapSeries(bars.slice(start, end)),
    rvol: cut(relativeVolume(bars)),
  }
}

export function computeIndicators(bars) {
  return computeIndicatorsForRange(bars, bars.length)
}

export const HIGH_WINDOW = 252

export function rollingHigh(bars, window = HIGH_WINDOW) {
  return bars.map((_, i) => {
    if (i + 1 < window) return null
    let high = -Infinity
    for (let k = i + 1 - window; k <= i; k++) high = Math.max(high, bars[k].high)
    return high
  })
}

export const GAP_BOX_SESSIONS = 60
export const GAP_LOOKBACK = 252
const GAP_MIN_MOVE = 0.04
const GAP_HOLD = 0.98
const GAP_HEAVY = 2

export function volumeGaps(bars) {
  const first = Math.max(RVOL_WINDOW, bars.length - GAP_LOOKBACK)
  const gaps = []
  for (let i = first; i < bars.length; i++) {
    let sum = 0
    for (let k = i - RVOL_WINDOW + 1; k <= i; k++) sum += bars[k].volume || 0
    const usual = sum / RVOL_WINDOW || 1
    const bar = bars[i]
    const previous = bars[i - 1].close
    if (!((bar.volume || 0) > GAP_HEAVY * usual)) continue
    const up = bar.open > (1 + GAP_MIN_MOVE) * previous && bar.close > GAP_HOLD * bar.open
    const down = bar.open < (1 - GAP_MIN_MOVE) * previous
    if (!up && !down) continue
    const limit = Math.min(i + GAP_BOX_SESSIONS, bars.length - 1)
    let end = limit
    let filled = false
    for (let k = i + 1; k <= limit; k++) {
      if (up ? bars[k].low <= previous : bars[k].high >= previous) {
        end = k
        filled = true
        break
      }
    }
    gaps.push({ index: i, up, from: previous, to: bar.open, end, filled, rvol: (bar.volume || 0) / usual })
  }
  return gaps
}
