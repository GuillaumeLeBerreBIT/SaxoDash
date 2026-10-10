import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addInvestor, getInvestor, getInvestorChanges, getInvestorHub, getInvestors, getInvestorStocks,
  searchFilers, setInvestorFollowed, stopTrackingInvestor,
} from '../client'

const IMPORT_POLL_MS = 4000
const SEARCH_MIN = 3
const LISTS = ['investors']

export const investorsKeys = {
  list: (holds = '') => ['investors', holds],
  detail: (slug, quarter) => ['investor', slug, quarter ?? 'latest'],
  changes: (slug, quarter) => ['investor-changes', slug, quarter ?? 'latest'],
  hub: ['investor-hub'],
  stocks: (view, quarter) => ['investor-stocks', view, quarter ?? 'signal'],
  search: (q) => ['investor-search', q],
}

const importing = (cards) => Array.isArray(cards) && cards.some((card) => card.import)

export function useInvestors({ holds = '' } = {}) {
  return useQuery({
    queryKey: investorsKeys.list(holds),
    queryFn: () => getInvestors(holds),
    refetchInterval: (query) => (importing(query.state.data) ? IMPORT_POLL_MS : false),
  })
}

export function useInvestor(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.detail(slug, quarter),
    queryFn: () => getInvestor(slug, quarter),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.import ? IMPORT_POLL_MS : false),
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

export function useInvestorHub() {
  return useQuery({ queryKey: investorsKeys.hub, queryFn: getInvestorHub })
}

export function useInvestorStocks(view, quarter) {
  return useQuery({
    queryKey: investorsKeys.stocks(view, quarter),
    queryFn: () => getInvestorStocks(view, quarter),
    placeholderData: keepPreviousData,
  })
}

export function useInvestorSearch(q) {
  return useQuery({
    queryKey: investorsKeys.search(q),
    queryFn: () => searchFilers(q),
    enabled: q.length >= SEARCH_MIN,
    staleTime: 60_000,
    retry: false,
  })
}

export function usePrefetchInvestor() {
  const queryClient = useQueryClient()
  return (slug) =>
    queryClient.prefetchQuery({ queryKey: investorsKeys.detail(slug), queryFn: () => getInvestor(slug), staleTime: 30_000 })
}

export function useFollowInvestor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, followed }) => setInvestorFollowed(slug, followed),
    onMutate: async ({ slug, followed }) => {
      const detail = ['investor', slug]
      await Promise.all([queryClient.cancelQueries({ queryKey: LISTS }), queryClient.cancelQueries({ queryKey: detail })])
      const snapshots = [...queryClient.getQueriesData({ queryKey: LISTS }), ...queryClient.getQueriesData({ queryKey: detail })]
      queryClient.setQueriesData({ queryKey: LISTS }, (cards) =>
        Array.isArray(cards) ? cards.map((card) => (card.slug === slug ? { ...card, followed } : card)) : cards)
      queryClient.setQueriesData({ queryKey: detail }, (data) => (data ? { ...data, followed } : data))
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: (_data, _error, { slug }) => {
      queryClient.invalidateQueries({ queryKey: LISTS })
      queryClient.invalidateQueries({ queryKey: ['investor', slug] })
      queryClient.invalidateQueries({ queryKey: investorsKeys.hub })
    },
  })
}

function useRosterChange(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTS })
      queryClient.invalidateQueries({ queryKey: investorsKeys.hub })
    },
  })
}

export const useAddInvestor = () => useRosterChange((cik) => addInvestor(cik))

export const useStopTracking = () => useRosterChange((slug) => stopTrackingInvestor(slug))
