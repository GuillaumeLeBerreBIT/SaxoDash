import { fmtCompact, fmtDate, fmtNum } from '../../lib/format'
import { daysUntil, sessionWords } from '../../lib/earnings'
import { Card } from '../ui'

export default function NextEarningsCard({ earnings, onOpenTab }) {
  const data = earnings?.data
  if (!data?.available) return null
  const next = data.next

  return (
    <Card context={next ? `Finnhub calendar · ${daysUntil(next.date)}` : 'Finnhub calendar'} dot="earn" title="Next earnings">
      {next ? (
        <>
          <div className="text-[26px] font-bold num text-ink">{fmtDate(next.date)}</div>
          <div className="mt-0.5 text-[13px] text-ink-2 num">
            {[
              sessionWords(next.session),
              next.eps_estimate == null ? null : `EPS est. ${fmtNum(next.eps_estimate, 2)}`,
              next.revenue_estimate == null ? null : `revenue est. ${fmtCompact(next.revenue_estimate / 1e6)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">No scheduled earnings date for this symbol.</p>
      )}
      {onOpenTab && (
        <button
          type="button"
          onClick={() => onOpenTab('earnings')}
          className="mt-2.5 text-[13px] font-semibold text-ink hover:underline"
        >
          Earnings history →
        </button>
      )}
    </Card>
  )
}
