import { apiFetch } from './http'

export const getRiskMetrics = (benchmark = 'world') => apiFetch(`/api/analytics/risk/?benchmark=${benchmark}`)
export const getPerformance = (benchmark = 'world') => apiFetch(`/api/analytics/performance/?benchmark=${benchmark}`)
