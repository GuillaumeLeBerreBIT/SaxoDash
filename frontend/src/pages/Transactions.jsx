import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactions } from '../api/queries'
import { fmtDate, fmtQty } from '../lib/format'
import { txPrice, txSignedTotal, txTone, txTotal, txTotalClass, txTypes } from '../lib/transactions'
import { nextSort, sortRows } from '../lib/sort'
import { accountsOf, DATE_PRESETS, filterByDateRange, rangeForPreset, readFilters, writeFilters } from '../lib/transactionFilters'
import { localToday } from '../lib/periods'
import { toCsv, TRANSACTION_COLUMNS } from '../lib/csv'
import { Badge, Button, Card, Chip, EmptyState, Input, InstrumentLogo, LetterAvatar, PageHeader, QueryState, Select, Th, SortableTh, Td } from '../components/ui'

const TRANSACTION_ACCESSORS = {
  date: (t) => t.date,
  instrument: (t) => t.instrument,
  total: (t) => txSignedTotal(t),
}

export default function Transactions() {
  const { data, isLoading, error, refetch } = useTransactions('?page_size=1000')
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(null)
  const [deadSelection, setDeadSelection] = useState('')

  // Stable identity so the filter memo below doesn't rerun on every render
  // while the query is still resolving.
  const allTx = useMemo(() => data ?? [], [data])
  const types = useMemo(() => txTypes(allTx), [allTx])
  const accounts = useMemo(() => accountsOf(allTx), [allTx])

  const raw = readFilters(searchParams)
  const effectiveFilter = types.includes(raw.type) ? raw.type : 'All'
  const account = accounts.includes(raw.account) ? raw.account : ''
  const filters = { ...raw, type: effectiveFilter, account }
  const { from, to } = filters
  const urlSearch = raw.search
  const [searchText, setSearchText] = useState(urlSearch)
  const [seenUrlSearch, setSeenUrlSearch] = useState(urlSearch)
  if (seenUrlSearch !== urlSearch) {
    setSeenUrlSearch(urlSearch)
    setSearchText(urlSearch)
  }
  const search = urlSearch

  const dead = `${raw.type !== effectiveFilter ? raw.type : ''}|${raw.account !== account ? raw.account : ''}`
  if (dead !== deadSelection) {
    setDeadSelection(dead)
    if (dead !== '|') setPage(1)
  }

  function applyFilters(patch) {
    setSearchParams(writeFilters({ ...filters, ...patch }), { replace: true })
    setPage(1)
  }

  const filtered = useMemo(
    () =>
      filterByDateRange(allTx, { from, to }).filter(
        (t) =>
          (effectiveFilter === 'All' || t.type === effectiveFilter) &&
          (account === '' || t.account === account) &&
          (search === '' || (t.instrument + t.ticker).toLowerCase().includes(search.toLowerCase()))
      ),
    [allTx, effectiveFilter, account, search, from, to]
  )

  const sorted = useMemo(() => sortRows(filtered, sort, TRANSACTION_ACCESSORS), [filtered, sort])

  function onSort(key) {
    setSort((current) => nextSort(current, key))
    setPage(1)
  }

  const perPage = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const visible = sorted.slice((page - 1) * perPage, page * perPage)

  const today = localToday()
  const filtersActive = search !== '' || effectiveFilter !== 'All' || account !== '' || from !== '' || to !== ''

  function clearFilters() {
    applyFilters({ search: '', type: 'All', account: '', from: '', to: '' })
  }

  function handleExport() {
    const blob = new Blob([toCsv(TRANSACTION_COLUMNS, sorted)], { type: 'text/csv;charset=utf-8' })
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
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                applyFilters({ search: e.target.value })
              }}
              placeholder="Search instrument or ticker"
              aria-label="Search transactions"
              className="w-full pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {types.map((t) => (
              <Chip
                key={t}
                active={effectiveFilter === t}
                onClick={() => applyFilters({ type: t })}
              >
                {t}
              </Chip>
            ))}
          </div>
          {accounts.length > 1 && (
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              Account
              <Select
                value={account}
                onChange={(e) => applyFilters({ account: e.target.value })}
                className="h-11 md:h-9"
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              From
              <Input type="date" value={from} onChange={(e) => applyFilters({ from: e.target.value })} className="h-11 md:h-9" />
            </label>
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              To
              <Input type="date" value={to} onChange={(e) => applyFilters({ to: e.target.value })} className="h-11 md:h-9" />
            </label>
            <div className="flex flex-wrap items-center gap-1">
              {DATE_PRESETS.map((preset) => {
                const range = rangeForPreset(preset, today)
                return (
                  <Chip key={preset} active={from === range.from && to === range.to} onClick={() => applyFilters(range)}>
                    {preset}
                  </Chip>
                )
              })}
            </div>
          </div>
          {filtersActive && visible.length > 0 && (
            <Button size="sm" className="h-11 md:h-8" onClick={clearFilters}>Clear filters</Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[var(--fig-sm)]">
            <thead>
              <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                <SortableTh edge sortKey="date" sort={sort} onSort={onSort}>Date</SortableTh>
                <Th hideBelow="md">Type</Th>
                <SortableTh sortKey="instrument" sort={sort} onSort={onSort}>Instrument</SortableTh>
                <Th hideBelow="md">Ticker</Th>
                <Th align="right" hideBelow="md">Qty</Th>
                <Th align="right" hideBelow="md">Price</Th>
                <SortableTh align="right" sortKey="total" sort={sort} onSort={onSort}>Total</SortableTh>
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
                        fallback={<LetterAvatar symbol={t.ticker} size={16} className="rounded-sm" />}
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
                    {filtersActive && (
                      <div className="pb-6 text-center">
                        <Button size="sm" className="h-11 md:h-8" onClick={clearFilters}>Clear filters</Button>
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
