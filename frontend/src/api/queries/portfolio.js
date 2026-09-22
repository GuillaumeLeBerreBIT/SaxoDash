import { useQuery } from '@tanstack/react-query'
import { getPortfolioInsights, getPortfolioSummary, getPositions } from '../client'
import { unwrap } from './shared'

export const portfolioKeys = {
  positions: ['positions'],
  portfolioSummary: ['portfolio-summary'],
  portfolioInsights: ['portfolio-insights'],
}

export function usePositions() {
  return useQuery({ queryKey: portfolioKeys.positions, queryFn: getPositions, select: unwrap })
}

export function usePortfolioSummary() {
  return useQuery({ queryKey: portfolioKeys.portfolioSummary, queryFn: getPortfolioSummary })
}

// EOD data (one daily snapshot); 5-minute client staleness is plenty.
export function usePortfolioInsights() {
  return useQuery({
    queryKey: portfolioKeys.portfolioInsights,
    queryFn: getPortfolioInsights,
    staleTime: 5 * 60_000,
  })
}
