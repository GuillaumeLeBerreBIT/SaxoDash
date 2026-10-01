import { useState } from 'react'

import { useTrendLineMutations, useTrendLines } from '../../api/queries'
import { roundPrice } from '../../lib/priceLines'
import { toTrendLineShape } from '../../lib/trendLines'

export function useChartTrendLines({ symbol, uic, assetType }) {
  const saved = useTrendLines(uic, assetType)
  const mutations = useTrendLineMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  if (failedFor !== null && failedFor !== symbol) setFailedFor(null)

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    lines: (saved.data ?? []).map(toTrendLineShape),
    saveFailed: failedFor === symbol,
    create:
      uic && assetType
        ? (start, end) =>
            mutations.create.mutate(
              {
                startBarDate: start.barDate,
                startPrice: cents(start.price),
                endBarDate: end.barDate,
                endPrice: cents(end.price),
              },
              report,
            )
        : undefined,
    moveEndpoint: (line, endpoint, point) =>
      mutations.update.mutate(
        {
          id: line.id,
          patch:
            endpoint === 'start'
              ? { start_bar_date: point.barDate, start_price: cents(point.price) }
              : { end_bar_date: point.barDate, end_price: cents(point.price) },
        },
        report,
      ),
    setLabel: (line, label) => mutations.update.mutate({ id: line.id, patch: { label } }, report),
    remove: (line) => mutations.remove.mutate(line.id, report),
  }
}
