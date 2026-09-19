import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { ALL_ASSET_TYPES, instrumentKey, quotesByUic, uicsByAssetType } from '../lib/research'
import { useDebouncedValue } from '../lib/useDebouncedValue'

import {
  addWatchlistItem,
  createWatchlist,
  deleteWatchlist,
  getBankAccounts,
  getBankTransactions,
  getBudgetProgress,
  getBudgets,
  getCashFlow,
  getChart,
  getCompanyNews,
  getEarningsCalendar,
  getEnableBankingStatus,
  getFundamentals,
  getInstrumentDetails,
  getNetWorth,
  getNetWorthHistory,
  getPeers,
  getPortfolioInsights,
  getPortfolioSummary,
  getRiskMetrics,
  getPerformance,
  getPositions,
  getQuotes,
  getSaxoStatus,
  getSpendingSummary,
  getSpendingTrend,
  getSubscriptions,
  getSymbolEarnings,
  getSymbolNote,
  getTransactions,
  getWatchlists,
  removeWatchlistItem,
  searchInstruments,
  setBudget,
  updateBankTransactionCategory,
  updateSubscription,
  updateSymbolNote,
  updateWatchlist,
} from './client'

// DRF paginates some list endpoints and not others, so callers used to write
// `res.results ?? res` at every site. Centralised here instead.
const unwrap = (res) => res?.results ?? res

export const queryKeys = {
  positions: ['positions'],
  portfolioSummary: ['portfolio-summary'],
  portfolioInsights: ['portfolio-insights'],
  transactions: (query = '') => ['transactions', query],
  bankAccounts: ['bank-accounts'],
  bankTransactions: (query = '') => ['bank-transactions', query],
  budgets: ['budgets'],
  budgetProgress: ['budget-progress'],
  netWorth: ['net-worth'],
  netWorthHistory: (range = 'ALL') => ['net-worth-history', range],
  riskMetrics: (benchmark = 'world') => ['risk-metrics', benchmark],
  performance: (benchmark = 'world') => ['performance', benchmark],
  cashFlow: ['cash-flow'],
  saxoStatus: ['saxo-status'],
  enableBankingStatus: ['enablebanking-status'],
  spendingSummary: (query = '') => ['spending-summary', query],
  spendingTrend: (months = 6) => ['spending-trend', months],
  subscriptions: ['subscriptions'],
  // Every market-data key carries the whole instrument identity: a Uic alone
  // is ambiguous, and the backend keys on both halves.
  chart: (uic, assetType, horizon, count) =>
    ['chart', instrumentKey(uic, assetType), horizon, count],
  quotes: (uics, assetType) =>
    ['quotes', assetType, [...uics].sort((a, b) => a - b).join(',')],
  // Lowercased to match the backend's own search cache key.
  instrumentSearch: (query, assetTypes) => ['instrument-search', query.toLowerCase(), assetTypes],
  instrumentDetails: (uic, assetType) => ['instrument-details', instrumentKey(uic, assetType)],
  fundamentals: (symbol) => ['fundamentals', symbol],
  companyNews: (symbol) => ['company-news', symbol],
  peers: (symbol) => ['peers', symbol],
  earningsCalendar: (scope = 'all', week = 0) => ['earnings-calendar', scope, week],
  symbolEarnings: (symbol) => ['symbol-earnings', symbol],
  symbolNote: (symbol) => ['symbol-note', symbol],
  watchlists: ['watchlists'],
}

export function usePositions() {
  return useQuery({ queryKey: queryKeys.positions, queryFn: getPositions, select: unwrap })
}

export function usePortfolioSummary() {
  return useQuery({ queryKey: queryKeys.portfolioSummary, queryFn: getPortfolioSummary })
}

// EOD data (one daily snapshot); 5-minute client staleness is plenty.
export function usePortfolioInsights() {
  return useQuery({
    queryKey: queryKeys.portfolioInsights,
    queryFn: getPortfolioInsights,
    staleTime: 5 * 60_000,
  })
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

export function useBankTransactions(query = '') {
  return useQuery({
    queryKey: queryKeys.bankTransactions(query),
    queryFn: () => getBankTransactions(query),
    select: unwrap,
  })
}

export function useSpendingSummary(query = '') {
  return useQuery({
    queryKey: queryKeys.spendingSummary(query),
    queryFn: () => getSpendingSummary(query),
  })
}

export function useSpendingTrend(months = 6) {
  return useQuery({ queryKey: queryKeys.spendingTrend(months), queryFn: () => getSpendingTrend(months) })
}

export function useSubscriptions() {
  return useQuery({ queryKey: queryKeys.subscriptions, queryFn: getSubscriptions })
}

export function useUpdateBankTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, category }) => updateBankTransactionCategory(id, category),
    onSuccess: () => {
      // Prefix-match every '?account=…'-scoped list, not just the unscoped one.
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.spendingSummary() })
    },
  })
}

export function useDismissSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dismissed }) => updateSubscription(id, { dismissed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions }),
  })
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

export function usePerformance(benchmark = 'world') {
  return useQuery({
    queryKey: queryKeys.performance(benchmark),
    queryFn: () => getPerformance(benchmark),
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

export function useEnableBankingStatus() {
  return useQuery({
    queryKey: queryKeys.enableBankingStatus,
    queryFn: getEnableBankingStatus,
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

/** Live quotes for a list of positions, keyed by uic - a position's own
 *  price is broker-derived (see backend/saxo/mapping.py), not live, so
 *  today's % move has to come from here instead. Dashboard's top positions
 *  and Portfolio's holdings table both want it next to the same rows. */
export function usePositionQuotes(positions = []) {
  const groups = uicsByAssetType(positions)
  const { data } = useQuotesByAssetType(groups)
  return useMemo(() => quotesByUic(data), [data])
}

export function useInstrumentSearch(query, assetTypes = ALL_ASSET_TYPES) {
  // Without this, every keystroke fires its own request - typing a symbol
  // out blows through the backend's research.search throttle (20/min,
  // shared with Saxo's own per-app rate limit) well before the user is done
  // typing.
  const trimmed = useDebouncedValue(query.trim(), 300)
  return useQuery({
    queryKey: queryKeys.instrumentSearch(trimmed, assetTypes),
    queryFn: () => searchInstruments(trimmed, assetTypes),
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

// Fundamentals don't move intraday - the 24h staleTime matches the backend's
// own cache TTL, so there is no point refetching sooner than the data can change.
export function useFundamentals(symbol) {
  return useQuery({
    queryKey: queryKeys.fundamentals(symbol),
    queryFn: () => getFundamentals(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  })
}

// News is a slow feed; 1h client staleness sits under the backend's 2h cache.
export function useCompanyNews(symbol) {
  return useQuery({
    queryKey: queryKeys.companyNews(symbol),
    queryFn: () => getCompanyNews(symbol),
    enabled: !!symbol,
    staleTime: 60 * 60_000,
  })
}

// Peer sets rarely change; 24h matches the backend's own cache TTL.
export function usePeers(symbol) {
  return useQuery({
    queryKey: queryKeys.peers(symbol),
    queryFn: () => getPeers(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  })
}

// Same per-symbol fundamentals fetch useFundamentals uses, once per resolved
// peer slot - a manually swapped-in symbol goes through the identical path,
// and the cache is shared with any tab already showing that symbol.
export function usePeerFundamentals(symbols) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: queryKeys.fundamentals(symbol),
      queryFn: () => getFundamentals(symbol),
      staleTime: 24 * 60 * 60_000,
    })),
  })
}

// The market calendar is a slow-moving aggregate; 12h matches the backend's
// per-week cache TTL. `scope` ('all' | 'mine') and `week` offset are part of
// the key so each view caches separately.
export function useEarningsCalendar(scope = 'all', week = 0) {
  return useQuery({
    queryKey: queryKeys.earningsCalendar(scope, week),
    queryFn: () => getEarningsCalendar(scope, week),
    staleTime: 12 * 60 * 60_000,
  })
}

export function useSymbolEarnings(symbol) {
  return useQuery({
    queryKey: queryKeys.symbolEarnings(symbol),
    queryFn: () => getSymbolEarnings(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  })
}

export function useSymbolNote(symbol) {
  return useQuery({
    queryKey: queryKeys.symbolNote(symbol),
    queryFn: () => getSymbolNote(symbol),
    enabled: !!symbol,
  })
}

export function useSymbolNoteMutation(symbol) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch) => updateSymbolNote(symbol, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.symbolNote(symbol) }),
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

export function useBudgets() {
  return useQuery({ queryKey: queryKeys.budgets, queryFn: getBudgets })
}

export function useBudgetProgress() {
  return useQuery({ queryKey: queryKeys.budgetProgress, queryFn: getBudgetProgress })
}

export function useSetBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ category, monthlyLimit }) => setBudget(category, monthlyLimit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets })
      queryClient.invalidateQueries({ queryKey: queryKeys.budgetProgress })
    },
  })
}
