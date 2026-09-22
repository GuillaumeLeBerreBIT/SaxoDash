import { apiFetch } from './http'

export const getTransactions = (query = '') => apiFetch(`/api/transactions/${query}`)
