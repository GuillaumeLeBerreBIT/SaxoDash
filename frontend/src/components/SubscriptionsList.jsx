import { Button, Card } from './ui'
import { fmtEur } from '../lib/format'
import { monthlyTotal } from '../lib/subscriptions'

export default function SubscriptionsList({ subscriptions, onDismiss, className = '' }) {
  const rows = subscriptions ?? []
  const hasAny = rows.length > 0

  return (
    <Card
      className={className}
      context="Detected recurring payments"
      dot={hasAny ? 'ok' : 'off'}
      title="Subscriptions"
      right={hasAny && <span className="text-[13.5px] font-semibold text-ink num">≈ {fmtEur(monthlyTotal(subscriptions))} / month</span>}
    >
      {!hasAny && <div className="text-ink-3 text-[13.5px]">No subscriptions detected yet.</div>}
      <ul>
        {rows.map((sub) => (
          <li key={sub.id} className="flex items-center justify-between gap-3 min-h-11 py-1.5 border-t border-line first:border-t-0">
            <div className="min-w-0">
              <div className="text-ink text-[13.5px] font-semibold truncate">{sub.display_name}</div>
              <div className="text-ink-3 text-[12px]">{sub.cadence}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-ink text-[13.5px] font-semibold num">{fmtEur(sub.expected_amount)}</div>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(sub.id)}>
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
