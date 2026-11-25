export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const getTokens = () => ({
  access: localStorage.getItem("access"),
  refresh: localStorage.getItem("refresh"),
});

export const setTokens = ({ access, refresh }) => {
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
  if (res.status === TOO_MANY_REQUESTS_STATUS) throw new ApiError(res.status);
  if (!res.ok) throw new Error("Invalid credentials");
  setTokens(await res.json());
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

export const TOO_MANY_REQUESTS_STATUS = 429

/** Carries the HTTP status so callers can tell failures apart.
 *
 *  The Research endpoints answer 409 when the app itself is not connected to
 *  Saxo, which is a prompt to reconnect rather than an error to report.
 */
export class ApiError extends Error {
  constructor(status, detail, body = null) {
    super(detail || `Request failed: ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail ?? null
    this.body = body
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

const withRefreshLock = (task) =>
  navigator.locks ? navigator.locks.request("saxodash-token-refresh", task) : task();

async function refreshAccessToken(staleAccess) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = withRefreshLock(async () => {
    const { access, refresh } = getTokens();
    if (access && access !== staleAccess) return true;
    if (!refresh) return false;
    const res = await fetch(`${BASE_URL}/api/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) return false;
    setTokens(await res.json());
    return true;
  });

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch(path, options = {}) {
  const doFetch = (token) =>
    fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const sentAccess = getTokens().access
    let res = await doFetch(sentAccess)

    if (res.status === 401) {
        if (await refreshAccessToken(sentAccess)) {
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
        throw new ApiError(res.status, body?.detail, body)
    }

    // DELETE answers 204 with an empty body; res.json() would throw on it.
    return res.status === 204 || res.status === 205 ? null : res.json()
}

export const jsonRequest = (path, method, body) =>
  apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
