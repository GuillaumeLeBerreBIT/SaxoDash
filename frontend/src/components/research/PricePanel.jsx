import { chartPlaceholderFor } from '../../lib/chartState'
import { useSize } from '../../lib/chartGeometry'
import { fmtDate, fmtMoney, fmtNum } from '../../lib/format'
import { previousClose, priceChartHeight, yearRange } from '../../lib/priceChart'
import { Card } from '../ui'
import Fact from './Fact'
import PriceChart from './PriceChart'
import { ChartViewSwitch, PeriodChange, RangeButtons } from './chartHeader'
import { usePriceChartOptions } from './usePriceChartOptions'

function Toggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[var(--sd-accent)]" />
      {label}
    </label>
  )
}

export function ChartFacts({ allBars, pe, nextEarnings, currency, className = '' }) {
  const year = yearRange(allBars)
  const price = (value) => (currency ? fmtMoney(value, currency) : fmtNum(value, 2))

  return (
    <div data-testid="price-facts" className={`pt-3 border-t border-line flex flex-wrap gap-x-10 gap-y-3 ${className}`}>
      <Fact label="P/E" value={pe == null ? null : fmtNum(pe, 2)} />
      <Fact label="52-week range" value={year ? `${price(year.low)} – ${price(year.high)}` : null} />
      <Fact label="Next earnings" value={nextEarnings ? fmtDate(nextEarnings.date) : null} />
    </div>
  )
}

export default function PricePanel({
  bars,
  allBars,
  controls,
  isLoading,
  error,
  symbol,
  unresolved,
  currency,
  pe,
  nextEarnings,
  viewSwitch,
}) {
  const { showPrevious, showVolume, setShowPrevious, setShowVolume } = usePriceChartOptions()
  const [sizeRef, size] = useSize()

  const placeholder = chartPlaceholderFor({
    isLoading,
    error,
    data: bars,
    minPoints: 2,
    height: priceChartHeight(size.width),
    symbol,
    unresolved,
  })
  return (
    <Card title="Chart" right={<ChartViewSwitch value={viewSwitch.value} onChange={viewSwitch.onChange} />}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <RangeButtons controls={controls} />
        <PeriodChange bars={bars} />
      </div>

      <div ref={sizeRef} className="min-w-0">
        {placeholder ?? (
          <PriceChart
            bars={bars}
            previous={showPrevious ? previousClose(allBars) : null}
            showVolume={showVolume}
            currency={currency}
            symbol={symbol}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4">
        <Toggle label="Previous close" checked={showPrevious} onChange={setShowPrevious} />
        <Toggle label="Volume" checked={showVolume} onChange={setShowVolume} />
      </div>

      <ChartFacts allBars={allBars} pe={pe} nextEarnings={nextEarnings} currency={currency} className="mt-3.5" />
    </Card>
  )
}
