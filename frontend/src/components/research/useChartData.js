import { useEffect, useMemo } from 'react'

import {
  useChart,
  useInstrumentDetails,
  useQuotes,
  useSymbolEarnings,
  useSymbolNote,
} from '../../api/queries'
import { computeIndicatorsForWindow } from '../../lib/indicators'
import { recordLook } from '../../lib/lastLook'
import { DAILY_HORIZON, WIDEST_RANGE_COUNT, barsForRange, earningsMarkersForBars, visibleWindow } from '../../lib/research'
import { useChartLines } from './useChartLines'

// Hoisted so an empty result keeps a stable identity and the memos below do
// not recompute on every render.
const NO_BARS = []

export function useChartData({ symbol, instrument, range, timeOffset = 0, barCount = null }) {
  const uic = instrument?.uic
  const assetType = instrument?.assetType

  // One fetch at the widest range; the narrower ones are its tail. Keying on
  // the range instead meant six Saxo calls to walk 1W→ALL.
  const chart = useChart({ uic, assetType, horizon: DAILY_HORIZON, count: WIDEST_RANGE_COUNT })
  const allBars = chart.data ?? NO_BARS
  const view = useMemo(
    () => visibleWindow(allBars.length, range, timeOffset, barCount),
    [allBars.length, range, timeOffset, barCount],
  )
  const bars = useMemo(() => allBars.slice(view.start, view.end), [allBars, view.start, view.end])
  const rangeBars = useMemo(() => barsForRange(allBars, range), [allBars, range])
  // Indicators run on everything fetched and are sliced to match, so MA-50 has
  // a value on a one-month view instead of being null for want of history.
  const ind = useMemo(
    () => computeIndicatorsForWindow(allBars, { start: view.start, end: view.end }),
    [allBars, view.start, view.end],
  )

  const details = useInstrumentDetails({ uic, assetType })
  const earnings = useSymbolEarnings(symbol)
  const note = useSymbolNote(symbol)
  const priceLines = useChartLines({ symbol, uic, assetType, note: note?.data })
  const earningsMarkers = useMemo(
    () => earningsMarkersForBars(bars, earnings.data?.available ? earnings.data.history : []),
    [bars, earnings.data],
  )
  const liveQuotes = useQuotes(uic ? [uic] : [], assetType)

  useEffect(() => {
    recordLook(symbol, liveQuotes.data?.[0]?.price)
  }, [symbol, liveQuotes.data])

  return {
    chart,
    bars,
    rangeBars,
    ind,
    maxTimeOffset: view.maxOffset,
    earnings,
    earningsMarkers,
    note,
    priceLines,
    quote: liveQuotes.data?.[0],
    details,
  }
}
