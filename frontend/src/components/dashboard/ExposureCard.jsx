import { colorForRank } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'

function Legend({ rows, nameKey }) {
  const c = useChartColors()
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
      {rows.map((r, i) => (
        <li key={r[nameKey]} className="flex items-center gap-1.5 text-[12px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorForRank(i, c) }} />
          <span className="text-ink-2">{r[nameKey]}</span>
          <span className="ml-auto text-ink-3 num">{r.pct}%</span>
        </li>
      ))}
    </ul>
  )
}

export default function ExposureCard({ currency, concentration }) {
  const c = concentration || {}
  const caption = [
    c.top3_pct != null && `Top 3: ${Math.round(c.top3_pct)}%`,
    c.hhi != null && `HHI ${c.hhi.toFixed(2)}`,
    c.positions != null && `${c.positions} position${c.positions === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section aria-labelledby="portfolio-currency">
      <h3 id="portfolio-currency" className="text-[14px] font-bold text-ink">Portfolio currency</h3>
      <p className="text-[12px] text-ink-3">By value</p>
      <div className="mt-2">
        {currency.length > 1 ? (
          <Legend rows={currency} nameKey="currency" />
        ) : currency.length === 1 ? (
          <p className="text-[13px] text-ink-2">100% {currency[0].currency}</p>
        ) : (
          <p className="text-[13px] text-ink-3">No holdings yet.</p>
        )}
      </div>
      {caption && <p className="mt-2 text-[12px] text-ink-3 num">{caption}</p>}
    </section>
  )
}
