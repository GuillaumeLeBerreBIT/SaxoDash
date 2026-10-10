import { fmtPct } from './format'
import { quarterLabel, visibleInvestors } from './investors'

export const STYLE_ORDER = ['Value', 'Growth', 'Activist', 'Macro', 'Tech', 'Concentrated', 'Contrarian', 'Quant']
export const STOCK_VIEWS = [['bought', 'Most bought'], ['sold', 'Most sold'], ['owned', 'Most owned'], ['new', 'New positions']]
export const MOVE_GROUPS = [['new', 'New'], ['added', 'Added'], ['trimmed', 'Trimmed'], ['sold_out', 'Sold out']]
export const MOVES_SHOWN = 8

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })
const whole = (value) => Math.round(Math.abs(value))

export function directoryChips(cards) {
  const present = new Set(cards.flatMap((card) => card.styles ?? []))
  const styles = STYLE_ORDER.filter((style) => present.has(style)).map((style) => [style, style])
  return [['all', 'All'], ['following', 'Following'], ...styles, ['stale', 'Stopped filing']]
}

const CHIP_TESTS = {
  all: () => true,
  following: (card) => card.followed,
  stale: (card) => card.stale,
}

const chipTest = (chip) =>
  CHIP_TESTS[chip] ?? (STYLE_ORDER.includes(chip) ? (card) => (card.styles ?? []).includes(chip) : CHIP_TESTS.all)

export function directoryInvestors(cards, { chip = 'all', query = '', sort = 'value', holderSlugs = new Set() }) {
  return visibleInvestors(cards.filter(chipTest(chip)), { group: 'all', query, sort, holderSlugs })
}

export function initials(name) {
  const words = name.split(/\s+/).filter((word) => /^[\p{L}]/u.test(word))
  if (words.length === 0) return ''
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return picked.map((word) => word[0].toUpperCase()).join('')
}

const MOVE_SENTENCES = {
  new: (move) => `Opened a ${share(move.weight)} position`,
  added: (move) =>
    `${move.shares_change_pct == null ? 'Added shares' : `Added ${whole(move.shares_change_pct)}% more shares`} · now ${share(move.weight)}`,
  trimmed: (move) =>
    `${move.shares_change_pct == null ? 'Cut shares' : `Cut shares by ${whole(move.shares_change_pct)}%`} · now ${share(move.weight)}`,
  sold_out: (move) => `Sold out · was ${share(move.previous_weight)}`,
}

export const moveSentence = (move) => MOVE_SENTENCES[move.kind](move)

export function groupMoves(moves) {
  return MOVE_GROUPS
    .map(([kind, title]) => ({ kind, title, items: moves.filter((move) => move.kind === kind) }))
    .filter((group) => group.items.length > 0)
}

const SIGNAL_SENTENCES = {
  'convergent-buys': (item) => `${item.bought} funds bought${item.new ? ` · ${item.new} new` : ''}`,
  'most-sold': (item) => `${item.sold} funds sold`,
  'new-bets': (item) => `New ${share(item.weight)} position · ${item.investors[0].name}`,
}

export const signalSentence = (shelfKey, item) => SIGNAL_SENTENCES[shelfKey](item)

const SEE_ALL = {
  'convergent-buys': '/investors/stocks?view=bought',
  'most-sold': '/investors/stocks?view=sold',
  'new-bets': '/investors/stocks?view=new',
  following: '/investors?chip=following#directory',
  'just-filed': '/investors?sort=filed#directory',
}

export const seeAllTarget = (shelf) => SEE_ALL[shelf.key]

export function hubSubtitle(hub) {
  if (!hub) return '13F holdings of well-known investors'
  if (!hub.quarter) return `${hub.tracked} tracked · no filings imported yet`
  const base = `${hub.tracked} tracked · signals for ${quarterLabel(hub.quarter)} · ${hub.filed} of ${hub.tracked} filed`
  return hub.newest_quarter === hub.quarter
    ? base
    : `${base} · ${hub.newest_filed} have filed ${quarterLabel(hub.newest_quarter)}`
}

export const stockLabel = (item) => item.ticker ?? item.issuer
