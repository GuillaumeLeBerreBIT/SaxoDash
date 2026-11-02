import { fmtDate, fmtEur } from '../lib/format'
import { Button, Card, Th, Td, Tr } from './ui'
import { CATEGORY_LABELS } from '../lib/categories'
import { PAGE_SIZE } from '../lib/accountTransactions'

function CategoryCell({ tx, onChange }) {
  return (
    <select
      aria-label={`Category for ${tx.counterparty_name}`}
      value={tx.effective_category}
      onChange={(e) => onChange({ id: tx.id, category: e.target.value })}
      className="bg-transparent text-ink-2 hover:text-ink text-[13px] cursor-pointer rounded-[7px]"
    >
      {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
        <option key={code} value={code} className="bg-raised text-ink">{label}</option>
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
  className = '',
  context,
  title,
  titleAs,
  right,
}) {
  const first = (paged.page - 1) * PAGE_SIZE + 1
  const last = first + paged.rows.length - 1

  return (
    <Card flush className={className} context={context} title={title} titleAs={titleAs} right={right}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th edge>Date</Th>
              <Th>Description</Th>
              <Th hideBelow="md">Category</Th>
              <Th align="right" edge>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((tx) => (
              <Tr key={tx.id}>
                <Td edge className="num text-ink-2">{fmtDate(tx.booking_date)}</Td>
                <Td className="w-full max-w-0 text-ink">
                  <div className="truncate">{tx.counterparty_name}</div>
                  {tx.description && tx.description !== tx.counterparty_name && (
                    <div title={tx.description} className="truncate text-[12px] text-ink-3">{tx.description}</div>
                  )}
                  <div className="md:hidden">
                    <CategoryCell tx={tx} onChange={onCategoryChange} />
                  </div>
                </Td>
                <Td hideBelow="md"><CategoryCell tx={tx} onChange={onCategoryChange} /></Td>
                <Td
                  align="right"
                  edge
                  className={`font-semibold ${Number(tx.amount) > 0 ? 'text-up' : 'text-ink'}`}
                >
                  {fmtEur(tx.amount, { sign: true })}
                </Td>
              </Tr>
            ))}
            {!hasAny && (
              <tr className="border-t border-line">
                <td colSpan={4} className="text-center text-[13.5px] text-ink-3 py-8">{emptyText}</td>
              </tr>
            )}
            {hasAny && paged.total === 0 && (
              <tr className="border-t border-line">
                <td colSpan={4} className="text-center text-[13.5px] text-ink-3 py-8">
                  No transactions match your filters.
                  {filtering && (
                    <div className="mt-2">
                      <Button size="sm" className="h-11 md:h-8" onClick={onClearFilters}>Clear filters</Button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paged.pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pt-3 border-t border-line text-[13px] text-ink-2 num">
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
