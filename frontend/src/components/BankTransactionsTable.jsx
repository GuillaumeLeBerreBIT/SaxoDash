import { fmtDate, fmtEur } from '../lib/format'
import { Button, Card, Th, Td } from './ui'
import { CATEGORY_LABELS } from '../lib/categories'
import { PAGE_SIZE } from '../lib/accountTransactions'

function CategoryCell({ tx, onChange }) {
  return (
    <select
      aria-label={`Category for ${tx.counterparty_name}`}
      value={tx.effective_category}
      onChange={(e) => onChange({ id: tx.id, category: e.target.value })}
      className="bg-transparent text-zinc-400 hover:text-zinc-200 text-[var(--fig-sm)] outline-none cursor-pointer"
    >
      {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
        <option key={code} value={code} className="bg-zinc-900">{label}</option>
      ))}
    </select>
  )
}

export default function BankTransactionsTable({
  paged,
  hasAny,
  filtering,
  onClearFilters,
  onPage,
  onCategoryChange,
  emptyText = 'No transactions yet.',
}) {
  const first = (paged.page - 1) * PAGE_SIZE + 1
  const last = first + paged.rows.length - 1

  return (
    <Card padding={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-[var(--fig-sm)]">
          <thead>
            <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
              <Th edge>Date</Th>
              <Th>Description</Th>
              <Th hideBelow="md">Category</Th>
              <Th align="right" edge>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((tx) => (
              <tr key={tx.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                <Td edge className="num text-zinc-300">{fmtDate(tx.booking_date)}</Td>
                <Td className="w-full max-w-0 text-zinc-100">
                  <div className="truncate">{tx.counterparty_name}</div>
                  {tx.description && tx.description !== tx.counterparty_name && (
                    <div title={tx.description} className="truncate text-[var(--fig-2xs)] text-zinc-500">{tx.description}</div>
                  )}
                  <div className="md:hidden">
                    <CategoryCell tx={tx} onChange={onCategoryChange} />
                  </div>
                </Td>
                <Td hideBelow="md"><CategoryCell tx={tx} onChange={onCategoryChange} /></Td>
                <Td
                  align="right"
                  edge
                  className={`num font-medium ${Number(tx.amount) > 0 ? 'text-emerald-400' : 'text-zinc-100'}`}
                >
                  {fmtEur(tx.amount, { sign: true })}
                </Td>
              </tr>
            ))}
            {!hasAny && (
              <tr>
                <td colSpan={4} className="text-center text-zinc-500 py-8">{emptyText}</td>
              </tr>
            )}
            {hasAny && paged.total === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-zinc-500 py-8">
                  No transactions match your filters.
                  {filtering && (
                    <div className="mt-2">
                      <Button size="sm" onClick={onClearFilters}>Clear filters</Button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paged.pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-zinc-800 text-[var(--fig-sm)] text-zinc-400">
          <span>Showing {first}–{last} of {paged.total}</span>
          <div className="flex gap-2">
            <Button size="sm" className="h-11 md:h-8" aria-label="Previous page" disabled={paged.page <= 1} onClick={() => onPage(paged.page - 1)}>
              Previous
            </Button>
            <Button size="sm" className="h-11 md:h-8" aria-label="Next page" disabled={paged.page >= paged.pageCount} onClick={() => onPage(paged.page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
