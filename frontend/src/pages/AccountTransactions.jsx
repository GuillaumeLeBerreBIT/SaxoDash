import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBankAccounts, useBankTransactions, useUpdateBankTransactionCategory } from '../api/queries'
import { fmtDate, fmtEur } from '../lib/format'
import { Button, Card, EmptyState, Input, PageHeader, Select, StatRow, StatStrip, Th, Td } from '../components/ui'
import { CATEGORY_LABELS } from '../lib/categories'
import { PAGE_SIZE, filterTransactions, paginate } from '../lib/accountTransactions'

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

export default function AccountTransactions() {
  const { accountId } = useParams()
  const { data, isLoading, error } = useBankTransactions(`?account=${accountId}`)
  // A drill-down page needs to confirm which account you're looking at -
  // the page previously showed no bank name, IBAN, or balance at all, so
  // clicking a tile and landing here lost that context entirely.
  const { data: accounts } = useBankAccounts()
  const account = accounts?.find((a) => String(a.id) === accountId)
  const updateCategory = useUpdateBankTransactionCategory()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [page, setPage] = useState(1)

  const backLink = (
    <Link to="/accounts" className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
      <ChevronLeft size={14} /> Back to Accounts
    </Link>
  )

  if (error) return <div className="text-red-400 text-sm">Failed to load transactions</div>
  if (isLoading || !data) return <div className="text-zinc-500 text-sm">Loading…</div>

  if (accounts && !account) {
    return (
      <div className="space-y-4">
        <PageHeader title="Account not found" subtitle={backLink} />
        <Card>
          <EmptyState title="No account with this id" />
        </Card>
      </div>
    )
  }

  const filtered = filterTransactions(data, { search, category })
  const paged = paginate(filtered, page)
  const presentCategories = [...new Set(data.map((tx) => tx.effective_category))]
  const filtering = search !== '' || category !== 'ALL'
  const first = (paged.page - 1) * PAGE_SIZE + 1
  const last = first + paged.rows.length - 1

  const changeSearch = (value) => {
    setSearch(value)
    setPage(1)
  }
  const changeCategory = (value) => {
    setCategory(value)
    setPage(1)
  }
  const clearFilters = () => {
    setSearch('')
    setCategory('ALL')
    setPage(1)
  }

  const hasAvailable = account && Number(account.available) !== Number(account.balance)

  return (
    <div className="space-y-4">
      <PageHeader
        title={account?.bank ?? 'Account transactions'}
        subtitle={backLink}
      />
      {account && (
        <StatStrip>
          <StatRow label="Balance" value={fmtEur(account.balance)} note={account.type} lead />
          {hasAvailable && <StatRow label="Available" value={fmtEur(account.available)} />}
          <StatRow label="IBAN" value={account.iban_masked} />
        </StatStrip>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search transactions"
          placeholder="Search transactions"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <Select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => changeCategory(e.target.value)}
        >
          <option value="ALL">All categories</option>
          {presentCategories.map((code) => (
            <option key={code} value={code}>{CATEGORY_LABELS[code] ?? code}</option>
          ))}
        </Select>
      </div>
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
                      <CategoryCell tx={tx} onChange={updateCategory.mutate} />
                    </div>
                  </Td>
                  <Td hideBelow="md"><CategoryCell tx={tx} onChange={updateCategory.mutate} /></Td>
                  <Td
                    align="right"
                    edge
                    className={`num font-medium ${Number(tx.amount) > 0 ? 'text-emerald-400' : 'text-zinc-100'}`}
                  >
                    {fmtEur(tx.amount, { sign: true })}
                  </Td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-zinc-500 py-8">No transactions yet.</td>
                </tr>
              )}
              {data.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-zinc-500 py-8">
                    No transactions match your filters.
                    {filtering && (
                      <div className="mt-2">
                        <Button size="sm" onClick={clearFilters}>Clear filters</Button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {paged.pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-[var(--fig-sm)] text-zinc-400">
            <span>Showing {first}–{last} of {paged.total}</span>
            <div className="flex gap-2">
              <Button size="sm" aria-label="Previous page" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
                Previous
              </Button>
              <Button size="sm" aria-label="Next page" disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
