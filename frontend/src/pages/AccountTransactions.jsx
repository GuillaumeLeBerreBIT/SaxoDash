import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBankAccounts, useBankTransactions, useUpdateBankTransactionCategory } from '../api/queries'
import { fmtEur } from '../lib/format'
import { Card, EmptyState, Input, QueryState, Select, Tile } from '../components/ui'
import { BOARD, SPAN_12, TILES } from '../components/money/layout'
import BankTransactionsTable from '../components/BankTransactionsTable'
import { CATEGORY_LABELS } from '../lib/categories'
import { filterTransactions, paginate } from '../lib/accountTransactions'

export default function AccountTransactions() {
  const { accountId } = useParams()
  const { data, isLoading, error, refetch } = useBankTransactions(`?account=${accountId}`)
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
    <Link to="/money?section=accounts" className="inline-flex items-center gap-1 min-h-11 md:min-h-0 text-ink-2 hover:text-ink">
      <ChevronLeft size={14} aria-hidden="true" /> Back to Accounts
    </Link>
  )

  if (error || isLoading || !data) {
    return (
      <div className={BOARD}>
        <Card className={SPAN_12} context={backLink} dot={error ? 'warn' : 'off'} title={account?.bank ?? 'Account transactions'} titleAs="h1" />
        <div className={`${SPAN_12} min-w-0`}>
          <QueryState isLoading={!error} error={error} onRetry={refetch} label="transactions" />
        </div>
      </div>
    )
  }

  if (accounts && !account) {
    return (
      <div className={BOARD}>
        <Card className={SPAN_12} context={backLink} dot="off" title="Account not found" titleAs="h1">
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
  const filters = (
    <div className="flex flex-wrap gap-2">
      <Input
        aria-label="Search transactions"
        placeholder="Search transactions"
        value={search}
        onChange={(e) => changeSearch(e.target.value)}
        className="w-full sm:w-64 h-11 md:h-8"
      />
      <Select
        aria-label="Filter by category"
        value={category}
        onChange={(e) => changeCategory(e.target.value)}
        className="h-11 md:h-8"
      >
        <option value="ALL">All categories</option>
        {presentCategories.map((code) => (
          <option key={code} value={code}>{CATEGORY_LABELS[code] ?? code}</option>
        ))}
      </Select>
    </div>
  )

  return (
    <div className={BOARD}>
      <Card className={SPAN_12} context={backLink} dot="ok" title={account?.bank ?? 'Account transactions'} titleAs="h1">
        {account && (
          <div className={TILES}>
            <Tile label="Balance" value={fmtEur(account.balance)} sub={account.type} />
            {hasAvailable && <Tile label="Available" value={fmtEur(account.available)} />}
            <Tile label="IBAN" value={account.iban_masked} />
          </div>
        )}
      </Card>
      <BankTransactionsTable
        className={SPAN_12}
        context="Bank transactions"
        right={filters}
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
