import { useEffect, useMemo } from 'react'

import {
  useChart,
  useInstrumentDetails,
  useQuotes,
  useSymbolEarnings,
  useSymbolNote,
} from '../../api/queries'
import { COMPANY_DATA, companyDataStatus, listingCurrency } from '../../lib/companyData'
import { computeIndicatorsForWindow } from '../../lib/indicators'
import { recordLook } from '../../lib/lastLook'
import { DAILY_HORIZON, WIDEST_RANGE_COUNT, barsForRange, earningsMarkersForBars } from '../../lib/research'
import { LATEST_TIME_VIEW, resolveTimeWindow, timeViewForDates } from '../../lib/timeWindow'
import { resolveTextAnnotations } from '../../lib/textAnnotations'
import { resolveTrendLines } from '../../lib/trendLines'
import { useChartLines } from './useChartLines'
import { useChartTextAnnotations } from './useChartTextAnnotations'
import { useChartTrendLines } from './useChartTrendLines'

// Hoisted so an empty result keeps a stable identity and the memos below do
// not recompute on every render.
const NO_BARS = []

export function useChartData({
  symbol,
  instrument,
  range,
  timeView = LATEST_TIME_VIEW,
  followDates = null,
  position = null,
  resolving = false,
  requireInstrument = false,
}) {
  const uic = instrument?.uic
  const assetType = instrument?.assetType

  // One fetch at the widest range; the narrower ones are its tail. Keying on
  // the range instead meant six Saxo calls to walk 1W→ALL.
  const chart = useChart({ uic, assetType, horizon: DAILY_HORIZON, count: WIDEST_RANGE_COUNT })
  const allBars = chart.data ?? NO_BARS
  const effectiveTimeView = useMemo(
    () => (followDates ? timeViewForDates(followDates, allBars) : timeView),
    [followDates, allBars, timeView],
  )
  const timeWindow = useMemo(
    () => resolveTimeWindow(effectiveTimeView, { total: allBars.length, range }),
    [effectiveTimeView, allBars.length, range],
  )
  const { start, end } = timeWindow
  const bars = useMemo(() => allBars.slice(start, end), [allBars, start, end])
  const rangeBars = useMemo(() => barsForRange(allBars, range), [allBars, range])
  // Indicators run on everything fetched and are sliced to match, so MA-50 has
  // a value on a one-month view instead of being null for want of history.
  const ind = useMemo(() => computeIndicatorsForWindow(allBars, { start, end }), [allBars, start, end])

  const details = useInstrumentDetails({ uic, assetType })
  const currency = listingCurrency({ position, instrument, details: details.data })
  const companyData = companyDataStatus({
    instrument,
    currency,
    lookingUp: resolving || (Boolean(instrument) && !currency && details.isLoading),
    requireInstrument,
  })
  const earnings = useSymbolEarnings(companyData === COMPANY_DATA.eligible ? symbol : '')
  const note = useSymbolNote(symbol)
  const priceLines = useChartLines({ symbol, uic, assetType, note: note?.data })
  const savedTrendLines = useChartTrendLines({ symbol, uic, assetType })
  const trendLines = useMemo(
    () => resolveTrendLines(savedTrendLines.lines, { allBars, windowStart: start, windowLength: bars.length }),
    [savedTrendLines.lines, allBars, start, bars.length],
  )
  const savedTextAnnotations = useChartTextAnnotations({ symbol, uic, assetType })
  const textAnnotations = useMemo(
    () => resolveTextAnnotations(savedTextAnnotations.items, { allBars, windowStart: start, windowLength: bars.length }),
    [savedTextAnnotations.items, allBars, start, bars.length],
  )
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
    allBars,
    rangeBars,
    ind,
    timeWindow,
    timeView: effectiveTimeView,
    earnings,
    companyData,
    currency,
    earningsMarkers,
    note,
    priceLines,
    trendLines,
    trendLineActions: savedTrendLines,
    textAnnotations,
    textAnnotationActions: savedTextAnnotations,
    quote: liveQuotes.data?.[0],
    details,
  }
}
