import { colorForRank } from '../../lib/charts'
import { fmtEur } from '../../lib/format'
import { capBreaches, WEIGHT_CAP_PCT } from '../../lib/portfolioStats'
import { useChartColors } from '../../theme/useChartColors'
import AllocationDonut from '../AllocationDonut'
import { Card, EmptyState, Tile } from '../ui'

const MAX_SECTOR_SLICES = 5
const REPORTING_CURRENCY = 'EUR'

const valueOf = (p) => Number(p.value) || 0
const weightText = (weight) => `${Number(weight).toFixed(1)}%`
const plural = (n, one, many) => (n === 1 ? one : many)

function sectorSlices(positions, c) {
  const totals = new Map()
  positions.forEach((p) => totals.set(p.sector, (totals.get(p.sector) || 0) + valueOf(p)))
  const entries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
  const other = entries.slice(MAX_SECTOR_SLICES).reduce((sum, [, value]) => sum + value, 0)
  return [
    ...entries.slice(0, MAX_SECTOR_SLICES).map(([name, value], i) => ({ name, value, color: colorForRank(i, c) })),
    ...(other > 0 ? [{ name: 'Other', value: other, color: c.flat, logo: false }] : []),
  ]
}

export function SectorsPanel({ positions, className = '' }) {
  const c = useChartColors()
  const priced = positions.reduce((sum, p) => sum + valueOf(p), 0) > 0
  return (
    <Card className={className} context="Share of positions value" dot={priced ? 'ok' : 'off'} title="Sectors">
      {priced ? (
        <AllocationDonut items={sectorSlices(positions, c)} formatValue={fmtEur} height="240px" />
      ) : (
        <EmptyState title="No priced holdings yet" hint="Sector weight needs a value per holding to chart." />
      )}
    </Card>
  )
}

export function ConcentrationPanel({ positions, className = '' }) {
  const weighted = positions.filter((p) => p.weight != null).sort((a, b) => Number(b.weight) - Number(a.weight))
  const largest = weighted[0]
  const top3 = weighted.slice(0, 3)
  const breaches = capBreaches(positions)
  const freed = largest && Number(largest.weight) > WEIGHT_CAP_PCT ? valueOf(largest) * (1 - WEIGHT_CAP_PCT / Number(largest.weight)) : null
  return (
    <Card
      className={className}
      context={`Against your ${WEIGHT_CAP_PCT}% cap`}
      dot={!weighted.length ? 'off' : breaches.length ? 'warn' : 'ok'}
      title="Concentration"
    >
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Largest"
          value={largest ? weightText(largest.weight) : null}
          tone={largest && Number(largest.weight) > WEIGHT_CAP_PCT ? 'warn' : undefined}
          sub={largest?.ticker}
        />
        <Tile
          label="Top 3"
          value={top3.length ? weightText(top3.reduce((sum, p) => sum + Number(p.weight), 0)) : null}
          sub={top3.length ? top3.map((p) => p.ticker).join(', ') : undefined}
        />
      </div>
      {weighted.length > 0 && (
        <p className="mt-3 text-[12px] text-ink-3">
          {breaches.length === 0
            ? `No holding sits above the ${WEIGHT_CAP_PCT}% cap.`
            : `${breaches.length} ${plural(breaches.length, 'holding sits', 'holdings sit')} above the ${WEIGHT_CAP_PCT}% cap.`}
          {freed != null && ` Trimming ${largest.ticker} to ${WEIGHT_CAP_PCT}% would free about ${fmtEur(freed, { decimals: 0 })}.`}
        </p>
      )}
    </Card>
  )
}

function currencyExposure(positions) {
  const totals = new Map()
  positions.forEach((p) => {
    const code = p.currency || 'Unknown'
    const entry = totals.get(code) || { currency: code, value: 0, count: 0 }
    entry.value += valueOf(p)
    entry.count += 1
    totals.set(code, entry)
  })
  return Array.from(totals.values()).sort((a, b) => b.value - a.value)
}

export function CurrencyPanel({ positions, cash, className = '' }) {
  const c = useChartColors()
  const rows = currencyExposure(positions)
  const cashValue = cash == null ? null : Number(cash)
  const total = rows.reduce((sum, r) => sum + r.value, 0) + (cashValue > 0 ? cashValue : 0)
  const foreign = rows.filter((r) => r.currency !== REPORTING_CURRENCY).reduce((sum, r) => sum + r.value, 0)
  const segments = [
    ...rows.map((r, i) => ({ key: r.currency, value: r.value, color: colorForRank(i, c) })),
    ...(cashValue > 0 ? [{ key: 'cash', value: cashValue, color: c.flat }] : []),
  ]
  return (
    <Card className={className} context="What the book is priced in" dot={rows.length ? 'ok' : 'off'} title="Currency">
      {total > 0 && (
        <div role="img" aria-label="Value by currency" className="flex h-2.5 gap-[2px] rounded-full overflow-hidden bg-track">
          {segments.map((s) => (
            <i key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ))}
        </div>
      )}
      <ul className="mt-2">
        {rows.map((r, i) => (
          <li key={r.currency} className="flex items-center gap-2.5 min-h-[30px] text-[13.5px]">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: colorForRank(i, c) }} />
            <span className="font-semibold text-ink">{r.currency}</span>
            <span className="flex-1 min-w-0 truncate text-ink-3">
              {r.count} {plural(r.count, 'position', 'positions')}
            </span>
            <span className="num text-ink-2">{fmtEur(r.value)}</span>
          </li>
        ))}
        {cashValue != null && (
          <li className="flex items-center gap-2.5 min-h-[30px] text-[13.5px]">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: c.flat }} />
            <span className="flex-1 min-w-0 truncate text-ink">Saxo cash</span>
            <span className="num text-ink-2">{fmtEur(cashValue)}</span>
          </li>
        )}
      </ul>
      {foreign > 0 && (
        <p className="mt-2 text-[12px] text-ink-3">
          A 1% move in the euro moves the non-euro positions about {fmtEur(foreign / 100, { decimals: 0 })}.
        </p>
      )}
    </Card>
  )
}
