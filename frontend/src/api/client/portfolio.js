import { apiFetch } from './http'

export const getPositions = () => apiFetch('/api/portfolio/positions/')
export const getPortfolioSummary = () => apiFetch('/api/portfolio/summary/')
export const getPortfolioInsights = () => apiFetch('/api/portfolio/insights/')
