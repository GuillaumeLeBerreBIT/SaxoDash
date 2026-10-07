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
