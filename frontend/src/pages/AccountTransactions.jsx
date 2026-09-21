import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBankAccounts, useBankTransactions, useUpdateBankTransactionCategory } from '../api/queries'
import { fmtEur } from '../lib/format'
import { Card, PageHeader, StatRow, StatStrip, Th, Td } from '../components/ui'
import { CATEGORY_LABELS } from '../lib/categories'

function CategoryCell({ tx, onChange }) {
  return (
    <select
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

  if (error) return <div className="text-red-400 text-sm">Failed to load transactions</div>
  if (isLoading || !data) return <div className="text-zinc-500 text-sm">Loading…</div>

  const hasAvailable = account && Number(account.available) !== Number(account.balance)

  return (
    <div className="space-y-4">
      <PageHeader
        title={account?.bank ?? 'Account transactions'}
        subtitle={
          <Link to="/accounts" className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
            <ChevronLeft size={14} /> Back to Accounts
          </Link>
        }
      />
      {account && (
        <StatStrip>
          <StatRow label="Balance" value={fmtEur(account.balance)} note={account.type} lead />
          {hasAvailable && <StatRow label="Available" value={fmtEur(account.available)} />}
          <StatRow label="IBAN" value={account.iban_masked} />
        </StatStrip>
      )}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[var(--fig-sm)]">
            <thead>
              <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                <Th edge>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th align="right" edge>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((tx) => (
                <tr key={tx.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <Td edge className="num text-zinc-300">{tx.booking_date}</Td>
                  <Td className="text-zinc-100">{tx.counterparty_name}</Td>
                  <Td><CategoryCell tx={tx} onChange={updateCategory.mutate} /></Td>
                  <Td align="right" edge className="num text-zinc-100 font-medium">{fmtEur(tx.amount)}</Td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-zinc-500 py-8">No transactions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
