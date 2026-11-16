const ORDINAL = ['first', 'second', 'third', 'fourth']
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

const quarterWords = (iso) => `${ORDINAL[Math.floor((Number(String(iso).slice(5, 7)) - 1) / 3)]} quarter`
const word = (n) => WORDS[n] ?? String(n)
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)

export function investorsHeadline(hub, followed) {
  if (!hub) return null
  if (!hub.quarter) return `No filings imported yet for the ${hub.tracked} funds you track.`
  const newest = hub.newest_quarter ?? hub.quarter
  const filed = newest === hub.quarter ? hub.filed : hub.newest_filed
  const base = `${filed} of ${hub.tracked} funds have filed for the ${quarterWords(newest)}`
  const following = followed ?? []
  if (following.length === 0) return `${base}.`
  const done = following.filter((investor) => investor.latest_quarter === newest).length
  if (following.length === 1) return done ? `${base}, including the one you follow.` : `${base}. The one you follow has not yet.`
  if (done === following.length) return `${base}, including all ${word(following.length)} you follow.`
  if (done === 0) return `${base}. The ${word(following.length)} you follow have not yet.`
  return `${base}. ${capital(word(done))} of the ${word(following.length)} you follow ${done === 1 ? 'has' : 'have'}.`
}

const positions = (n) => `${n} position${n === 1 ? '' : 's'}`

export function personSentence(investor, held) {
  if (investor.new_count == null) return ''
  const closed = investor.exited_count ? String(investor.exited_count) : 'none'
  const moves = `Last quarter they opened ${positions(investor.new_count)} and closed ${closed}.`
  const owned = (investor.top_holdings ?? []).filter((holding) => holding.ticker && held.has(holding.ticker)).length
  if (owned === 0) return moves
  return owned === 1
    ? `${moves} One of their biggest holdings is one you own.`
    : `${moves} ${capital(word(owned))} of their biggest holdings are ones you own.`
}

export function copyLine(investor) {
  const edge = investor.copy_excess_cagr_pct
  if (edge == null) return null
  return `Copying them ran ${Math.abs(edge).toFixed(1)} points a year ${edge >= 0 ? 'ahead of' : 'behind'} the S&P 500`
}

export function flowLine(item, field, owned) {
  const parts = [`${item[field]} funds ${field}`]
  if (field === 'bought' && item.new) parts.push(`${item.new} new`)
  if (owned) parts.push('you own it')
  return parts.join(' · ')
}
