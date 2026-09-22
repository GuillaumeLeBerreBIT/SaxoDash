import { useQuery } from '@tanstack/react-query'
import { getNetWorthHistory } from '../client'
import { unwrap } from './shared'

export const coreKeys = {
  netWorthHistory: (range = 'ALL') => ['net-worth-history', range],
}

// Sharing one query key per range means charts mounting together on a page fire
// one request, not one each.
export function useNetWorthHistory(range = 'ALL') {
  return useQuery({
    queryKey: coreKeys.netWorthHistory(range),
    queryFn: () => getNetWorthHistory(range),
    select: unwrap,
  })
}
