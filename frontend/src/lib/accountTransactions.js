import { localToday } from './periods'
import { validDate } from './transactionFilters'

export const PAGE_SIZE = 25

export function filterTransactions(rows, { search, category }) {
  const needle = (search ?? '').trim().toLowerCase()
  return rows.filter((tx) => {
    if (category && category !== 'ALL' && tx.effective_category !== category) return false
    if (!needle) return true
    return (
      (tx.counterparty_name ?? '').toLowerCase().includes(needle) ||
      (tx.description ?? '').toLowerCase().includes(needle)
    )
  })
}

export function paginate(rows, page, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), page: current, pageCount, total: rows.length }
}

export const TRANSFER_CATEGORIES = ['TRANSFER', 'SAVINGS']

export function filterByPeriod(rows, { from, to }) {
  const start = validDate(from)
  const end = validDate(to)
  return rows.filter((tx) => (!start || tx.booking_date >= start) && (!end || tx.booking_date <= end))
}

export function filterSpending(rows, { category, from, to, today = localToday() }) {
  const bound = validDate(to)
  const end = bound && bound < today ? bound : today
  return filterByPeriod(rows, { from, to: end }).filter(
    (tx) =>
      !TRANSFER_CATEGORIES.includes(tx.effective_category) &&
      (!category || category === 'ALL' || tx.effective_category === category),
  )
}

export function netSpend(rows) {
  const cents = rows.reduce((sum, tx) => sum + Math.round(Number(tx.amount) * 100), 0)
  return -cents / 100
}

function netCentsByCategory(rows) {
  const byCategory = new Map()
  for (const tx of rows) {
    if (TRANSFER_CATEGORIES.includes(tx.effective_category)) continue
    byCategory.set(
      tx.effective_category,
      (byCategory.get(tx.effective_category) ?? 0) + Math.round(Number(tx.amount) * 100),
    )
  }
  return byCategory
}

export function spendingCategories(rows) {
  return [...netCentsByCategory(rows)].filter(([, net]) => net < 0).map(([category]) => category)
}

export function spendTotal(rows) {
  let cents = 0
  for (const net of netCentsByCategory(rows).values()) if (net < 0) cents -= net
  return cents / 100
}
