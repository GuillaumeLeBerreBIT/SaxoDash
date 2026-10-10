import { useId, useState } from 'react'

import { Button, Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import { OptionBadge } from './HoldingBadges'
import { MOVES_SHOWN, groupMoves, moveSentence, stockLabel } from '../../lib/investorHub'
import { quarterLabel } from '../../lib/investors'

const TONES = { new: 'text-emerald-400', added: 'text-emerald-400', trimmed: 'text-red-400', sold_out: 'text-red-400' }
const FIRST_QUARTER = 'First stored quarter — there is no earlier filing to compare against.'
const NOTHING_MOVED = 'No position changed by 1% or more this quarter.'

function Move({ move }) {
  const label = stockLabel(move)
  return (
    <li className="py-2 flex items-center gap-2.5 min-w-0">
      <InstrumentLogo symbol={move.ticker} size={22} className="rounded" fallback={<TickerInitial ticker={label} size={22} />} />
      <span className={`shrink-0 ${move.ticker ? 'font-mono font-semibold text-zinc-100' : 'text-zinc-200'}`}>{label}</span>
      <OptionBadge putCall={move.put_call} />
      <span className="min-w-0 truncate text-[var(--fig-sm)] text-zinc-400">{moveSentence(move)}</span>
    </li>
  )
}

export default function LatestMoves({ detail }) {
  const headingId = useId()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? detail.moves : detail.moves.slice(0, MOVES_SHOWN)
  const empty = detail.previous_quarter == null ? FIRST_QUARTER : detail.moves.length === 0 ? NOTHING_MOVED : null

  return (
    <Card>
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h2 id={headingId} className="text-[var(--fig-md)] font-semibold text-zinc-100">{`Latest moves · ${quarterLabel(detail.quarter)}`}</h2>
        {empty ? (
          <p className="text-[var(--fig-sm)] text-zinc-500">{empty}</p>
        ) : (
          <>
            {groupMoves(shown).map((group) => (
              <div key={group.kind}>
                <h3 className={`text-[var(--fig-2xs)] font-semibold uppercase tracking-wider ${TONES[group.kind]}`}>{group.title}</h3>
                <ul className="divide-y divide-white/[0.06]">
                  {group.items.map((move) => <Move key={`${move.cusip}-${move.put_call}`} move={move} />)}
                </ul>
              </div>
            ))}
            {!expanded && detail.moves.length > MOVES_SHOWN ? (
              <div><Button size="sm" onClick={() => setExpanded(true)}>{`Show all ${detail.moves.length}`}</Button></div>
            ) : null}
            <p className="text-[var(--fig-xs)] text-zinc-500">
              Moves compare quarter-end share counts with the previous filing; trades inside the quarter are not visible.
            </p>
          </>
        )}
      </section>
    </Card>
  )
}
