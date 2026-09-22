import { apiFetch } from './http'

export const getBankAccounts = () => apiFetch('/api/accounts/')
export const getNetWorth = () => apiFetch('/api/accounts/net-worth/')
