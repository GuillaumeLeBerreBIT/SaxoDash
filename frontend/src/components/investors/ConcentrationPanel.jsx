import { Card } from '../ui'
import WeightBar from './WeightBar'
import { fmtPct } from '../../lib/format'
import { quarterLabel } from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

function Sectors({ sectors }) {
  const max = Math.max(0, ...sectors.map((s) => s.weight))
  return (
    <section aria-label="Sectors" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {sectors.map((s) => (
          <li key={s.sector} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-ink-2 truncate">{s.sector}</span>
              <span className="num text-ink">{share(s.weight)}</span>
            </span>
            <WeightBar weight={s.weight} max={max} />
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-3">Sector is known for S&amp;P 500 and Nasdaq-100 names; the rest is Other.</p>
    </section>
  )
}

export default function ConcentrationPanel({ detail }) {
  return (
    <Card context={`Share of reported value · ${quarterLabel(detail.quarter)} quarter end`} title="Sectors" className="h-full">
      <Sectors sectors={detail.sectors} />
    </Card>
  )
}
