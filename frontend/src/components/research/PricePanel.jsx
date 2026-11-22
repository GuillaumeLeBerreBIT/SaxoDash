import { useState } from 'react'

import { chartPlaceholderFor } from '../../lib/chartState'
import { fmtDate, fmtNum } from '../../lib/format'
import { previousClose, yearRange } from '../../lib/priceChart'
import { Card } from '../ui'
import PriceChart from './PriceChart'
import { ChartViewSwitch, PeriodChange, RangeButtons } from './chartHeader'

const PLACEHOLDER_HEIGHT = 380

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="text-[14px] font-semibold text-ink num">{value ?? '—'}</div>
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[var(--sd-accent)]" />
      {label}
    </label>
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
  const [showPrevious, setShowPrevious] = useState(true)
  const [showVolume, setShowVolume] = useState(false)

  const placeholder = chartPlaceholderFor({
    isLoading,
    error,
    data: bars,
    minPoints: 2,
    height: PLACEHOLDER_HEIGHT,
    symbol,
    unresolved,
  })
  const year = yearRange(allBars)

  return (
    <Card title="Chart" right={<ChartViewSwitch value={viewSwitch.value} onChange={viewSwitch.onChange} />}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <RangeButtons controls={controls} />
        <PeriodChange bars={bars} />
      </div>

      {placeholder ?? (
        <PriceChart
          bars={bars}
          previous={showPrevious ? previousClose(allBars) : null}
          showVolume={showVolume}
          currency={currency}
          symbol={symbol}
        />
      )}

      <div className="mt-2 flex flex-wrap gap-4">
        <Toggle label="Previous close" checked={showPrevious} onChange={setShowPrevious} />
        <Toggle label="Volume" checked={showVolume} onChange={setShowVolume} />
      </div>

      <div data-testid="price-facts" className="mt-3.5 pt-3 border-t border-line grid grid-cols-3 gap-3">
        <Fact label="P/E" value={pe == null ? null : fmtNum(pe, 2)} />
        <Fact label="52-week range" value={year ? `${fmtNum(year.low, 2)} – ${fmtNum(year.high, 2)}` : null} />
        <Fact label="Next earnings" value={nextEarnings ? fmtDate(nextEarnings.date) : null} />
      </div>
    </Card>
  )
}
