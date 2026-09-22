import { useQuery } from '@tanstack/react-query'
import { getTransactions } from '../client'
import { unwrap } from './shared'

export const transactionsKeys = {
  transactions: (query = '') => ['transactions', query],
}

export function useTransactions(query = '') {
  return useQuery({
    queryKey: transactionsKeys.transactions(query),
    queryFn: () => getTransactions(query),
    select: unwrap,
  })
}
