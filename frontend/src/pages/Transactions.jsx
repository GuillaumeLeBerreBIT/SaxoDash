import { useMemo, useState } from 'react'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactions } from '../api/queries'
import { fmtEur, fmtQty } from '../lib/format'
import { toCsv, TRANSACTION_COLUMNS } from '../lib/csv'
import { Badge, Button, Card, Input, PageHeader, Th, Td } from '../components/ui'

const TYPES = ['All', 'BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'FEE']
const toneFor = (t) => ({ BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }[t] || 'zinc')
const signedTotal = (t) =>
  t.type === 'SELL' || t.type === 'DEPOSIT' || t.type === 'DIVIDEND'
    ? '+' + fmtEur(t.total)
    : t.type === 'FEE'
    ? '-' + fmtEur(t.total)
    : fmtEur(t.total)

export default function Transactions() {
  const { data, isLoading, error } = useTransactions('?page_size=1000')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [page, setPage] = useState(1)

  // Stable identity so the filter memo below doesn't rerun on every render
  // while the query is still resolving.
  const allTx = useMemo(() => data ?? [], [data])

  const filtered = useMemo(
    () =>
      allTx.filter(
        (t) =>
          (typeFilter === 'All' || t.type === typeFilter) &&
          (search === '' || (t.instrument + t.ticker).toLowerCase().includes(search.toLowerCase()))
      ),
    [allTx, typeFilter, search]
  )

  const perPage = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const visible = filtered.slice((page - 1) * perPage, page * perPage)

  function handleExport() {
    const blob = new Blob([toCsv(TRANSACTION_COLUMNS, filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="text-red-400 text-sm">Failed to load transactions</div>
  if (isLoading) return <div className="text-zinc-500 text-sm">Loading…</div>

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
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
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
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950 border border-zinc-800 rounded-md">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTypeFilter(t)
                  setPage(1)
                }}
                className={`px-2.5 h-8 text-[var(--fig-xs)] font-medium rounded ${
                  typeFilter === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[var(--fig-sm)]">
            <thead>
              <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                <Th edge>Date</Th>
                <Th>Type</Th>
                <Th>Instrument</Th>
                <Th>Ticker</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Price</Th>
                <Th align="right">Total</Th>
                <Th edge>Account</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <Td edge className="num text-zinc-300">{t.date}</Td>
                  <Td>
                    <Badge tone={toneFor(t.type)}>{t.type}</Badge>
                  </Td>
                  <Td className="text-zinc-100">{t.instrument}</Td>
                  <Td className="text-zinc-400 font-medium">{t.ticker}</Td>
                  <Td align="right" className="num text-zinc-300">{fmtQty(t.qty)}</Td>
                  <Td align="right" className="num text-zinc-300">{fmtEur(t.price)}</Td>
                  <Td align="right" className="num text-zinc-100 font-medium">{signedTotal(t)}</Td>
                  <Td edge className="text-zinc-400">{t.account}</Td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-zinc-500 py-8">
                    No transactions match your filters.
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 text-[var(--fig-xs)] rounded font-medium ${
                  n === page ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(pageCount, page + 1))}
              disabled={page === pageCount}
              className="w-8 h-8 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
