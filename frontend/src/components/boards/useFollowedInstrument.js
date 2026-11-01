import { useMemo } from 'react'

import { useInstrumentSearch, usePositions } from '../../api/queries'
import { companyDataStatus, listingCurrency } from '../../lib/companyData'
import { needsInstrumentSearch, resolveInstrument } from '../../lib/research'

export function useFollowedInstrument(symbol) {
  const { data: positions = [], isLoading: positionsLoading } = usePositions()
  const position = positions.find((p) => p.ticker === symbol) ?? null
  const { data: results = [], isResolving: searching = false } = useInstrumentSearch(
    needsInstrumentSearch(symbol, positions) ? symbol : '',
  )
  const instrument = useMemo(
    () => (symbol ? resolveInstrument({ symbol, positions, results: searching ? [] : results }) : null),
    [symbol, positions, results, searching],
  )
  const resolving = !instrument && Boolean(symbol) && (searching || Boolean(positionsLoading))
  const companyData = companyDataStatus({
    instrument,
    currency: listingCurrency({ position, instrument }),
    lookingUp: resolving,
  })
  return { instrument, position, resolving, companyData }
}
