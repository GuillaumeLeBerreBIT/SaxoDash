import { ratingBand } from './ratingBand'

const GRADES = [
  ['strong_sell', 'Strong sell'],
  ['sell', 'Sell'],
  ['hold', 'Hold'],
  ['buy', 'Buy'],
  ['strong_buy', 'Strong buy'],
]

export function analystRating(recommendation) {
  if (!recommendation) return null
  const counts = GRADES.map(([key, label]) => ({ key, label, count: Number(recommendation[key]) || 0 }))
  const total = counts.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return null

  const mean = counts.reduce((sum, row, index) => sum + row.count * (index + 1), 0) / total
  const fraction = (mean - 1) / 4
  return {
    total,
    mean,
    fraction,
    label: GRADES[ratingBand(fraction)][1],
    period: recommendation.period ?? '',
    counts,
  }
}
