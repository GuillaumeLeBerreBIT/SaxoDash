import { fmtMonthYear, fmtShares } from './format'

export const TRANSACTION_LABELS = {
  P: 'Buy',
  S: 'Sell',
  A: 'Award',
  M: 'Option exercise',
  X: 'Option exercise',
  F: 'Tax withholding',
  G: 'Gift',
  C: 'Conversion',
  D: 'Returned to issuer',
}

export const transactionLabel = (code) => TRANSACTION_LABELS[code] ?? 'Other'

export const isOpenMarket = (transaction) => transaction.code === 'P' || transaction.code === 'S'

export const filterTransactions = (transactions, scope = 'open') =>
  scope === 'all' ? (transactions ?? []) : (transactions ?? []).filter(isOpenMarket)

export function insiderName(name) {
  if (!name) return ''
  if (name !== name.toUpperCase()) return name
  return name.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, lead, letter) => lead + letter.toUpperCase())
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export function netActivity(summary) {
  if (!summary || summary.buys + summary.sells === 0) return null
  const net = summary.shares_bought - summary.shares_sold
  const tone = net > 0 ? 'buy' : net < 0 ? 'sell' : 'flat'
  const verb = net > 0 ? 'bought' : net < 0 ? 'sold' : 'bought and sold'
  const amount = net === 0 ? 'the same number of shares' : `${fmtShares(Math.abs(net))} shares net`
  return {
    tone,
    text: `Insiders ${verb} ${amount} over ${plural(summary.sells, 'sale')} and ${plural(summary.buys, 'buy')}`,
  }
}

export const sentimentRows = (sentiment) =>
  (sentiment ?? []).map(({ month, mspr, change }) => ({
    month,
    label: fmtMonthYear(`${month}-01`),
    mspr,
    change,
  }))
