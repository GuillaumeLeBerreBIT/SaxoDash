const DAY = 86_400_000

/** Split date-sorted calendar events into display buckets relative to today.
 *  Offsets are whole days from local midnight. */
export function bucketEarnings(events, today = new Date()) {
  const midnight = new Date(today).setHours(0, 0, 0, 0)
  const buckets = { recent: [], thisWeek: [], nextWeek: [], later: [] }

  for (const event of events) {
    const days = Math.floor((new Date(event.date + 'T00:00:00').getTime() - midnight) / DAY)
    if (days < 0) buckets.recent.push(event)
    else if (days < 7) buckets.thisWeek.push(event)
    else if (days < 14) buckets.nextWeek.push(event)
    else buckets.later.push(event)
  }
  return buckets
}

export const BUCKET_ORDER = [
  ['recent', 'Recent'],
  ['thisWeek', 'Next 7 days'],
  ['nextWeek', 'In 8–14 days'],
  ['later', 'Later this month'],
]
