import { useId } from 'react'

import { Card } from '../ui'
import TopHoldings from './TopHoldings'
import WeightBar from './WeightBar'
import { fmtPct } from '../../lib/format'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

function Sectors({ sectors }) {
  const headingId = useId()
  const max = Math.max(0, ...sectors.map((s) => s.weight))
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[var(--fig-sm)] font-medium text-zinc-200">Sectors</h3>
      <ul className="flex flex-col gap-2.5">
        {sectors.map((s) => (
          <li key={s.sector} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2 text-[var(--fig-xs)]">
              <span className="text-zinc-300 truncate">{s.sector}</span>
              <span className="num font-mono text-zinc-400">{share(s.weight)}</span>
            </span>
            <WeightBar weight={s.weight} max={max} />
          </li>
        ))}
      </ul>
      <p className="text-[var(--fig-2xs)] text-zinc-500">Sector is known for S&amp;P 500 and Nasdaq-100 names; the rest is Other.</p>
    </section>
  )
}

export default function ConcentrationPanel({ detail }) {
  return (
    <Card>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <TopHoldings detail={detail} />
        <Sectors sectors={detail.sectors} />
      </div>
    </Card>
  )
}
