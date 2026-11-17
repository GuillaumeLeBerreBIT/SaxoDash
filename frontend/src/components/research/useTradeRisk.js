import { useSyncExternalStore } from 'react'

import { readTradeRisk, subscribeTradeRisk, writeTradeRisk } from '../../lib/tradePlan'

export function useTradeRisk() {
  return [useSyncExternalStore(subscribeTradeRisk, readTradeRisk), writeTradeRisk]
}
