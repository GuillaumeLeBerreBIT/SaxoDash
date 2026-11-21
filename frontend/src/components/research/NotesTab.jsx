import { useState } from 'react'

import { Button, Card } from '../ui'
import TradePlanCard from './TradePlanCard'
import ThesisAndRisksCard, { BusinessSummaryCard } from './SymbolNotesCard'

const PLAN_ACTIONS = new Set(['buy', 'add'])

function PlanSection({ action, children }) {
  const [open, setOpen] = useState(false)
  if (!action || PLAN_ACTIONS.has(action) || open) return children
  return (
    <Card context="For a new purchase" dot="off" title="Trade plan">
      <p className="text-[13px] text-ink-2">Stop-loss, size and risk. Closed unless the company passes the quality screen and is under your cap.</p>
      <Button size="sm" className="mt-2.5" onClick={() => setOpen(true)}>Show the trade plan</Button>
    </Card>
  )
}

export default function NotesTab({
  note,
  onSaveNote,
  onMarkReviewed,
  reviewing = false,
  fundamentals,
  details,
  position,
  bars,
  tradePlan,
  verdict,
  eligible,
  earnings,
}) {
  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)] min-w-0">
      <BusinessSummaryCard note={note?.data} onSave={onSaveNote} />
      <ThesisAndRisksCard
        note={note?.data}
        onSave={onSaveNote}
        onMarkReviewed={onMarkReviewed}
        reviewing={reviewing}
        fundamentals={fundamentals}
        currency={details?.currency}
      />
      <PlanSection action={eligible ? verdict?.data?.action : null}>
        <TradePlanCard
          bars={bars}
          currency={details?.currency ?? position?.currency}
          note={note?.data}
          position={position}
          positions={tradePlan?.positions}
          portfolioValue={tradePlan?.portfolioValue}
          nextEarnings={earnings?.data?.available ? earnings.data.next : null}
          verdict={eligible ? verdict?.data : null}
        />
      </PlanSection>
    </div>
  )
}
