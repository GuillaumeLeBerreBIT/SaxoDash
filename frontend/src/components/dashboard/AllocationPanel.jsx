import { colorForRank } from '../../lib/charts'
import { WEIGHT_CAP_PCT } from '../../lib/portfolioStats'
import { useChartColors } from '../../theme/useChartColors'
import { Card } from '../ui'
import ExposureCard from './ExposureCard'

const weightText = (weight) => (weight == null ? '—' : `${Number(weight).toFixed(1)}%`)
const overCap = (weight) => weight != null && Number(weight) > WEIGHT_CAP_PCT

export default function AllocationPanel({ positions, currency, concentration, className = '' }) {
  const c = useChartColors()
  const ranked = positions.slice().sort((a, b) => Number(b.value) - Number(a.value))
  return (
    <Card
      className={className}
      context={`By value · ${ranked.length} holding${ranked.length === 1 ? '' : 's'}`}
      dot={ranked.length ? 'ok' : 'off'}
      title="Allocation"
    >
      {ranked.length === 0 ? (
        <p className="text-[13px] text-ink-3">No holdings yet.</p>
      ) : (
        <>
          <div role="img" aria-label="Allocation by holding" className="flex h-2.5 gap-[2px] rounded-full overflow-hidden bg-track">
            {ranked.map((p, i) => (
              <i
                key={p.ticker}
                title={`${p.ticker} ${weightText(p.weight)}`}
                style={{ width: `${Number(p.weight) || 0}%`, background: colorForRank(i, c) }}
              />
            ))}
          </div>
          <ul className="mt-2">
            {ranked.map((p, i) => (
              <li key={p.ticker} className="flex items-center gap-2.5 min-h-[30px] text-[13.5px]">
                <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: colorForRank(i, c) }} />
                <span className="flex-1 min-w-0 truncate text-ink">{p.ticker}</span>
                <span className={`num ${overCap(p.weight) ? 'text-warn' : 'text-ink-2'}`}>{weightText(p.weight)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 pt-3 border-t border-line">
        <ExposureCard currency={currency} concentration={concentration} />
      </div>
    </Card>
  )
}
