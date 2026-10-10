import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBankAccounts, useBankTransactions, useUpdateBankTransactionCategory } from '../api/queries'
import { fmtEur } from '../lib/format'
import { Card, EmptyState, Input, PageHeader, Select, StatRow, StatStrip } from '../components/ui'
import BankTransactionsTable from '../components/BankTransactionsTable'
import { CATEGORY_LABELS } from '../lib/categories'
import { filterTransactions, paginate } from '../lib/accountTransactions'

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
      <BankTransactionsTable
        paged={paged}
        hasAny={data.length > 0}
        filtering={filtering}
        onClearFilters={clearFilters}
        onPage={setPage}
        onCategoryChange={updateCategory.mutate}
      />
    </div>
  )
}
