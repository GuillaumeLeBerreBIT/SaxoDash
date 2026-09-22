import { apiFetch, BASE_URL, jsonRequest } from './http'

export const getSaxoStatus = () => apiFetch('/api/saxo/status/')

// A full-page redirect can't carry the JWT, so fetch a short-lived signed
// ticket (authenticated) and hand that to the connect endpoint instead.
export async function connectSaxo() {
  const { ticket } = await jsonRequest('/api/saxo/connect-ticket/', 'POST')
  window.location.href = `${BASE_URL}/api/saxo/connect/?ticket=${encodeURIComponent(ticket)}`
}
