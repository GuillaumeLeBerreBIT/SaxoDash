import { useQuery } from '@tanstack/react-query'

import { getSignals, getStockSignals } from '../client'

const HOUR = 60 * 60 * 1000

export const signalKeys = {
  catalogue: ['signals', 'catalogue'],
  stock: (ticker) => ['signals', 'stock', ticker],
}

export function useSignals({ enabled = true } = {}) {
  return useQuery({
    queryKey: signalKeys.catalogue,
    queryFn: getSignals,
    enabled,
    staleTime: HOUR,
    select: (answer) => answer.signals,
  })
}

export function useStockSignals(ticker) {
  return useQuery({
    queryKey: signalKeys.stock(ticker),
    queryFn: () => getStockSignals(ticker),
    enabled: Boolean(ticker),
    staleTime: HOUR,
    select: (answer) => answer.stock_signals,
  })
}
