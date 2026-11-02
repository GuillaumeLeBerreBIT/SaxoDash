import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBankTransactions, useUpdateBankTransactionCategory } from '../api/queries'
import { fmtDate, fmtEur, fmtNum } from '../lib/format'
import { Input, PageHeader, QueryState, Select, StatRow, StatStrip } from '../components/ui'
import BankTransactionsTable from '../components/BankTransactionsTable'
import { CATEGORY_LABELS } from '../lib/categories'
import {
  TRANSFER_CATEGORIES,
  filterSpending,
  filterTransactions,
  netSpend,
  paginate,
  spendTotal,
  spendingCategories,
} from '../lib/accountTransactions'
import { validDate } from '../lib/transactionFilters'

function periodText(from, to) {
  const start = validDate(from) ? fmtDate(from) : null
  const end = validDate(to) ? fmtDate(to) : null
  if (start && end) return `${start} – ${end}`
  return start ? `From ${start}` : end ? `Until ${end}` : null
}

export default function SpendingTransactions() {
  const [params, setParams] = useSearchParams()
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const requested = params.get('category') ?? ''
  const category = Object.hasOwn(CATEGORY_LABELS, requested) && !TRANSFER_CATEGORIES.includes(requested) ? requested : 'ALL'

  const { data, isLoading, error, refetch } = useBankTransactions()
  const updateCategory = useUpdateBankTransactionCategory()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const paramsKey = params.toString()
  const [seenKey, setSeenKey] = useState(paramsKey)
  if (seenKey !== paramsKey) {
    setSeenKey(paramsKey)
    setSearch('')
    setPage(1)
  }

  const inPeriod = data ? filterSpending(data, { from, to }) : []
  const spendCategories = spendingCategories(inPeriod)
  const scope =
    category === 'ALL'
      ? inPeriod.filter((tx) => spendCategories.includes(tx.effective_category))
      : filterSpending(data ?? [], { category, from, to })
  const matching = filterTransactions(scope, { search, category: 'ALL' })
  const paged = paginate(matching, page)
  const presentCategories = [...new Set([...spendCategories, ...(category === 'ALL' ? [] : [category])])]
  const filtering = search !== ''

  const changeSearch = (value) => {
    setSearch(value)
    setPage(1)
  }
  const changeCategory = (value) => {
    const next = new URLSearchParams(params)
    if (value === 'ALL') next.delete('category')
    else next.set('category', value)
    setParams(next)
    setPage(1)
  }
  const clearFilters = () => {
    setSearch('')
    setPage(1)
  }

  const net = netSpend(scope) + 0
  const credit = category !== 'ALL' && net < 0
  const period = periodText(from, to)
  const subtitle = (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link to="/spending" className="inline-flex items-center gap-1 min-h-11 md:min-h-0 text-zinc-400 hover:text-zinc-200">
        <ChevronLeft size={14} /> Back to Spending
      </Link>
      {period && <span>{period}</span>}
    </span>
  )

  return (
    <div className="space-y-4">
      <PageHeader title={category === 'ALL' ? 'All spending' : CATEGORY_LABELS[category]} subtitle={subtitle} />
      <QueryState isLoading={isLoading || (!data && !error)} error={error} onRetry={refetch} label="transactions">
        <StatStrip>
          <StatRow label="Transactions (incl. refunds)" value={fmtNum(scope.length)} />
          <StatRow
            label={category === 'ALL' ? 'Total spend' : credit ? 'Net credit' : 'Net spend'}
            value={fmtEur(category === 'ALL' ? spendTotal(scope) : Math.abs(net))}
            lead
          />
        </StatStrip>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Search transactions"
            placeholder="Search transactions"
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            className="w-full sm:w-64 h-11 md:h-9"
          />
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => changeCategory(e.target.value)}
            className="h-11 md:h-9"
          >
            <option value="ALL">All categories</option>
            {presentCategories.map((code) => (
              <option key={code} value={code}>{CATEGORY_LABELS[code] ?? code}</option>
            ))}
          </Select>
        </div>
        <BankTransactionsTable
          paged={paged}
          hasAny={scope.length > 0}
          filtering={filtering}
          onClearFilters={clearFilters}
          onPage={setPage}
          onCategoryChange={updateCategory.mutate}
          emptyText="No spending in this period."
        />
      </QueryState>
    </div>
  )
}
