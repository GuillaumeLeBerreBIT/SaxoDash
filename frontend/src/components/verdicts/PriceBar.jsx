import { fmtMoney } from '../../lib/format'
import { priceBarPosition, priceZone } from '../../lib/priceBar'
import { POSITION_LABEL } from '../../lib/verdicts'

export default function PriceBar({ price, cheapBelow, expensiveAbove, currency = 'USD', labels = true, className = '' }) {
  const position = priceBarPosition({ price, cheapBelow, expensiveAbove })
  if (position == null) return null
  const zone = priceZone({ price, cheapBelow, expensiveAbove })
  const label = `${fmtMoney(price, currency)}: ${POSITION_LABEL[zone]}. Usual P/E range ${fmtMoney(cheapBelow, currency)} to ${fmtMoney(expensiveAbove, currency)}`
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-testid="price-bar" data-zone={zone}>
      <div role="img" aria-label={label} className="relative flex h-1.5 gap-px">
        <span className="flex-1 rounded-l-full bg-ink-3/25" />
        <span className="flex-1 bg-ink-3/25" />
        <span className="flex-1 rounded-r-full bg-ink-3/25" />
        <span
          className="absolute -top-1 h-3.5 w-[3px] -translate-x-1/2 rounded-full bg-ink shadow-[0_0_0_2px_var(--sd-pane)]"
          style={{ left: `${position * 100}%` }}
        />
      </div>
      {labels ? (
        <div className="flex justify-between gap-2 text-[12px] text-ink-3 num">
          <span>Usual P/E low {fmtMoney(cheapBelow, currency)}</span>
          <span>Usual P/E high {fmtMoney(expensiveAbove, currency)}</span>
        </div>
      ) : null}
    </div>
  )
}
