import { useState } from 'react'

import { fmtMoney } from '../../lib/format'
import { healthVerdict } from '../../lib/snapshot'
import { Card, CardHeader } from '../ui'
import VerdictBadge from './VerdictBadge'

const FIELD_CLASS =
  'w-full bg-zinc-950 border border-white/10 rounded px-2.5 py-2 text-[12.5px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/60 resize-none'

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
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium mb-1">{label}</div>
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

function TargetPriceField({ value, currency, onSave }) {
  const [draft, setDraft] = useState(value ?? '')
  const [syncedValue, setSyncedValue] = useState(value ?? '')
  if ((value ?? '') !== syncedValue) {
    setSyncedValue(value ?? '')
    setDraft(value ?? '')
  }

  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium mb-1">
        Target price {currency ? `(${currency})` : ''}
      </div>
      <input
        type="number"
        step="0.01"
        value={draft}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft === '' ? null : draft
          if (next !== (value ?? null)) onSave(next)
        }}
        className={`${FIELD_CLASS} num font-mono`}
      />
    </div>
  )
}

/** What the company does, in the user's own words - Finnhub's free tier
 *  carries no business description, and Saxo's is a one-line instrument
 *  name, so this is the only place that gap gets filled. */
export function BusinessSummaryCard({ note, onSave }) {
  return (
    <Card>
      <CardHeader title="Business" subtitle="What this company does, in your own words" />
      <div className="mt-3">
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
export default function ThesisAndRisksCard({ note, onSave, fundamentals, currency }) {
  const leverage = fundamentals?.data?.available ? healthVerdict(fundamentals.data) : null

  return (
    <Card>
      <CardHeader
        title="Thesis & risks"
        subtitle="Your own read - not fetched from anywhere"
        right={leverage?.tone === 'caution' ? <VerdictBadge {...leverage} /> : null}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
        <TargetPriceField
          value={note?.target_price}
          currency={currency}
          onSave={(v) => onSave({ target_price: v })}
        />
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
        <div className="mt-2 text-[10.5px] text-zinc-600">
          Target: {fmtMoney(note.target_price, currency)}
        </div>
      ) : null}
    </Card>
  )
}
