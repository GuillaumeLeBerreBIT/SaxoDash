import { apiFetch } from './http'

export const getTransactions = (query = '') => apiFetch(`/api/transactions/${query}`)
export const getCashFlow = () => apiFetch('/api/transactions/cash-flow/')
