import { useQuery } from '@tanstack/react-query'
import { getPerformance, getRiskMetrics } from '../client'

export const analyticsKeys = {
  riskMetrics: (benchmark = 'world') => ['risk-metrics', benchmark],
  performance: (benchmark = 'world') => ['performance', benchmark],
}

// Portfolio-value history changes at most once a day, same as the net-worth
// chart it's derived from - no refetch interval needed.
export function useRiskMetrics(benchmark = 'world') {
  return useQuery({
    queryKey: analyticsKeys.riskMetrics(benchmark),
    queryFn: () => getRiskMetrics(benchmark),
    staleTime: 15 * 60_000,
  })
}

export function usePerformance(benchmark = 'world') {
  return useQuery({
    queryKey: analyticsKeys.performance(benchmark),
    queryFn: () => getPerformance(benchmark),
    staleTime: 15 * 60_000,
  })
}
