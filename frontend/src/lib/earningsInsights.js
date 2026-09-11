/** Rule-based "what changed" reads from quarterly EPS/margin/revenue-per-share
 *  trends. Pure and tested in isolation - the component only renders what
 *  these return. `revenue_per_share` is a per-share proxy (Finnhub's
 *  salesPerShare); every sentence says so, never bare "revenue". */

const YOY_LOOKBACK = 4
const ACCEL_THRESHOLD_PP = 3
const EPS_GAP_THRESHOLD_PP = 5
const MARGIN_MOVE_THRESHOLD_PP = 1
export const QUARTERLY_MIN_POINTS = 8

export function yoyGrowthSeries(values) {
  return values.map((value, i) => {
    if (i < YOY_LOOKBACK) return null
    const anchor = values[i - YOY_LOOKBACK]
    if (value == null || !anchor) return null
    return ((value - anchor) / Math.abs(anchor)) * 100
  })
}

const pct = (v) => Math.round(v * 10) / 10

export function buildEarningsInsights(trends) {
  if (!trends || trends.length < QUARTERLY_MIN_POINTS) return []

  const revGrowth = yoyGrowthSeries(trends.map((t) => t.revenue_per_share))
  const epsGrowth = yoyGrowthSeries(trends.map((t) => t.eps))
  const latest = trends.length - 1
  const prior = latest - 1

  const insights = []

  if (revGrowth[latest] != null && revGrowth[prior] != null) {
    const diff = revGrowth[latest] - revGrowth[prior]
    if (diff > ACCEL_THRESHOLD_PP) {
      insights.push({
        tone: 'pos',
        text: `Revenue per share growth accelerated from ${pct(revGrowth[prior])}% to ${pct(revGrowth[latest])}% year over year.`,
      })
    } else if (diff < -ACCEL_THRESHOLD_PP) {
      insights.push({
        tone: 'caution',
        text: `Revenue per share growth decelerated from ${pct(revGrowth[prior])}% to ${pct(revGrowth[latest])}% year over year.`,
      })
    } else {
      insights.push({
        tone: 'neutral',
        text: `Revenue per share growth held steady around ${pct(revGrowth[latest])}% year over year.`,
      })
    }
  }

  if (epsGrowth[latest] != null && revGrowth[latest] != null) {
    const gap = epsGrowth[latest] - revGrowth[latest]
    if (gap > EPS_GAP_THRESHOLD_PP) {
      insights.push({ tone: 'pos', text: 'EPS grew faster than revenue per share, consistent with margin expansion.' })
    } else if (gap < -EPS_GAP_THRESHOLD_PP) {
      insights.push({ tone: 'caution', text: 'EPS grew slower than revenue per share, consistent with margin pressure.' })
    }
  }

  const marginField =
    trends[latest].operating_margin != null && trends[latest - YOY_LOOKBACK]?.operating_margin != null
      ? ['operating_margin', 'Operating']
      : trends[latest].net_margin != null && trends[latest - YOY_LOOKBACK]?.net_margin != null
        ? ['net_margin', 'Net']
        : null
  if (marginField) {
    const [key, label] = marginField
    const before = trends[latest - YOY_LOOKBACK][key]
    const after = trends[latest][key]
    const delta = after - before
    if (delta > MARGIN_MOVE_THRESHOLD_PP) {
      insights.push({ tone: 'pos', text: `${label} margin expanded from ${pct(before)}% to ${pct(after)}% year over year.` })
    } else if (delta < -MARGIN_MOVE_THRESHOLD_PP) {
      insights.push({ tone: 'caution', text: `${label} margin contracted from ${pct(before)}% to ${pct(after)}% year over year.` })
    }
  }

  return insights.slice(0, 3)
}
