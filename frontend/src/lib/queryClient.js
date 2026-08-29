import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Backend syncs run on a schedule (positions every 30min, transactions
      // and the net-worth snapshot nightly), so data does not change between
      // one glance and the next. Refetching when the tab regains focus is the
      // signal that actually matters; a short staleTime keeps a tab-switch
      // from re-firing every query on the page.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // apiFetch already redirects to /login and throws on an unrecoverable
      // 401, so retrying that is pointless noise. One retry covers a blip.
      retry: 1,
    },
  },
})
