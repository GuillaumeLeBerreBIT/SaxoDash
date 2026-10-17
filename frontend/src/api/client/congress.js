import { apiFetch } from './http'

export const getCongressMembers = () => apiFetch('/api/congress/members/')

export const getCongressMember = (slug) => apiFetch(`/api/congress/members/${encodeURIComponent(slug)}/`)

export const getCongressOwnershipSummary = (tickers) =>
  apiFetch(`/api/congress/ownership/?${new URLSearchParams({ tickers: tickers.join(',') }).toString()}`)

export const getCongressOwnership = (ticker) => apiFetch(`/api/congress/ownership/${encodeURIComponent(ticker)}/`)
