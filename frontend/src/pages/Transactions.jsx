import { useMemo, useState } from 'react'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactions } from '../api/queries'
import { fmtDate, fmtQty } from '../lib/format'
import { txPrice, txTone, txTotal, txTotalClass, txTypes } from '../lib/transactions'
import { toCsv, TRANSACTION_COLUMNS } from '../lib/csv'
import { Badge, Button, Card, Chip, EmptyState, Input, InstrumentLogo, PageHeader, QueryState, Th, Td } from '../components/ui'

export default function Transactions() {
  const { data, isLoading, error, refetch } = useTransactions('?page_size=1000')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [page, setPage] = useState(1)

  // Stable identity so the filter memo below doesn't rerun on every render
  // while the query is still resolving.
  const allTx = useMemo(() => data ?? [], [data])
  const types = useMemo(() => txTypes(allTx), [allTx])

  const effectiveFilter = types.includes(typeFilter) ? typeFilter : 'All'

  if (effectiveFilter !== typeFilter) {
    setTypeFilter('All')
    setPage(1)
  }

  const filtered = useMemo(
    () =>
      allTx.filter(
        (t) =>
          (effectiveFilter === 'All' || t.type === effectiveFilter) &&
          (search === '' || (t.instrument + t.ticker).toLowerCase().includes(search.toLowerCase()))
      ),
    [allTx, effectiveFilter, search]
  )

  const perPage = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const visible = filtered.slice((page - 1) * perPage, page * perPage)

  function clearFilters() {
    setSearch('')
    setTypeFilter('All')
    setPage(1)
  }

  function handleExport() {
    const blob = new Blob([toCsv(TRANSACTION_COLUMNS, filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error || isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Transactions" subtitle="All account activity" />
        <QueryState isLoading={!error} error={error} onRetry={refetch} label="transactions" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        subtitle="All account activity"
        right={
          <Button onClick={handleExport}>
            <Download size={13} /> Export CSV
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] w-full md:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              <Search size={14} />
            </span>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search instrument or ticker"
              className="w-full pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {types.map((t) => (
              <Chip
                key={t}
                active={effectiveFilter === t}
                onClick={() => {
                  setTypeFilter(t)
                  setPage(1)
                }}
              >
                {t}
              </Chip>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[var(--fig-sm)]">
            <thead>
              <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                <Th edge>Date</Th>
                <Th hideBelow="md">Type</Th>
                <Th>Instrument</Th>
                <Th hideBelow="md">Ticker</Th>
                <Th align="right" hideBelow="md">Qty</Th>
                <Th align="right" hideBelow="md">Price</Th>
                <Th align="right">Total</Th>
                <Th edge hideBelow="md">Account</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <Td edge className="num text-zinc-300">{fmtDate(t.date)}</Td>
                  <Td hideBelow="md">
                    <Badge tone={txTone(t.type)}>{t.type}</Badge>
                  </Td>
                  <Td className="w-full max-w-0 md:w-auto md:max-w-none text-zinc-100">
                    <div className="truncate" title={`${t.instrument} (${t.ticker})`}>{t.instrument}</div>
                    <span className="md:hidden block truncate text-[var(--fig-2xs)] text-zinc-500">
                      {[t.type, t.ticker, t.account].filter(Boolean).join(' · ')}
                    </span>
                  </Td>
                  <Td hideBelow="md" className="text-zinc-400 font-medium">
                    <span className="flex items-center gap-2">
                      <InstrumentLogo
                        symbol={t.ticker}
                        size={16}
                        className="rounded-sm"
                        fallback={<span className="w-4 h-4 shrink-0" />}
                      />
                      {t.ticker}
                    </span>
                  </Td>
                  <Td align="right" hideBelow="md" className="num text-zinc-300">{fmtQty(t.qty)}</Td>
                  <Td align="right" hideBelow="md" className="num text-zinc-300">{txPrice(t)}</Td>
                  <Td align="right" className={`num font-medium ${txTotalClass(t)}`}>{txTotal(t)}</Td>
                  <Td edge hideBelow="md" className="text-zinc-400">{t.account}</Td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="No transactions match your filters." />
                    {(search !== '' || effectiveFilter !== 'All') && (
                      <div className="pb-6 text-center">
                        <Button size="sm" onClick={clearFilters}>Clear filters</Button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 flex items-center justify-between border-t border-zinc-800">
          <div className="text-[var(--fig-xs)] text-zinc-500">
            Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              className="h-11 w-11 md:h-8 md:w-8 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                className={`h-11 w-11 md:h-8 md:w-8 text-[var(--fig-xs)] rounded font-medium ${
                  n === page ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(pageCount, page + 1))}
              disabled={page === pageCount}
              aria-label="Next page"
              className="h-11 w-11 md:h-8 md:w-8 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
