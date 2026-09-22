import { apiFetch } from './http'

export const getNetWorthHistory = (range = 'ALL') => apiFetch(`/api/core/net-worth-history/?range=${range}`)
