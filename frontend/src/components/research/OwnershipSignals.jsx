import { useCongressOwnership, useOwnership } from '../../api/queries'
import { quarterLabel } from '../../lib/investors'
import { ownershipTicker } from '../../lib/ownership'
import { Card, Skeleton } from '../ui'

function fundsRead(data, symbol) {
  if (!data?.quarter) return { line: 'No 13F filings imported yet' }
  if (!data.stock) return { line: `No tracked fund has reported ${symbol}` }
  const { owners, new: opened, added, trimmed, sold_out: soldOut } = data.stock
  return {
    line: `${owners} of ${data.tracked} tracked funds hold it`,
    sub: `${opened} new · ${added} added · ${trimmed} trimmed · ${soldOut} sold out · ${quarterLabel(data.quarter)}`,
  }
}

function congressRead(data, symbol) {
  if (!data?.stock) return { line: `No House member has disclosed a ${symbol} trade` }
  const { buyers, sellers, holders } = data.stock
  return {
    line: `${buyers} bought · ${sellers} sold · ${holders} holding`,
    sub: `House members, last ${data.window_days} days`,
  }
}

function Row({ label, query, read, tab, onOpenTab }) {
  return (
    <li className="flex items-start gap-3 py-2.5 border-t border-line first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink-3">{label}</div>
        {query.isLoading ? (
          <Skeleton className="mt-1 h-4 w-3/4" />
        ) : query.error ? (
          <div className="text-[13.5px] text-ink-3">Could not load.</div>
        ) : (
          <>
            <div className="text-[13.5px] font-semibold text-ink num">{read.line}</div>
            {read.sub && <div className="text-[12px] text-ink-3 num">{read.sub}</div>}
          </>
        )}
      </div>
      {onOpenTab && (
        <button
          type="button"
          aria-label={`${tab.label} tab`}
          onClick={() => onOpenTab(tab.key)}
          className="shrink-0 text-[13px] font-semibold text-ink hover:underline"
        >
          {tab.label} →
        </button>
      )}
    </li>
  )
}

export default function OwnershipSignals({ symbol, currency, onOpenTab }) {
  const ticker = ownershipTicker({ ticker: symbol, currency })
  const funds = useOwnership(ticker)
  const congress = useCongressOwnership(ticker)

  if (!ticker) {
    return (
      <Card context="13F filings and House reports" dot="off" title="Funds and Congress">
        <p className="text-[13px] text-ink-2">Both are matched by US ticker, so only US-dollar listings are looked up.</p>
      </Card>
    )
  }

  return (
    <Card context="13F filings and House reports" dot="ok" title="Funds and Congress">
      <ul>
        <Row
          label="Tracked funds"
          query={funds}
          read={fundsRead(funds.data, symbol)}
          tab={{ key: 'funds', label: 'Funds' }}
          onOpenTab={onOpenTab}
        />
        <Row
          label="House of Representatives"
          query={congress}
          read={congressRead(congress.data, symbol)}
          tab={{ key: 'congress', label: 'Congress' }}
          onOpenTab={onOpenTab}
        />
      </ul>
      <p className="mt-1 text-[12px] text-ink-3">Trades inside the quarter are not visible in a 13F.</p>
    </Card>
  )
}
