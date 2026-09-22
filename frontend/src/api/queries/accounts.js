import { useQuery } from '@tanstack/react-query'
import { getBankAccounts, getNetWorth } from '../client'
import { unwrap } from './shared'

export const accountsKeys = {
  bankAccounts: ['bank-accounts'],
  netWorth: ['net-worth'],
}

export function useBankAccounts() {
  return useQuery({ queryKey: accountsKeys.bankAccounts, queryFn: getBankAccounts, select: unwrap })
}

export function useNetWorth() {
  return useQuery({ queryKey: accountsKeys.netWorth, queryFn: getNetWorth })
}
