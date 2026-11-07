import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { changePassword, getMe, logout, signOutEverywhere, updateMe } from '../client'

export const authKeys = {
  me: ['me'],
}

export function useMe() {
  return useQuery({ queryKey: authKeys.me, queryFn: getMe, staleTime: 5 * 60_000 })
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes) => updateMe(changes),
    onSuccess: (me) => queryClient.setQueryData(authKeys.me, me),
  })
}

export function useStartSession() {
  const queryClient = useQueryClient()
  return () => queryClient.clear()
}

export function useChangePassword() {
  return useMutation({ mutationFn: (passwords) => changePassword(passwords) })
}

export function useSignOutEverywhere() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await signOutEverywhere()
      await logout()
    },
    onSuccess: () => queryClient.clear(),
  })
}
