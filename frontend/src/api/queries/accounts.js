import { useQuery } from '@tanstack/react-query'
import { getNetWorth } from '../client'

export const accountsKeys = {
  netWorth: ['net-worth'],
}

export function useNetWorth() {
  return useQuery({ queryKey: accountsKeys.netWorth, queryFn: getNetWorth })
}
