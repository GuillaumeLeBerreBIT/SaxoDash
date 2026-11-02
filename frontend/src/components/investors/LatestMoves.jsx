import { useState } from 'react'
import { Link } from 'react-router-dom'

import StockLogo from '../StockLogo'
import { Button, Card } from '../ui'
import { OptionBadge } from './HoldingBadges'
import { MOVES_SHOWN, groupMoves, moveSentence, stockLabel } from '../../lib/investorHub'
import { quarterLabel } from '../../lib/investors'
import { researchHref } from '../../lib/research'

const TONES = { new: 'text-held', added: 'text-ink-2', trimmed: 'text-ink-2', sold_out: 'text-warn [[data-theme=light]_&]:text-warn-text' }
const FIRST_QUARTER = 'First stored quarter — there is no earlier filing to compare against.'
const NOTHING_MOVED = 'No position changed by 1% or more this quarter.'

function Move({ move }) {
  const label = stockLabel(move)
  return (
    <li className="py-2 flex items-center gap-2.5 min-w-0">
      {move.ticker ? (
        <Link to={researchHref(move.ticker)} className="shrink-0 flex items-center gap-2.5 font-bold text-ink hover:underline">
          <StockLogo ticker={move.ticker} label={label} size={28} />
          {label}
        </Link>
      ) : (
        <>
          <StockLogo label={label} size={28} />
          <span className="shrink-0 font-semibold text-ink">{label}</span>
        </>
      )}
      <OptionBadge putCall={move.put_call} />
      <span className="min-w-0 truncate text-[13px] text-ink-2 num">{moveSentence(move)}</span>
    </li>
  )
}

function compared(detail) {
  const quarter = quarterLabel(detail.quarter)
  if (detail.previous_quarter == null) return `${quarter} · first stored quarter`
  return `${quarter} vs ${quarterLabel(detail.previous_quarter)} · quarter-end shares`
}

export default function LatestMoves({ detail }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? detail.moves : detail.moves.slice(0, MOVES_SHOWN)
  const empty = detail.previous_quarter == null ? FIRST_QUARTER : detail.moves.length === 0 ? NOTHING_MOVED : null

  return (
    <section aria-label="What changed">
      <Card context={compared(detail)} title="What changed">
        {empty ? (
          <p className="text-[13px] text-ink-3">{empty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groupMoves(shown).map((group) => (
              <div key={group.kind}>
                <h3 className={`text-[12px] font-bold ${TONES[group.kind]}`}>{group.title}</h3>
                <ul className="divide-y divide-line">
                  {group.items.map((move) => <Move key={`${move.cusip}-${move.put_call}`} move={move} />)}
                </ul>
              </div>
            ))}
            {!expanded && detail.moves.length > MOVES_SHOWN ? (
              <div><Button size="sm" onClick={() => setExpanded(true)}>{`Show all ${detail.moves.length}`}</Button></div>
            ) : null}
            <p className="text-[12px] text-ink-3">
              Moves compare quarter-end share counts with the previous filing; trades inside the quarter are not visible.
            </p>
          </div>
        )}
      </Card>
    </section>
  )
}
