import { fmtNum } from '../../lib/format'

const DOT = { below: 'bg-up', above: 'bg-warn', inside: 'bg-ink-3' }
const WORD = { below: 'below', above: 'above', inside: 'inside' }

export default function PeChip({ chip }) {
  if (!chip) return null
  return (
    <span
      data-testid="pe-chip"
      title="Today's P/E against the middle half of its own weekly P/E over about the last five years"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-[11.5px] text-ink-2"
    >
      <span data-testid="pe-chip-dot" className={`w-1.5 h-1.5 rounded-full ${DOT[chip.position]}`} />
      <span className="font-semibold text-ink">P/E {fmtNum(chip.pe, 1)}</span>
      <span className="text-ink-3">{WORD[chip.position]} its usual {fmtNum(chip.low)}–{fmtNum(chip.high)}</span>
    </span>
  )
}
