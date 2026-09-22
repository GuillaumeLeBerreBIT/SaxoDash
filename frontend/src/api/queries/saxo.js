import { useQuery } from '@tanstack/react-query'
import { getSaxoStatus } from '../client'

export const saxoKeys = {
  saxoStatus: ['saxo-status'],
}

export function useSaxoStatus() {
  return useQuery({
    queryKey: saxoKeys.saxoStatus,
    queryFn: getSaxoStatus,
    // Connection can break server-side with no user action; recheck often.
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  })
}
