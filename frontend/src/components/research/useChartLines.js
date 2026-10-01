import { useMemo, useState } from 'react'

import { useNoteLevelMutation, usePriceLineMutations, usePriceLines } from '../../api/queries'
import { chartLines, linePatch, roundPrice } from '../../lib/priceLines'

export function useChartLines({ symbol, uic, assetType, note }) {
  const noteMutation = useNoteLevelMutation(symbol)
  const saved = usePriceLines(uic, assetType)
  const lineMutations = usePriceLineMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  if (failedFor !== null && failedFor !== symbol) setFailedFor(null)
  const lines = useMemo(() => chartLines(note, saved.data ?? []), [note, saved.data])

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    lines,
    saveFailed: failedFor === symbol,
    move: (line, price) => {
      const patch = linePatch(line, price)
      if (patch) noteMutation.mutate(patch, report)
      else lineMutations.update.mutate({ id: line.id, patch: { price: cents(price) } }, report)
    },
    setLabel: (line, label) => lineMutations.update.mutate({ id: line.id, patch: { label } }, report),
    create: uic && assetType ? (price) => lineMutations.create.mutate({ price: cents(price) }, report) : undefined,
    remove: (line) => lineMutations.remove.mutate(line.id, report),
  }
}
