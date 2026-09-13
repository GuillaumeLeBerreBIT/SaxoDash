/** Pure helpers for the Research page.
 *
 *  Kept out of the components so the fiddly parts - which instrument a symbol
 *  actually refers to, how a range maps onto a candle count - can be tested
 *  without rendering a chart.
 */

import { surpriseSign } from './charts'

/** A range and how many bars it spans, in one place.
 *
 *  Trading days, not calendar days: Saxo returns one daily candle per session.
 */
export const RANGES = [
  { key: '1W', bars: 7 },
  { key: '1M', bars: 22 },
  { key: '3M', bars: 66 },
  { key: '6M', bars: 130 },
  { key: '1Y', bars: 252 },
  // Saxo's own per-call ceiling (CHART_MAX_COUNT in backend/saxo/client.py),
  // not literal IPO-to-date history.
  { key: 'ALL', bars: 1200 },
]

export const INTERVALS = RANGES.map((range) => range.key)
export const RANGE_COUNTS = Object.fromEntries(RANGES.map((r) => [r.key, r.bars]))
export const WIDEST_RANGE_COUNT = Math.max(...RANGES.map((range) => range.bars))

/** The tail of the widest fetch that a range actually shows.
 *
 *  Every narrower range is a prefix of the widest one, so the page fetches
 *  once and slices: stepping 1W→ALL used to cost six Saxo calls for data the
 *  last one already held.
 */
export function barsForRange(bars = [], range) {
  const count = RANGE_COUNTS[range] ?? WIDEST_RANGE_COUNT
  return bars.length <= count ? bars : bars.slice(-count)
}

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

/** Whether resolving this symbol needs an instrument search at all.
 *
 *  Lives next to `resolveInstrument` rather than in the page, which used to
 *  pass '' as a sentinel meaning "do not search" - and only worked because
 *  the caller knew the hook disables below two characters.
 */
export function needsInstrumentSearch(symbol, positions = []) {
  if (!symbol) return false
  return !positions.find((p) => p.ticker === symbol)?.uic
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

// A bare ticker isn't unique across exchanges - Saxo's own "NOW" search
// returns both ServiceNow (NYSE) and NowVertical (TSX), unordered by
// relevance. Ambiguous ties default to the primary US listing, since that's
// what this app's portfolio and searches are almost always about.
const PRIMARY_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'XNYS', 'XNAS', 'ARCX', 'BATS'])

/** Search results for `symbol`, an exact ticker match first and, among
 *  those, a primary US exchange first - stable otherwise, so ties keep
 *  Saxo's own order. Exported so a results dropdown can show items in the
 *  same order `resolveInstrument` would pick from. */
export function rankInstrumentResults(results = [], symbol) {
  const query = (symbol || '').toUpperCase()
  return [...results].sort((a, b) => {
    const exactDiff = (b.symbol === query) - (a.symbol === query)
    if (exactDiff) return exactDiff
    const aPrimary = PRIMARY_EXCHANGES.has((a.exchange || '').toUpperCase())
    const bPrimary = PRIMARY_EXCHANGES.has((b.exchange || '').toUpperCase())
    return (bPrimary ? 1 : 0) - (aPrimary ? 1 : 0)
  })
}

/** The {uic, assetType, exact} triple every market-data call needs, or null.
 *
 *  A held instrument answers this from the portfolio without a Saxo call.
 *  `pinned` is a specific instrument the caller already disambiguated (e.g.
 *  the exact row a user clicked in a search dropdown) and always wins - it's
 *  the one case where the ambiguity below has already been resolved by a
 *  human. Otherwise the best-ranked search result stands in. `exact` says
 *  whether the symbol actually matched, so an inexact fallback can be shown
 *  rather than charted silently.
 */
export function resolveInstrument({ symbol, positions = [], results = [], pinned = null }) {
  const held = positions.find((p) => p.ticker === symbol)
  if (held?.uic) return { uic: held.uic, assetType: saxoAssetType(held), exact: true }

  if (pinned?.uic) return { uic: pinned.uic, assetType: pinned.assetType, exact: true }

  const [best] = rankInstrumentResults(results, symbol)
  if (best?.uic) {
    return { uic: best.uic, assetType: best.asset_type, exact: best.symbol === symbol }
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

/** Canonical link to the Research page for a symbol, optionally on a tab.
 *  One builder so every "open this company" affordance agrees on the URL.
 *  `instrument` ({uic, assetType}) pins the exact row a caller already
 *  disambiguated - e.g. a search dropdown showing both ServiceNow and
 *  NowVertical under ticker "NOW" - so the ticker's own ambiguity can't
 *  swap in the wrong one once symbol search runs again on arrival. */
export function researchHref(symbol, tab, instrument) {
  const params = new URLSearchParams({ symbol })
  if (tab) params.set('tab', tab)
  if (instrument?.uic) {
    params.set('uic', instrument.uic)
    if (instrument.assetType) params.set('assetType', instrument.assetType)
  }
  return `/research?${params.toString()}`
}

/** Past earnings dates mapped onto the currently-loaded bars, for the
 *  price-chart markers. A history date absent from `bars` (a provider date
 *  landing on a non-trading day) is skipped, not fuzzy-matched. */
export function earningsMarkersForBars(bars = [], history = []) {
  const indexByDate = new Map(bars.map((b, i) => [b.date, i]))
  const markers = []
  for (const e of history) {
    const index = indexByDate.get(e.date)
    if (index == null) continue
    markers.push({
      index, date: e.date, sign: surpriseSign(e.eps_surprise_pct),
      actual: e.eps_actual, estimate: e.eps_estimate,
    })
  }
  return markers
}

export const MAX_PEER_SLOTS = 5

/** Which symbol (if any) shows in each of the fixed peer slots, after
 *  applying manual overrides on top of the auto peer list. Slot order is
 *  preserved; the current symbol and any repeat are dropped. */
export function resolvePeerSlots(currentSymbol, autoSymbols = [], overrides = []) {
  const current = (currentSymbol || '').toUpperCase()
  const seen = new Set([current])
  const slots = []
  for (let slot = 0; slot < MAX_PEER_SLOTS; slot += 1) {
    const override = overrides[slot]
    const candidate = override === null ? null : (override ? override.toUpperCase() : autoSymbols[slot])
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    slots.push({ slot, symbol: candidate })
  }
  return slots
}

/** Index of the first peer slot `resolvePeerSlots` left unfilled, or -1 if
 *  all MAX_PEER_SLOTS are taken. */
export function nextEmptySlot(slots) {
  const filled = new Set(slots.map((s) => s.slot))
  for (let slot = 0; slot < MAX_PEER_SLOTS; slot += 1) {
    if (!filled.has(slot)) return slot
  }
  return -1
}
