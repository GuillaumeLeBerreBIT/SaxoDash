import { useMemo } from 'react'

import { useCharts, useSectors } from '../../api/queries'
import { ADDED_LIMIT, compareLines, compareSuggestions, factSentence, pricesFor } from '../../lib/compare'
import { DAILY_HORIZON, WIDEST_RANGE_COUNT, instrumentKey } from '../../lib/research'
import { useChartColors } from '../../theme/useChartColors'

const SECTOR_COLOR = 1
const ADDED_COLORS = [6, 3, 4]
const NO_BARS = []

const keyOf = (instrument) => instrumentKey(instrument.uic, instrument.assetType)

export function useCompare({ slot, compare, bars, hidden }) {
  const colors = useChartColors()
  const sectors = useSectors({ enabled: compare.on })
  const suggestions = useMemo(() => compareSuggestions(slot, sectors.data?.sectors), [slot, sectors.data])
  const mainKey = keyOf(slot)

  const entries = useMemo(() => {
    const chosen = suggestions
      .filter((suggestion) => compare[suggestion.key])
      .map((suggestion) => ({
        key: suggestion.key,
        label: suggestion.label,
        instrument: suggestion.instrument,
        color: suggestion.key === 'sp500' ? colors.bench : colors.series[SECTOR_COLOR],
        dashed: suggestion.key === 'sp500',
      }))
    const chosenKeys = new Set([mainKey, ...chosen.map((entry) => keyOf(entry.instrument))])
    const added = compare.added
      .filter((instrument) => !chosenKeys.has(keyOf(instrument)))
      .map((instrument, index) => ({
        key: `added:${keyOf(instrument)}`,
        label: instrument.symbol,
        instrument,
        color: colors.series[ADDED_COLORS[index]],
        removable: true,
      }))
    return [...chosen, ...added]
  }, [suggestions, compare, colors, mainKey])

  const charts = useCharts(
    entries.map((entry) => entry.instrument),
    { horizon: DAILY_HORIZON, count: WIDEST_RANGE_COUNT },
  )
  const lines = useMemo(() => {
    const others = entries.map((entry, index) => ({ key: entry.key, label: entry.label, bars: charts.data[index] ?? NO_BARS }))
    const rebased = compareLines({ key: 'main', label: slot.symbol, bars }, others)
    return rebased.map((line, index) =>
      index === 0
        ? { ...line, color: colors.ink, status: 'ok' }
        : { ...entries[index - 1], ...line, status: charts.status[index - 1] ?? 'loading' },
    )
  }, [entries, bars, slot.symbol, colors, charts])

  const base = bars[0]?.close ?? null
  const chartCompare = useMemo(
    () =>
      base
        ? {
            base,
            lines: lines
              .slice(1)
              .filter((line) => !hidden.has(line.key))
              .map((line) => ({ key: line.key, color: line.color, dashed: line.dashed, prices: pricesFor(line.values, base) })),
          }
        : null,
    [base, lines, hidden],
  )

  const takenKeys = new Set([
    mainKey,
    ...suggestions.map((suggestion) => keyOf(suggestion.instrument)),
    ...compare.added.map(keyOf),
  ])

  return {
    suggestions,
    lines,
    chartCompare,
    sentence: factSentence(lines, hidden),
    addedLeft: ADDED_LIMIT - compare.added.length,
    takenKeys,
  }
}
