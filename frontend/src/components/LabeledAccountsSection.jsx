import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import {
  useCreateLabeledAccount,
  useDeleteLabeledAccount,
  useLabeledAccountCandidates,
  useLabeledAccounts,
} from '../api/queries'
import { CATEGORY_LABELS } from '../lib/categories'
import { fmtEur } from '../lib/format'
import { Button, Card, CardHeader, EmptyState, Input, Modal, Select } from './ui'

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS)

/** iban/counterparty_name/label/category, with the same "at least one of
 *  iban or counterparty_name" rule the backend enforces - checked here too
 *  so a bad submission never round-trips before the user sees why. */
function LabelForm({ initial, error, onSubmit, onCancel, submitting }) {
  const [iban, setIban] = useState(initial?.iban ?? '')
  const [counterpartyName, setCounterpartyName] = useState(initial?.counterparty_name ?? '')
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState('TRANSFER')
  const [clientError, setClientError] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!iban.trim() && !counterpartyName.trim()) {
      setClientError('Provide an IBAN or a counterparty name to match on.')
      return
    }
    setClientError(null)
    onSubmit({
      iban: iban.trim() || null,
      counterparty_name: counterpartyName.trim() || null,
      label: label.trim(),
      category,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide mb-1" htmlFor="labeled-account-iban">
          IBAN
        </label>
        <Input
          id="labeled-account-iban"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="BE12 3456 7890 1234"
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide mb-1" htmlFor="labeled-account-name">
          Or counterparty name
        </label>
        <Input
          id="labeled-account-name"
          value={counterpartyName}
          onChange={(e) => setCounterpartyName(e.target.value)}
          placeholder="Exactly as it appears on the transaction"
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide mb-1" htmlFor="labeled-account-label">
          Label
        </label>
        <Input
          id="labeled-account-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. My savings account"
          required
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide mb-1" htmlFor="labeled-account-category">
          Category
        </label>
        <Select id="labeled-account-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full">
          {CATEGORY_OPTIONS.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </Select>
      </div>
      {(clientError || error) && <p className="text-[var(--fig-xs)] text-red-400">{clientError || error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={submitting}>Save</Button>
      </div>
    </form>
  )
}

/** Which accounts/people are the user's own or a household account is not a
 *  hardcoded rule anywhere in the app - it's this: a user-managed list
 *  (backend/enablebanking/models.py::ManualIbanLabel), with suggestions
 *  surfaced from whatever's still recurring in OTHER/REFUND_CREDIT so the
 *  user doesn't have to go hunting for an IBAN themselves. Everyone else
 *  stays a normal counterparty by default. */
export default function LabeledAccountsSection() {
  const { data: labels = [] } = useLabeledAccounts()
  const { data: candidates = [] } = useLabeledAccountCandidates()
  const createLabel = useCreateLabeledAccount()
  const deleteLabel = useDeleteLabeledAccount()

  const [prefill, setPrefill] = useState(null) // null = closed
  const [serverError, setServerError] = useState(null)

  const openNew = () => {
    setServerError(null)
    setPrefill({})
  }
  const openFromCandidate = (candidate) => {
    setServerError(null)
    setPrefill({ iban: candidate.counterparty_iban ?? '', counterparty_name: candidate.counterparty_name ?? '' })
  }
  const close = () => setPrefill(null)

  const handleSubmit = (payload) => {
    createLabel.mutate(payload, {
      onSuccess: close,
      onError: (err) => setServerError(err?.detail || 'Could not save this label.'),
    })
  }

  return (
    <Card>
      <CardHeader
        title="Labeled accounts"
        subtitle="Accounts and people you've identified as yours or household - everyone else stays a normal counterparty"
        right={
          <Button size="sm" onClick={openNew}>
            <Plus size={13} /> Add
          </Button>
        }
      />
      <div className="mt-3">
        {labels.length === 0 ? (
          <EmptyState title="No labeled accounts yet" hint="Add one, or pick from a suggestion below" />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {labels.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <div className="text-[var(--fig-sm)] text-zinc-100 truncate">{l.label}</div>
                  <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">
                    {l.iban || l.counterparty_name} · {CATEGORY_LABELS[l.category]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteLabel.mutate(l.id)}
                  aria-label={`Remove ${l.label}`}
                  className="w-7 h-7 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 flex items-center justify-center shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {candidates.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600 mb-2">Suggestions</div>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={`${c.counterparty_name}:${c.counterparty_iban ?? ''}`} className="flex items-center justify-between gap-3">
                <span className="text-[var(--fig-xs)] text-zinc-300 truncate">
                  {c.counterparty_name} <span className="text-zinc-600">· {c.count}× · {fmtEur(c.total)}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => openFromCandidate(c)}>
                  Label this
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {prefill && (
        <Modal title="Label an account" onClose={close}>
          <LabelForm
            initial={prefill}
            error={serverError}
            onSubmit={handleSubmit}
            onCancel={close}
            submitting={createLabel.isPending}
          />
        </Modal>
      )}
    </Card>
  )
}
