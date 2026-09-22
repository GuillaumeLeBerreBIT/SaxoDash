import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getBankTransactions,
  getBudgetProgress,
  getBudgets,
  getEnableBankingStatus,
  getSpendingSummary,
  getSpendingTrend,
  getSubscriptions,
  setBudget,
  updateBankTransactionCategory,
  updateSubscription,
} from '../client'
import { unwrap } from './shared'

export const enableBankingKeys = {
  enableBankingStatus: ['enablebanking-status'],
  bankTransactions: (query = '') => ['bank-transactions', query],
  spendingSummary: (query = '') => ['spending-summary', query],
  spendingTrend: (months = 6) => ['spending-trend', months],
  subscriptions: ['subscriptions'],
  budgets: ['budgets'],
  budgetProgress: ['budget-progress'],
}

export function useEnableBankingStatus() {
  return useQuery({
    queryKey: enableBankingKeys.enableBankingStatus,
    queryFn: getEnableBankingStatus,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  })
}

export function useBankTransactions(query = '') {
  return useQuery({
    queryKey: enableBankingKeys.bankTransactions(query),
    queryFn: () => getBankTransactions(query),
    select: unwrap,
  })
}

export function useSpendingSummary(query = '') {
  return useQuery({
    queryKey: enableBankingKeys.spendingSummary(query),
    queryFn: () => getSpendingSummary(query),
  })
}

export function useSpendingTrend(months = 6) {
  return useQuery({ queryKey: enableBankingKeys.spendingTrend(months), queryFn: () => getSpendingTrend(months) })
}

export function useSubscriptions() {
  return useQuery({ queryKey: enableBankingKeys.subscriptions, queryFn: getSubscriptions })
}

export function useUpdateBankTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, category }) => updateBankTransactionCategory(id, category),
    onSuccess: () => {
      // Prefix-match every '?account=…'-scoped list, not just the unscoped one.
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['spending-summary'] })
      queryClient.invalidateQueries({ queryKey: ['spending-trend'] })
      queryClient.invalidateQueries({ queryKey: enableBankingKeys.budgetProgress })
    },
  })
}

export function useDismissSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dismissed }) => updateSubscription(id, { dismissed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: enableBankingKeys.subscriptions }),
  })
}

export function useBudgets() {
  return useQuery({ queryKey: enableBankingKeys.budgets, queryFn: getBudgets })
}

export function useBudgetProgress() {
  return useQuery({ queryKey: enableBankingKeys.budgetProgress, queryFn: getBudgetProgress })
}

export function useSetBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ category, monthlyLimit }) => setBudget(category, monthlyLimit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enableBankingKeys.budgets })
      queryClient.invalidateQueries({ queryKey: enableBankingKeys.budgetProgress })
    },
  })
}
