import { apiFetch } from './http'

export const getVerdictSummary = (tickers) =>
  apiFetch(`/api/verdicts/?${new URLSearchParams({ tickers: tickers.join(',') }).toString()}`)

export const getVerdict = (ticker) => apiFetch(`/api/verdicts/${encodeURIComponent(ticker)}/`)

export const getVerdictTrackRecord = () => apiFetch('/api/verdicts/track-record/')
