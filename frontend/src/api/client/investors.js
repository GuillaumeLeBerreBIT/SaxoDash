import { apiFetch, jsonRequest } from './http'

const quarterQuery = (quarter) => (quarter ? `?quarter=${encodeURIComponent(quarter)}` : '')

const query = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString()
  return search ? `?${search}` : ''
}

export const getInvestors = (holds = '') =>
  apiFetch(`/api/investors/${holds ? `?holds=${encodeURIComponent(holds)}` : ''}`)

export const getInvestor = (slug, quarter) => apiFetch(`/api/investors/${slug}/${quarterQuery(quarter)}`)

export const getInvestorChanges = (slug, quarter) =>
  apiFetch(`/api/investors/${slug}/changes/${quarterQuery(quarter)}`)

export const getInvestorCopy = (slug) => apiFetch(`/api/investors/${slug}/copy/`)

export const getInvestorHub = () => apiFetch('/api/investors/hub/')

export const getInvestorStocks = (view, quarter) => apiFetch(`/api/investors/stocks/${query({ view, quarter })}`)

export const getOwnershipSummary = (tickers) =>
  apiFetch(`/api/investors/ownership/${query({ tickers: tickers.join(',') })}`)

export const getOwnership = (ticker) => apiFetch(`/api/investors/ownership/${encodeURIComponent(ticker)}/`)

export const searchFilers = (q) => apiFetch(`/api/investors/search/${query({ q })}`)

export const setInvestorFollowed = (slug, followed) => jsonRequest(`/api/investors/${slug}/`, 'PATCH', { followed })

export const addInvestor = (cik) => jsonRequest('/api/investors/', 'POST', { cik })

export const stopTrackingInvestor = (slug) => apiFetch(`/api/investors/${slug}/`, { method: 'DELETE' })

export const getFilingAlerts = () => apiFetch('/api/investors/alerts/')

export const markFilingAlertsRead = () => jsonRequest('/api/investors/alerts/read/', 'POST', {})
