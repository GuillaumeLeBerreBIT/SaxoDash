import { useState } from 'react'

import { useTextAnnotationMutations, useTextAnnotations } from '../../api/queries'
import { roundPrice } from '../../lib/priceLines'
import { toTextAnnotationShape } from '../../lib/textAnnotations'

export function useChartTextAnnotations({ symbol, uic, assetType }) {
  const saved = useTextAnnotations(uic, assetType)
  const mutations = useTextAnnotationMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  if (failedFor !== null && failedFor !== symbol) setFailedFor(null)

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    items: (saved.data ?? []).map(toTextAnnotationShape),
    saveFailed: failedFor === symbol,
    create:
      uic && assetType
        ? ({ barDate, price, text }) =>
            mutations.create.mutate({ barDate, price: cents(price), text }, report)
        : undefined,
    move: (item, point) =>
      mutations.update.mutate({ id: item.id, patch: { bar_date: point.barDate, price: cents(point.price) } }, report),
    setText: (item, text) => mutations.update.mutate({ id: item.id, patch: { text } }, report),
    remove: (item) => mutations.remove.mutate(item.id, report),
  }
}
