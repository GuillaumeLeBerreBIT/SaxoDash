const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const getTokens = () => ({
  access: localStorage.getItem("access"),
  refresh: localStorage.getItem("refresh"),
});

const setTokens = ({ access, refresh }) => {
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
};

const clearTokens = () => {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("username");
};

export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  setTokens(await res.json());
  localStorage.setItem("username", username);
}

export function getUsername() {
  return localStorage.getItem("username");
}

export async function logout() {
  const { refresh } = getTokens();
  clearTokens();
  if (!refresh) return;

  // Best effort: the local session is already gone either way.
  try {
    await fetch(`${BASE_URL}/api/token/logout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
  } catch {
    /* network down - nothing useful to do here */
  }
}

export function isAuthenticated() {
  return Boolean(getTokens().access);
}

/** Carries the HTTP status so callers can tell failures apart.
 *
 *  The Research endpoints answer 409 when the app itself is not connected to
 *  Saxo, which is a prompt to reconnect rather than an error to report.
 */
export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed: ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail ?? null
  }
}

// The Research endpoints answer 409 when the app itself is not connected to
// Saxo. Named once here so no reader has to re-derive it - four of five used
// to get it wrong by not asking at all.
export const NOT_CONNECTED_STATUS = 409

export function isNotConnected(error) {
  return error?.status === NOT_CONNECTED_STATUS
}

let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refresh } = getTokens();
    if (!refresh) return false;
    const res = await fetch(`${BASE_URL}/api/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) return false;
    setTokens(await res.json());
    return true;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function apiFetch(path, options = {}) {
  const doFetch = (token) =>
    fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    let res = await doFetch(getTokens().access)

    if (res.status === 401) {
        if (await refreshAccessToken()) {
            res = await doFetch(getTokens().access)
        } else {
            clearTokens()
            window.location.href = '/login'
            throw new Error('Session expired')
        }
    }

    if (!res.ok) {
        // The backend explains itself in `detail`; carrying it means callers
        // show the server's reason rather than inventing their own.
        const body = await res.json().catch(() => null)
        throw new ApiError(res.status, body?.detail)
    }

    // DELETE answers 204 with an empty body; res.json() would throw on it.
    return res.status === 204 ? null : res.json()
}

const jsonRequest = (path, method, body) =>
  apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getPositions = () => apiFetch('/api/portfolio/positions/')
export const getPortfolioSummary = () => apiFetch('/api/portfolio/summary/')
export const getTransactions = (query = '') => apiFetch(`/api/transactions/${query}`)
export const getBankAccounts = () => apiFetch('/api/accounts/')
export const getNetWorth = () => apiFetch('/api/accounts/net-worth/')
export const getNetWorthHistory = (range = 'ALL') => apiFetch(`/api/core/net-worth-history/?range=${range}`)
export const getRiskMetrics = () => apiFetch('/api/analytics/risk/')
export const getCashFlow = () => apiFetch('/api/transactions/cash-flow/')
export const getSaxoStatus = () => apiFetch('/api/saxo/status/')
export const connectSaxo = () => { window.location.href = `${BASE_URL}/api/saxo/connect/` }

// Research: market data proxied through the backend, and watchlist CRUD.
export const getChart = ({ uic, assetType, horizon = 1440, count = 252 }) =>
  apiFetch(
    `/api/research/chart/?uic=${uic}&asset_type=${assetType}&horizon=${horizon}&count=${count}`,
  )

export const getQuotes = ({ uics, assetType }) =>
  apiFetch(`/api/research/quotes/?uics=${uics.join(',')}&asset_type=${assetType}`)

export const searchInstruments = (query, assetTypes = 'Stock,Etf') =>
  apiFetch(`/api/research/instruments/?q=${encodeURIComponent(query)}&asset_types=${assetTypes}`)

export const getInstrumentDetails = ({ uic, assetType }) =>
  apiFetch(`/api/research/instruments/${uic}/${assetType}/`)

export const getWatchlists = () => apiFetch('/api/research/watchlists/')
export const createWatchlist = (name) => jsonRequest('/api/research/watchlists/', 'POST', { name })
export const updateWatchlist = (id, patch) =>
  jsonRequest(`/api/research/watchlists/${id}/`, 'PATCH', patch)
export const deleteWatchlist = (id) =>
  apiFetch(`/api/research/watchlists/${id}/`, { method: 'DELETE' })

export const addWatchlistItem = (id, item) =>
  jsonRequest(`/api/research/watchlists/${id}/items/`, 'POST', item)
export const removeWatchlistItem = (id, itemId) =>
  apiFetch(`/api/research/watchlists/${id}/items/${itemId}/`, { method: 'DELETE' })
