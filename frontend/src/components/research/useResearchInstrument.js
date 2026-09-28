import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInstrumentSearch, usePositions } from '../../api/queries'
import { needsInstrumentSearch, resolveInstrument } from '../../lib/research'
import { pushRecentSymbol } from '../../lib/recentSymbols'

const FALLBACK_SYMBOL = 'NVDA'

export function useResearchInstrument() {
  const [params, setParams] = useSearchParams()
  const { data: positions = [] } = usePositions()
  const symbol = params.get('symbol') ?? positions[0]?.ticker ?? FALLBACK_SYMBOL
  const position = positions.find((p) => p.ticker === symbol) ?? null

  useEffect(() => {
    pushRecentSymbol(symbol)
  }, [symbol])

  // Only searched for when the portfolio cannot answer: a held instrument
  // already knows its own uic.
  const { data: searchResults = [] } = useInstrumentSearch(
    needsInstrumentSearch(symbol, positions) ? symbol : '',
  )
  // A search dropdown (⌘K, add-peer) may have already picked the exact row
  // for an ambiguous ticker - e.g. ServiceNow vs. NowVertical under "NOW".
  // Carried in the URL so that choice survives the symbol search re-running.
  const pinnedUic = Number(params.get('uic')) || null
  const pinnedAssetType = params.get('assetType')
  const instrument = useMemo(() => {
    const pinned = pinnedUic ? { uic: pinnedUic, assetType: pinnedAssetType } : null
    return resolveInstrument({ symbol, positions, results: searchResults, pinned })
  }, [symbol, positions, searchResults, pinnedUic, pinnedAssetType])

  // `instrument`, when the caller already has it (a watchlist row, a search
  // pick), pins the exact uic so an ambiguous ticker like "NOW" can't
  // resolve to the wrong company once symbol search runs again on arrival.
  const selectSymbol = (next, picked) => {
    const nextParams = { symbol: next }
    if (picked?.uic) {
      nextParams.uic = picked.uic
      if (picked.assetType) nextParams.assetType = picked.assetType
    }
    setParams(nextParams, { replace: true })
  }

  return { symbol, instrument, position, positions, selectSymbol }
}
