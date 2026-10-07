import { apiFetch } from './http'

const quarterQuery = (quarter) => (quarter ? `?quarter=${encodeURIComponent(quarter)}` : '')

export const getInvestors = (holds = '') =>
  apiFetch(`/api/investors/${holds ? `?holds=${encodeURIComponent(holds)}` : ''}`)

export const getInvestor = (slug, quarter) => apiFetch(`/api/investors/${slug}/${quarterQuery(quarter)}`)

export const getInvestorChanges = (slug, quarter) =>
  apiFetch(`/api/investors/${slug}/changes/${quarterQuery(quarter)}`)
