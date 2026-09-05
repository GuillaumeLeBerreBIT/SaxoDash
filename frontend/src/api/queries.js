import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { instrumentKey } from '../lib/research'

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
  getRiskMetrics,
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
  riskMetrics: (benchmark = 'world') => ['risk-metrics', benchmark],
  cashFlow: ['cash-flow'],
  saxoStatus: ['saxo-status'],
  // Every market-data key carries the whole instrument identity: a Uic alone
  // is ambiguous, and the backend keys on both halves.
  chart: (uic, assetType, horizon, count) =>
    ['chart', instrumentKey(uic, assetType), horizon, count],
  quotes: (uics, assetType) =>
    ['quotes', assetType, [...uics].sort((a, b) => a - b).join(',')],
  // Lowercased to match the backend's own search cache key.
  instrumentSearch: (query) => ['instrument-search', query.toLowerCase()],
  instrumentDetails: (uic, assetType) => ['instrument-details', instrumentKey(uic, assetType)],
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

// Portfolio-value history changes at most once a day, same as the net-worth
// chart it's derived from - no refetch interval needed.
export function useRiskMetrics(benchmark = 'world') {
  return useQuery({
    queryKey: queryKeys.riskMetrics(benchmark),
    queryFn: () => getRiskMetrics(benchmark),
    staleTime: 15 * 60_000,
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
    queryKey: queryKeys.chart(uic, assetType, horizon, count),
    queryFn: () => getChart({ uic, assetType, horizon, count }),
    // A daily candle cannot change until tomorrow, and Saxo rate-limits per
    // app, so this deliberately has no refetch interval.
    enabled: Boolean(uic && assetType),
    staleTime: 15 * 60_000,
  })
}

const quoteQuery = (uics, assetType) => ({
  queryKey: queryKeys.quotes(uics, assetType),
  queryFn: () => getQuotes({ uics, assetType }),
  enabled: uics.length > 0 && Boolean(assetType),
  refetchInterval: 30_000,
})

export function useQuotes(uics, assetType) {
  return useQuery(quoteQuery(uics, assetType))
}

/** One batched call per asset type, flattened into a single quote list.
 *
 *  Saxo prices one asset type per request, and a group whose call fails takes
 *  only its own rows down with it.
 */
export function useQuotesByAssetType(groups) {
  return useQueries({
    queries: groups.map(({ uics, assetType }) => quoteQuery(uics, assetType)),
    combine: (results) => ({
      data: results.flatMap((result) => result.data ?? []),
      isLoading: results.some((result) => result.isLoading),
    }),
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
