import { useMemo, useState } from 'react'

import { useSymbolNoteMutation } from '../../api/queries'
import { chartLines, linePatch } from '../../lib/priceLines'

export function useChartLines({ symbol, note }) {
  const noteMutation = useSymbolNoteMutation(symbol)
  const [failedFor, setFailedFor] = useState(null)
  const lines = useMemo(() => chartLines(note), [note])

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }

  return {
    lines,
    saveFailed: failedFor === symbol,
    move: (line, price) => {
      const patch = linePatch(line, price)
      if (patch) noteMutation.mutate(patch, report)
    },
  }
}
