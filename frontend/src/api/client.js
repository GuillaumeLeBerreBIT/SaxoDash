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
};

export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  setTokens(await res.json());
}

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  const res = fetch(`${BASE_URL}/api/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) return false;
  setTokens(await res.json());
  return true;
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

    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    return res.json()
}

export const getPositions = () => apiFetch('/api/portfolio/positions/')
export const getPortfolioSummary = () => apiFetch('/api/portfolio/summary/')
export const getTransactions = (query = '') => apiFetch(`/api/transactions/${query}`)
export const getBankAccounts = () => apiFetch('/api/accounts/')
export const getNetWorth = () => apiFetch('/api/accounts/net-worth/')
