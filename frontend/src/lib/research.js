/** Pure helpers for the Research page.
 *
 *  Kept out of the components so the fiddly parts - which instrument a symbol
 *  actually refers to, how a range maps onto a candle count - can be tested
 *  without rendering a chart.
 */

export const INTERVALS = ['1W', '1M', '3M', '6M', '1Y', 'ALL']

// Trading days, not calendar days: Saxo returns one daily candle per session.
export const RANGE_COUNTS = { '1W': 7, '1M': 22, '3M': 66, '6M': 130, '1Y': 252, ALL: 504 }

// Saxo's Horizon is in minutes; 1440 is one daily candle. The backend admits
// daily and coarser only - a bar is identified by its date.
export const DAILY_HORIZON = 1440

/** One instrument's identity, for a cache key on either side of the seam.
 *
 *  A Uic is ambiguous without its AssetType - a CFD shares a Uic with its
 *  underlying by design - and the backend keys on both, so the frontend keys
 *  that dropped it were pointing two instruments at one cache entry.
 */
export function instrumentKey(uic, assetType) {
  return uic == null ? null : `${uic}:${assetType ?? ''}`
}

/** Watchlist rows grouped by the asset type they carry.
 *
 *  Saxo prices one asset type per request. Testing one spelling ("not an ETF
 *  means a stock") put a bond in the Stock batch, and the 404 that followed
 *  blanked every row in it rather than the one that could not be priced.
 */
export function uicsByAssetType(items = []) {
  const groups = new Map()
  for (const item of items) {
    if (!item.uic || !item.asset_type) continue
    const uics = groups.get(item.asset_type) ?? []
    uics.push(item.uic)
    groups.set(item.asset_type, uics)
  }
  return [...groups].map(([assetType, uics]) => ({ assetType, uics }))
}

/** Saxo's spelling of an instrument's type.
 *
 *  Position.type is the app's own STOCK/ETF label and Saxo says Stock/Etf, so
 *  it cannot be passed through. Synced positions carry Saxo's own asset_type;
 *  this only has to guess for rows that predate that sync.
 */
export function saxoAssetType(position) {
  if (!position) return null
  if (position.asset_type) return position.asset_type
  return position.type === 'ETF' ? 'Etf' : 'Stock'
}

/** The {uic, assetType, exact} triple every market-data call needs, or null.
 *
 *  A held instrument answers this from the portfolio without a Saxo call. For
 *  anything else - or a position synced before uic existed - the first search
 *  result stands in. `exact` says whether the symbol actually matched, so an
 *  inexact fallback can be shown rather than charted silently.
 */
export function resolveInstrument({ symbol, positions = [], results = [] }) {
  const held = positions.find((p) => p.ticker === symbol)
  if (held?.uic) return { uic: held.uic, assetType: saxoAssetType(held), exact: true }

  const exactMatch = results.find((r) => r.symbol === symbol)
  const match = exactMatch ?? results[0]
  if (match?.uic) {
    return { uic: match.uic, assetType: match.asset_type, exact: Boolean(exactMatch) }
  }

  return null
}

/** Quotes keyed by uic, so a list of rows is O(1) per lookup rather than O(n). */
export function quotesByUic(quotes = []) {
  return new Map(quotes.map((quote) => [quote.uic, quote]))
}

/** Percentage move from the first to the last bar of the loaded range. */
export function periodChange(bars = []) {
  if (bars.length < 2) return null
  const first = bars[0].close
  if (!first) return null
  return ((bars[bars.length - 1].close - first) / first) * 100
}

/** What the loaded candles alone can say about an instrument.
 *
 *  Deliberately scoped to the range on screen rather than labelled 52-week:
 *  the numbers are only as wide as the bars that were actually fetched.
 */
export function rangeStats(bars = []) {
  if (bars.length === 0) return null

  let high = -Infinity
  let low = Infinity
  let volume = 0

  for (const bar of bars) {
    if (bar.high > high) high = bar.high
    if (bar.low < low) low = bar.low
    volume += bar.volume
  }

  const last = bars[bars.length - 1].close
  return {
    high,
    low,
    last,
    avgVolume: volume / bars.length,
    // Where the last close sits between the low and the high, as a percentage.
    positionInRange: high === low ? 100 : ((last - low) / (high - low)) * 100,
  }
}

/** Percentage move of one bar against the one before it. */
export function barChange(bars = [], index) {
  const at = index ?? bars.length - 1
  const bar = bars[at]
  const previous = bars[at - 1]
  if (!bar || !previous || !previous.close) return null
  return ((bar.close - previous.close) / previous.close) * 100
}
