function pad(n) {
  return String(n).padStart(2, '0')
}

function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function lastOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const PERIOD_PRESETS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
]

export function resolvePeriod(key, now = new Date()) {
  if (key === 'this_month') {
    return {
      date_from: iso(firstOfMonth(now)),
      date_to: iso(now),
      label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    }
  }
  if (key === 'last_month') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return {
      date_from: iso(firstOfMonth(lastMonthDate)),
      date_to: iso(lastOfMonth(lastMonthDate)),
      label: `${MONTH_NAMES[lastMonthDate.getMonth()]} ${lastMonthDate.getFullYear()}`,
    }
  }
  if (key === 'last_3_months') {
    const from = firstOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1))
    return { date_from: iso(from), date_to: iso(now), label: 'Last 3 months' }
  }
  throw new Error(`Unknown period key: ${key}`)
}
