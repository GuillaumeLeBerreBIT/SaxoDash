import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addWatchlistItem,
  createWatchlist,
  deleteWatchlist,
  getBankAccounts,
  getCashFlow,
  getChart,
  getInstrumentDetails,
  getNetWorth,
  getNetWorthHistory,
  getPortfolioSummary,
  getPositions,
  getQuotes,
  getSaxoStatus,
  getTransactions,
  getWatchlists,
  removeWatchlistItem,
  searchInstruments,
  updateWatchlist,
} from './client'

// DRF paginates some list endpoints and not others, so callers used to write
// `res.results ?? res` at every site. Centralised here instead.
const unwrap = (res) => res?.results ?? res

export const queryKeys = {
  positions: ['positions'],
  portfolioSummary: ['portfolio-summary'],
  transactions: (query = '') => ['transactions', query],
  bankAccounts: ['bank-accounts'],
  netWorth: ['net-worth'],
  netWorthHistory: (range = 'ALL') => ['net-worth-history', range],
  cashFlow: ['cash-flow'],
  saxoStatus: ['saxo-status'],
  chart: (uic, horizon, count) => ['chart', uic, horizon, count],
  quotes: (uics) => ['quotes', [...uics].sort((a, b) => a - b).join(',')],
  instrumentSearch: (query) => ['instrument-search', query],
  instrumentDetails: (uic, assetType) => ['instrument-details', uic, assetType],
  watchlists: ['watchlists'],
}

export function usePositions() {
  return useQuery({ queryKey: queryKeys.positions, queryFn: getPositions, select: unwrap })
}

export function usePortfolioSummary() {
  return useQuery({ queryKey: queryKeys.portfolioSummary, queryFn: getPortfolioSummary })
}

export function useTransactions(query = '') {
  return useQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: () => getTransactions(query),
    select: unwrap,
  })
}

export function useBankAccounts() {
  return useQuery({ queryKey: queryKeys.bankAccounts, queryFn: getBankAccounts, select: unwrap })
}

export function useNetWorth() {
  return useQuery({ queryKey: queryKeys.netWorth, queryFn: getNetWorth })
}

// Sharing one query key per range means charts mounting together on a page fire
// one request, not one each.
export function useNetWorthHistory(range = 'ALL') {
  return useQuery({
    queryKey: queryKeys.netWorthHistory(range),
    queryFn: () => getNetWorthHistory(range),
    select: unwrap,
  })
}

export function useCashFlow() {
  return useQuery({ queryKey: queryKeys.cashFlow, queryFn: getCashFlow, select: unwrap })
}

export function useSaxoStatus() {
  return useQuery({
    queryKey: queryKeys.saxoStatus,
    queryFn: getSaxoStatus,
    // Connection can break server-side with no user action; recheck often.
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  })
}

// --- Research -------------------------------------------------------------

export function useChart({ uic, assetType, horizon = 1440, count = 252 }) {
  return useQuery({
    queryKey: queryKeys.chart(uic, horizon, count),
    queryFn: () => getChart({ uic, assetType, horizon, count }),
    // A daily candle cannot change until tomorrow, and Saxo rate-limits per
    // app, so this deliberately has no refetch interval.
    enabled: Boolean(uic && assetType),
    staleTime: 15 * 60_000,
  })
}

export function useQuotes(uics, assetType) {
  return useQuery({
    queryKey: queryKeys.quotes(uics),
    queryFn: () => getQuotes({ uics, assetType }),
    enabled: uics.length > 0 && Boolean(assetType),
    refetchInterval: 30_000,
  })
}

export function useInstrumentSearch(query) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: queryKeys.instrumentSearch(trimmed),
    queryFn: () => searchInstruments(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  })
}

export function useInstrumentDetails({ uic, assetType }) {
  return useQuery({
    queryKey: queryKeys.instrumentDetails(uic, assetType),
    queryFn: () => getInstrumentDetails({ uic, assetType }),
    enabled: Boolean(uic && assetType),
    staleTime: 60 * 60_000,
  })
}

export function useWatchlists() {
  return useQuery({
    queryKey: queryKeys.watchlists,
    queryFn: getWatchlists,
    select: unwrap,
    staleTime: 60_000,
  })
}

/** Every write to a watchlist, each refetching the lists on success.
 *
 *  One hook rather than six so a component takes the whole watchlist write
 *  surface in a single line, and so the invalidation lives in one place
 *  instead of being repeated at each call site.
 */
export function useWatchlistMutations() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlists })

  return {
    create: useMutation({ mutationFn: createWatchlist, onSuccess }),
    rename: useMutation({ mutationFn: ({ id, name }) => updateWatchlist(id, { name }), onSuccess }),
    remove: useMutation({ mutationFn: deleteWatchlist, onSuccess }),
    addItem: useMutation({ mutationFn: ({ id, item }) => addWatchlistItem(id, item), onSuccess }),
    removeItem: useMutation({
      mutationFn: ({ id, itemId }) => removeWatchlistItem(id, itemId),
      onSuccess,
    }),
  }
}
