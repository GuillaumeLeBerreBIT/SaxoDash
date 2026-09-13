/** Two 0-100 scores per symbol - business quality and how richly it's
 *  priced - so the Peers tab can plot "excellent business, bad price" vs.
 *  "average business, cheap price" instead of leaving that judgment to the
 *  reader. Deliberately simple: reuses the same thresholds `lib/snapshot.js`
 *  already applies to the same fields, so this never disagrees with the
 *  verdict text shown elsewhere on the page. */

import { T } from './snapshot'

/** Linear 0-100 between `low` (weak/cheap edge) and `high` (strong/rich
 *  edge), clamped; `null` when the input is missing rather than guessed. */
function bandScore(value, low, high) {
  if (value == null) return null
  const clamped = Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high))
  return ((clamped - low) / (high - low)) * 100
}

/** Average of ROE, net margin and (inverted) leverage bands - the same
 *  fields `profitabilityVerdict`/`healthVerdict` read, averaged into one
 *  number instead of two separate one-line reads. */
export function qualityScore(f) {
  const parts = [
    bandScore(f.roe, 0, T.roeStrong),
    bandScore(f.net_margin, 0, T.marginStrong),
    f.debt_to_equity == null ? null : 100 - bandScore(f.debt_to_equity, T.deLow, T.deHigh),
  ].filter((v) => v != null)
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null
}

/** Higher = pricier. PEG is the primary read (same bands as
 *  `valuationVerdict`); the P/E-vs-own-history comparison, when available,
 *  nudges the same direction that verdict's text already does. */
export function valuationScore(f) {
  let score = bandScore(f.peg_ratio, T.pegCheap, T.pegRich)
  const hist = f.valuation_history?.pe
  if (hist && f.pe_ratio != null) {
    const base = score ?? 50
    if (f.pe_ratio > hist.median * (1 + T.histBand)) score = Math.min(100, base + 15)
    else if (f.pe_ratio < hist.median * (1 - T.histBand)) score = Math.max(0, base - 15)
  }
  return score
}

/** One quadrant point, or `null` when either axis can't be scored - a
 *  missing point is left off the chart, never guessed at. */
export function quadrantPoint(symbol, f, isSelf = false) {
  const quality = qualityScore(f)
  const valuation = valuationScore(f)
  return quality == null || valuation == null ? null : { symbol, quality, valuation, isSelf }
}
