import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearAccountHistory, getSaxoStatus } from '../client'

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

export function useClearAccountHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: clearAccountHistory,
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['performance'] }),
      queryClient.invalidateQueries({ queryKey: ['risk-metrics'] }),
    ]),
  })
}
