import { useState } from 'react'

import { useChartZoneMutations, useChartZones } from '../../api/queries'
import { toZoneShape, zoneFromPoints } from '../../lib/chartZones'
import { roundPrice } from '../../lib/priceLines'

export function useSavedChartZones({ symbol, uic, assetType }) {
  const saved = useChartZones(uic, assetType)
  const mutations = useChartZoneMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  if (failedFor !== null && failedFor !== symbol) setFailedFor(null)

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    zones: (saved.data ?? []).map(toZoneShape),
    saveFailed: failedFor === symbol,
    create:
      uic && assetType
        ? (start, end) => {
            const zone = zoneFromPoints(start, end)
            mutations.create.mutate(
              {
                startBarDate: zone.startBarDate,
                endBarDate: zone.endBarDate,
                lowPrice: cents(zone.low),
                highPrice: cents(zone.high),
              },
              report,
            )
          }
        : undefined,
    remove: (zone) => mutations.remove.mutate(zone.id, report),
  }
}
