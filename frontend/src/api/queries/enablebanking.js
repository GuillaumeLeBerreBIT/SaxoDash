import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createLabeledAccount,
  deleteLabeledAccount,
  getBankTransactions,
  getBudgetProgress,
  getBudgets,
  getEnableBankingStatus,
  getLabeledAccountCandidates,
  getLabeledAccounts,
  getSpendingSummary,
  getSpendingTrend,
  getSubscriptions,
  markTransactionReviewed,
  setBudget,
  syncBanksNow,
  updateBankTransactionCategory,
  updateLabeledAccount,
  updateSubscription,
} from '../client'
import { latestSyncedAt, syncAdvanced, syncOutcomeNote } from '../../lib/syncNow'
import { unwrap } from './shared'

export const enableBankingKeys = {
  enableBankingStatus: ['enablebanking-status'],
  bankTransactions: (query = '') => ['bank-transactions', query],
  spendingSummary: (query = '') => ['spending-summary', query],
  spendingTrend: (months = 6) => ['spending-trend', months],
  subscriptions: ['subscriptions'],
  budgets: ['budgets'],
  budgetProgress: ['budget-progress'],
  labeledAccounts: ['labeled-accounts'],
  labeledAccountCandidates: ['labeled-account-candidates'],
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

export function useMarkTransactionReviewed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markTransactionReviewed,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-transactions'] }),
  })
}

const SYNC_POLL_MS = 3_000
const SYNC_GIVE_UP_MS = 60_000
const SYNC_TIMED_OUT = 'No new data yet. The sync may still be running.'

export function useSyncNow() {
  const queryClient = useQueryClient()
  const { data: status } = useEnableBankingStatus()
  const [run, setRun] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [queueError, setQueueError] = useState(null)
  const queue = useMutation({ mutationFn: syncBanksNow })

  const advanced = run !== null && syncAdvanced(run.since, status)
  const syncing = run !== null && !advanced && now - run.startedAt < SYNC_GIVE_UP_MS
  const finished = run !== null && !syncing

  useEffect(() => {
    if (!syncing) return undefined
    const timer = setInterval(() => {
      setNow(Date.now())
      queryClient.invalidateQueries({ queryKey: enableBankingKeys.enableBankingStatus })
    }, SYNC_POLL_MS)
    return () => clearInterval(timer)
  }, [syncing, queryClient])

  useEffect(() => {
    if (!finished) return
    queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
    queryClient.invalidateQueries({ queryKey: ['spending-summary'] })
    queryClient.invalidateQueries({ queryKey: ['spending-trend'] })
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['net-worth'] })
  }, [finished, queryClient])

  const syncNow = async () => {
    setQueueError(null)
    const baseline = status ?? (await queryClient.fetchQuery({
      queryKey: enableBankingKeys.enableBankingStatus,
      queryFn: getEnableBankingStatus,
    }))
    const since = latestSyncedAt(baseline)
    queue.mutate(undefined, {
      onSuccess: () => {
        const startedAt = Date.now()
        setNow(startedAt)
        setRun({ since, startedAt })
      },
      onError: (error) => setQueueError(error.message),
    })
  }

  let note = ''
  if (finished) note = advanced ? syncOutcomeNote(status) : SYNC_TIMED_OUT

  return { syncNow, syncing: syncing || queue.isPending, queueError, note }
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

export function useLabeledAccounts() {
  return useQuery({ queryKey: enableBankingKeys.labeledAccounts, queryFn: getLabeledAccounts, select: unwrap })
}

export function useLabeledAccountCandidates() {
  return useQuery({
    queryKey: enableBankingKeys.labeledAccountCandidates,
    queryFn: getLabeledAccountCandidates,
    select: unwrap,
  })
}

// Saving a label recategorizes matching transactions immediately (see the
// backend), so every view built from BankTransaction.category needs
// invalidating too - not just the labeled-accounts list itself.
function invalidateLabelEffects(queryClient) {
  queryClient.invalidateQueries({ queryKey: enableBankingKeys.labeledAccounts })
  queryClient.invalidateQueries({ queryKey: enableBankingKeys.labeledAccountCandidates })
  queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
  queryClient.invalidateQueries({ queryKey: ['spending-summary'] })
  queryClient.invalidateQueries({ queryKey: ['spending-trend'] })
  queryClient.invalidateQueries({ queryKey: enableBankingKeys.budgetProgress })
}

export function useCreateLabeledAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createLabeledAccount,
    onSuccess: () => invalidateLabelEffects(queryClient),
  })
}

export function useUpdateLabeledAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateLabeledAccount(id, patch),
    onSuccess: () => invalidateLabelEffects(queryClient),
  })
}

export function useDeleteLabeledAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteLabeledAccount,
    onSuccess: () => invalidateLabelEffects(queryClient),
  })
}
