import { apiFetch } from './http'

export const getSignals = () => apiFetch('/api/signals/')

export const getStockSignals = (ticker) => apiFetch(`/api/signals/${encodeURIComponent(ticker)}/`)
