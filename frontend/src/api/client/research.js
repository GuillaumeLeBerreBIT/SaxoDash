import { apiFetch, jsonRequest } from './http'

// Research: market data proxied through the backend, and watchlist CRUD.
export const getChart = ({ uic, assetType, horizon = 1440, count = 252 }) =>
  apiFetch(
    `/api/research/chart/?uic=${uic}&asset_type=${assetType}&horizon=${horizon}&count=${count}`,
  )

export const getQuotes = ({ uics, assetType }) =>
  apiFetch(`/api/research/quotes/?uics=${uics.join(',')}&asset_type=${assetType}`)

export const searchInstruments = (query, assetTypes = 'Stock,Etf') =>
  apiFetch(`/api/research/instruments/?q=${encodeURIComponent(query)}&asset_types=${assetTypes}`)

export const getInstrumentDetails = ({ uic, assetType }) =>
  apiFetch(`/api/research/instruments/${uic}/${assetType}/`)

export const getFundamentals = (symbol) => apiFetch(`/api/research/fundamentals/${symbol}/`)
export const getCompanyNews = (symbol) => apiFetch(`/api/research/news/${symbol}/`)
export const getPeers = (symbol) => apiFetch(`/api/research/peers/${symbol}/`)
export const getEarningsCalendar = (scope = 'all', week = 0) =>
  apiFetch(`/api/research/earnings/calendar/?scope=${scope}&week=${week}`)
export const getSymbolEarnings = (symbol) => apiFetch(`/api/research/earnings/${symbol}/`)

export const getSymbolNote = (symbol) => apiFetch(`/api/research/notes/${symbol}/`)
export const updateSymbolNote = (symbol, patch) =>
  jsonRequest(`/api/research/notes/${symbol}/`, 'PATCH', patch)

export const getWatchlists = () => apiFetch('/api/research/watchlists/')
export const createWatchlist = (name) => jsonRequest('/api/research/watchlists/', 'POST', { name })
export const updateWatchlist = (id, patch) =>
  jsonRequest(`/api/research/watchlists/${id}/`, 'PATCH', patch)
export const deleteWatchlist = (id) =>
  apiFetch(`/api/research/watchlists/${id}/`, { method: 'DELETE' })

export const addWatchlistItem = (id, item) =>
  jsonRequest(`/api/research/watchlists/${id}/items/`, 'POST', item)
export const removeWatchlistItem = (id, itemId) =>
  apiFetch(`/api/research/watchlists/${id}/items/${itemId}/`, { method: 'DELETE' })
