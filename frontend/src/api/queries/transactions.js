import { useQuery } from '@tanstack/react-query'
import { getCashFlow, getTransactions } from '../client'
import { unwrap } from './shared'

export const transactionsKeys = {
  transactions: (query = '') => ['transactions', query],
  cashFlow: ['cash-flow'],
}

export function useTransactions(query = '') {
  return useQuery({
    queryKey: transactionsKeys.transactions(query),
    queryFn: () => getTransactions(query),
    select: unwrap,
  })
}

export function useCashFlow() {
  return useQuery({ queryKey: transactionsKeys.cashFlow, queryFn: getCashFlow, select: unwrap })
}
