import { useWatchlistMutations, useWatchlists } from '../../api/queries'

export function useWatchlistToggle({ symbol, instrument, details, position }) {
  const { data: watchlists = [] } = useWatchlists()
  const { addItem, removeItem } = useWatchlistMutations()

  const toggleList = (list) => {
    const existing = list.items.find((item) => item.uic === instrument?.uic)
    if (existing) {
      removeItem.mutate({ id: list.id, itemId: existing.id })
      return
    }
    if (!instrument) return
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

  return { watchlists, toggleList }
}
