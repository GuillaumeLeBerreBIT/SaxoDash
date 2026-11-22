import { useWatchlistMutations, useWatchlists } from '../../api/queries'

export function useWatchlistToggle({ symbol, instrument, details, position }) {
  const { data: watchlists = [], isLoading: listsLoading, error: listsError, refetch: retryLists } = useWatchlists()
  const { addItem, removeItem } = useWatchlistMutations()

  const toggleList = (list) => {
    if (addItem.isPending || removeItem.isPending) return
    addItem.reset?.()
    removeItem.reset?.()
    const existing = list.items.find((item) => item.uic === instrument?.uic)
    if (existing) {
      removeItem.mutate({ id: list.id, itemId: existing.id })
      return
    }
    if (instrument?.uic == null) return
    addItem.mutate({
      id: list.id,
      item: {
        symbol,
        uic: instrument.uic,
        asset_type: instrument.assetType,
        description: details?.description ?? position?.name ?? '',
        exchange: details?.exchange ?? '',
      },
    })
  }

  return { watchlists, toggleList, pending: addItem.isPending || removeItem.isPending, error: addItem.error || removeItem.error, listsLoading, listsError, retryLists }
}
