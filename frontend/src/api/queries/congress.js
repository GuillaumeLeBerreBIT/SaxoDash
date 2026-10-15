import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'

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

export const MAX_SUMMARY_TICKERS = 200

function chunked(items, size) {
  const chunks = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}

const mergeSummaries = (results) => {
  const answered = results.filter((result) => result.data)
  if (answered.length === 0) return { data: undefined, isLoading: results.some((result) => result.isLoading) }
  return {
    data: {
      window_days: answered[0].data.window_days,
      stocks: Object.assign({}, ...answered.map((result) => result.data.stocks)),
    },
    isLoading: false,
  }
}

export function useCongressOwnershipSummary(tickers) {
  return useQueries({
    queries: chunked(tickers, MAX_SUMMARY_TICKERS).map((chunk) => ({
      queryKey: congressKeys.ownershipSummary(chunk),
      queryFn: () => getCongressOwnershipSummary(chunk),
      placeholderData: keepPreviousData,
    })),
    combine: mergeSummaries,
  })
}

export function useCongressOwnership(ticker) {
  return useQuery({ queryKey: congressKeys.ownership(ticker), queryFn: () => getCongressOwnership(ticker), enabled: Boolean(ticker) })
}
