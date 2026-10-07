import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getInvestor, getInvestorChanges, getInvestors } from '../client'

export const investorsKeys = {
  list: (holds = '') => ['investors', holds],
  detail: (slug, quarter) => ['investor', slug, quarter ?? 'latest'],
  changes: (slug, quarter) => ['investor-changes', slug, quarter ?? 'latest'],
}

export function useInvestors({ holds = '' } = {}) {
  return useQuery({ queryKey: investorsKeys.list(holds), queryFn: () => getInvestors(holds) })
}

export function useInvestor(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.detail(slug, quarter),
    queryFn: () => getInvestor(slug, quarter),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  })
}

export function useInvestorChanges(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.changes(slug, quarter),
    queryFn: () => getInvestorChanges(slug, quarter),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  })
}
