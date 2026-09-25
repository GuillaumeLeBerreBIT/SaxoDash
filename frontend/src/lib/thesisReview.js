const DAY_MS = 86_400_000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function reviewedLabel(reviewedAt, now = new Date()) {
  if (!reviewedAt) return 'Never reviewed'
  const days = Math.round((startOfDay(now) - startOfDay(new Date(reviewedAt))) / DAY_MS)
  if (days <= 0) return 'Reviewed today'
  if (days === 1) return 'Reviewed yesterday'
  return `Reviewed ${days} days ago`
}
