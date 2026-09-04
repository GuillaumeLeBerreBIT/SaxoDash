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
  const visible = count == null || bars.length <= count ? bars : bars.slice(-count)
  const from = bars.length - visible.length
  const closes = bars.map((bar) => bar.close)

  const tail = (series) => series.slice(from)
  const tailEach = (group) =>
    Object.fromEntries(Object.entries(group).map(([key, series]) => [key, tail(series)]))

  return {
    ma20: tail(sma(closes, 20)),
    ma50: tail(sma(closes, 50)),
    ema9: tail(ema(closes, 9)),
    bb: tailEach(bollinger(closes)),
    rsi: tail(rsi(closes)),
    macd: tailEach(macd(closes)),
    vwap: vwapSeries(visible),
  }
}

export function computeIndicators(bars) {
  return computeIndicatorsForRange(bars, bars.length)
}
