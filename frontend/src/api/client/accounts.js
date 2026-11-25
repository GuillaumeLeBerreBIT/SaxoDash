import { apiFetch } from './http'

export const getNetWorth = () => apiFetch('/api/accounts/net-worth/')
