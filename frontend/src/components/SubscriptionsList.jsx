import { Card, CardHeader } from './ui'
import { fmtEur } from '../lib/format'

export default function SubscriptionsList({ subscriptions, onDismiss }) {
  return (
    <Card>
      <CardHeader title="Subscriptions" subtitle="Detected recurring payments" />
      <div className="mt-4 space-y-2">
        {(subscriptions ?? []).length === 0 && (
          <div className="text-zinc-500 text-[var(--fig-sm)]">No subscriptions detected yet.</div>
        )}
        {(subscriptions ?? []).map((sub) => (
          <div key={sub.id} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
            <div>
              <div className="text-zinc-100 text-[var(--fig-sm)] font-medium">{sub.display_name}</div>
              <div className="text-zinc-500 text-[var(--fig-xs)]">{sub.cadence}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-zinc-100 num font-mono">{fmtEur(sub.expected_amount)}</div>
              <button
                onClick={() => onDismiss(sub.id)}
                className="text-[var(--fig-xs)] text-zinc-500 hover:text-red-400"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
