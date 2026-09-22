import { apiFetch, ENABLE_BANKING_CONNECT_BASE_URL, jsonRequest } from './http'

export const getEnableBankingStatus = () => apiFetch('/api/enablebanking/status/')

export async function connectEnableBanking(bank, iban) {
  const { ticket } = await jsonRequest('/api/enablebanking/connect-ticket/', 'POST')
  const ibanParam = iban ? `&iban=${encodeURIComponent(iban)}` : ''
  window.location.href = `${ENABLE_BANKING_CONNECT_BASE_URL}/api/enablebanking/connect/${bank}/?ticket=${encodeURIComponent(ticket)}${ibanParam}`
}

export const getBankTransactions = (query = '') => apiFetch(`/api/enablebanking/transactions/${query}`)

export const updateBankTransactionCategory = (id, categoryOverride) =>
  jsonRequest(`/api/enablebanking/transactions/${id}/category/`, 'PATCH', { category_override: categoryOverride })

export const getSpendingSummary = (query = '') => apiFetch(`/api/enablebanking/spending/summary/${query}`)

export const getSpendingTrend = (months = 6) => apiFetch(`/api/enablebanking/spending/trend/?months=${months}`)

export const getSubscriptions = () => apiFetch('/api/enablebanking/subscriptions/')

export const updateSubscription = (id, patch) =>
  jsonRequest(`/api/enablebanking/subscriptions/${id}/`, 'PATCH', patch)

export const getBudgets = () => apiFetch('/api/enablebanking/budgets/')

export const setBudget = (category, monthlyLimit) =>
  jsonRequest('/api/enablebanking/budgets/', 'PUT', { category, monthly_limit: monthlyLimit })

export const getBudgetProgress = () => apiFetch('/api/enablebanking/budgets/progress/')

export const getLabeledAccounts = () => apiFetch('/api/enablebanking/labeled-accounts/')

export const getLabeledAccountCandidates = () => apiFetch('/api/enablebanking/labeled-accounts/candidates/')

export const createLabeledAccount = (label) =>
  jsonRequest('/api/enablebanking/labeled-accounts/', 'POST', label)

export const updateLabeledAccount = (id, patch) =>
  jsonRequest(`/api/enablebanking/labeled-accounts/${id}/`, 'PATCH', patch)

export const deleteLabeledAccount = (id) =>
  apiFetch(`/api/enablebanking/labeled-accounts/${id}/`, { method: 'DELETE' })
