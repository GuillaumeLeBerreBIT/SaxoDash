import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getCongressMember, getCongressMembers, getCongressOwnership, getCongressOwnershipSummary } from '../client'

export const congressKeys = {
  members: ['congress-members'],
  member: (slug) => ['congress-member', slug],
  ownershipSummary: (tickers) => ['congress-ownership', 'summary', tickers.join(',')],
  ownership: (ticker) => ['congress-ownership', 'detail', ticker],
}

export function useCongressMembers() {
  return useQuery({ queryKey: congressKeys.members, queryFn: getCongressMembers })
}

export function useCongressMember(slug) {
  return useQuery({ queryKey: congressKeys.member(slug), queryFn: () => getCongressMember(slug), enabled: Boolean(slug) })
}

export function useCongressOwnershipSummary(tickers) {
  return useQuery({
    queryKey: congressKeys.ownershipSummary(tickers),
    queryFn: () => getCongressOwnershipSummary(tickers),
    enabled: tickers.length > 0,
    placeholderData: keepPreviousData,
  })
}

export function useCongressOwnership(ticker) {
  return useQuery({ queryKey: congressKeys.ownership(ticker), queryFn: () => getCongressOwnership(ticker), enabled: Boolean(ticker) })
}
