import { useState } from 'react'

import { fmtMoney } from '../../lib/format'
import { healthVerdict } from '../../lib/snapshot'
import { reviewedLabel } from '../../lib/thesisReview'
import { Button, Card } from '../ui'
import VerdictBadge from './VerdictBadge'

const FIELD_CLASS =
  'w-full bg-track border border-line-input rounded-lg px-2.5 py-2 text-[14px] text-ink placeholder:text-ink-3 resize-none'

const LABEL_CLASS = 'text-[12px] text-ink-3 font-medium mb-1'

/** One free-text field, saved on blur so every keystroke doesn't fire a
 *  write. Local state mirrors the value until it diverges from the saved
 *  one, so a slow save doesn't fight the user's typing. */
function NoteField({ label, value, placeholder, rows = 2, onSave }) {
  const [draft, setDraft] = useState(value ?? '')
  // Re-syncs the draft when the saved value changes underneath it (a
  // different symbol, or another tab's write) - the render-time comparison
  // React recommends over an effect for "adjust state to a prop".
  const [syncedValue, setSyncedValue] = useState(value ?? '')
  if ((value ?? '') !== syncedValue) {
    setSyncedValue(value ?? '')
    setDraft(value ?? '')
  }

  return (
    <div>
      <div className={LABEL_CLASS}>{label}</div>
      <textarea
        rows={rows}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== (value ?? '') && onSave(draft)}
        className={FIELD_CLASS}
      />
    </div>
  )
}

function PriceLevelField({ label, value, currency, onSave }) {
  const [draft, setDraft] = useState(value ?? '')
  const [syncedValue, setSyncedValue] = useState(value ?? '')
  if ((value ?? '') !== syncedValue) {
    setSyncedValue(value ?? '')
    setDraft(value ?? '')
  }

  return (
    <label className="block">
      <div className={LABEL_CLASS}>
        {label} {currency ? `(${currency})` : ''}
      </div>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={draft}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft === '' ? null : draft
          if (next !== (value ?? null)) onSave(next)
        }}
        className={`${FIELD_CLASS} num`}
      />
    </label>
  )
}

/** What the company does, in the user's own words - Finnhub's free tier
 *  carries no business description, and Saxo's is a one-line instrument
 *  name, so this is the only place that gap gets filled. */
export function BusinessSummaryCard({ note, onSave, className = '' }) {
  return (
    <Card className={className} context="What this company does, in your own words" dot="off" title="Business">
      <div>
        <NoteField
          label="Summary"
          value={note?.business_summary}
          placeholder="What does this company do? How does it make money?"
          rows={3}
          onSave={(v) => onSave({ business_summary: v })}
        />
      </div>
    </Card>
  )
}

/** The investment thesis and its risks, after the data-driven read above -
 *  a bull/bear case, a target price, a sell trigger, and a leverage flag
 *  reusing the same verdict the Overview snapshot already computes. */
export default function ThesisAndRisksCard({
  note,
  onSave,
  onMarkReviewed,
  reviewing = false,
  fundamentals,
  currency,
  className = '',
}) {
  const leverage = fundamentals?.data?.available ? healthVerdict(fundamentals.data) : null

  return (
    <Card
      className={className}
      context="Your own read, not fetched from anywhere"
      dot="off"
      title="Thesis and risks"
      right={leverage?.tone === 'caution' ? <VerdictBadge {...leverage} /> : null}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <NoteField
          label="Bull case"
          value={note?.bull_case}
          placeholder="Why this could work out"
          onSave={(v) => onSave({ bull_case: v })}
        />
        <NoteField
          label="Bear case"
          value={note?.bear_case}
          placeholder="Why it might not"
          onSave={(v) => onSave({ bear_case: v })}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PriceLevelField
          label="Target price"
          value={note?.target_price}
          currency={currency}
          onSave={(v) => onSave({ target_price: v })}
        />
        <PriceLevelField
          label="Stop price"
          value={note?.stop_price}
          currency={currency}
          onSave={(v) => onSave({ stop_price: v })}
        />
      </div>
      <div className="mt-3">
        <NoteField
          label="Sell trigger"
          value={note?.sell_trigger}
          placeholder="What would make you sell"
          onSave={(v) => onSave({ sell_trigger: v })}
        />
      </div>
      <div className="mt-3">
        <NoteField
          label="Risks to watch"
          value={note?.risks_to_watch}
          placeholder="Competitive, regulatory, macro - whatever could break the thesis"
          onSave={(v) => onSave({ risks_to_watch: v })}
        />
      </div>
      {note?.target_price != null && currency ? (
        <div className="mt-2 text-[12px] text-ink-3 num">
          Target: {fmtMoney(note.target_price, currency)}
        </div>
      ) : null}
      {onMarkReviewed ? (
        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3">
          <span className="text-[13px] text-ink-3">{reviewedLabel(note?.reviewed_at)}</span>
          <Button size="sm" onClick={onMarkReviewed} disabled={reviewing}>
            Mark reviewed
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
