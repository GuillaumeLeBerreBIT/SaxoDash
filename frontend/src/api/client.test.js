import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  login,
  logout,
  isAuthenticated,
  getUsername,
  getPositions,
  getNetWorthHistory,
  getRiskMetrics,
  getCashFlow,
  getChart,
  getQuotes,
  removeWatchlistItem,
  createWatchlist,
  searchInstruments,
} from './client'

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('login', () => {
  it('stores tokens and username on success', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ access: 'access-1', refresh: 'refresh-1' })
    )

    await login('alice', 'hunter2')

    expect(localStorage.getItem('access')).toBe('access-1')
    expect(localStorage.getItem('refresh')).toBe('refresh-1')
    expect(getUsername()).toBe('alice')
  })

  it('throws and stores nothing on invalid credentials', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse(null, false, 401))

    await expect(login('alice', 'wrong')).rejects.toThrow('Invalid credentials')
    expect(localStorage.getItem('access')).toBeNull()
  })
})

describe('logout / isAuthenticated', () => {
  it('isAuthenticated reflects presence of an access token', () => {
    expect(isAuthenticated()).toBe(false)
    localStorage.setItem('access', 'token')
    expect(isAuthenticated()).toBe(true)
  })

  it('logout clears stored tokens and username', async () => {
    localStorage.setItem('access', 'a')
    localStorage.setItem('refresh', 'r')
    localStorage.setItem('username', 'alice')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({}, true, 205))

    await logout()

    expect(localStorage.getItem('access')).toBeNull()
    expect(localStorage.getItem('refresh')).toBeNull()
    expect(localStorage.getItem('username')).toBeNull()
  })

  it('logout asks the backend to revoke the refresh token', async () => {
    localStorage.setItem('access', 'a')
    localStorage.setItem('refresh', 'r')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({}, true, 205))

    await logout()

    const [url, options] = window.fetch.mock.calls[0]
    expect(url).toContain('/api/token/logout/')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ refresh: 'r' })
  })

  it('logout still clears the session when revocation fails', async () => {
    localStorage.setItem('access', 'a')
    localStorage.setItem('refresh', 'r')
    window.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(logout()).resolves.toBeUndefined()
    expect(localStorage.getItem('access')).toBeNull()
  })

  it('logout does not call the backend when there is no refresh token', async () => {
    localStorage.setItem('access', 'a')
    window.fetch = vi.fn()

    await logout()

    expect(window.fetch).not.toHaveBeenCalled()
  })
})

describe('apiFetch (via getPositions)', () => {
  it('returns parsed JSON on a successful request', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([{ ticker: 'AAPL' }]))

    const result = await getPositions()

    expect(result).toEqual([{ ticker: 'AAPL' }])
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/portfolio/positions/'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-access' }),
      })
    )
  })

  it('refreshes the access token once on 401 and retries the request', async () => {
    localStorage.setItem('access', 'expired-access')
    localStorage.setItem('refresh', 'valid-refresh')

    window.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/token/refresh/')) {
        return Promise.resolve(jsonResponse({ access: 'new-access', refresh: 'new-refresh' }))
      }
      if (url.includes('/api/portfolio/positions/')) {
        const usedNewToken = localStorage.getItem('access') === 'new-access'
        return Promise.resolve(usedNewToken ? jsonResponse([{ ticker: 'MSFT' }]) : jsonResponse(null, false, 401))
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const result = await getPositions()

    expect(result).toEqual([{ ticker: 'MSFT' }])
    expect(localStorage.getItem('access')).toBe('new-access')
  })

  it('deduplicates concurrent refresh calls into a single request', async () => {
    localStorage.setItem('access', 'expired-access')
    localStorage.setItem('refresh', 'valid-refresh')

    let refreshCalls = 0
    window.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/token/refresh/')) {
        refreshCalls += 1
        return Promise.resolve(jsonResponse({ access: 'new-access', refresh: 'new-refresh' }))
      }
      const usedNewToken = localStorage.getItem('access') === 'new-access'
      return Promise.resolve(usedNewToken ? jsonResponse([]) : jsonResponse(null, false, 401))
    })

    await Promise.all([getPositions(), getPositions(), getPositions(), getPositions()])

    expect(refreshCalls).toBe(1)
  })

  it('clears tokens and throws when the refresh token is invalid', async () => {
    localStorage.setItem('access', 'expired-access')
    localStorage.setItem('refresh', 'stale-refresh')
    delete window.location
    window.location = { href: '' }

    window.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/token/refresh/')) {
        return Promise.resolve(jsonResponse(null, false, 401))
      }
      return Promise.resolve(jsonResponse(null, false, 401))
    })

    await expect(getPositions()).rejects.toThrow('Session expired')
    expect(localStorage.getItem('access')).toBeNull()
    expect(localStorage.getItem('refresh')).toBeNull()
    expect(window.location.href).toBe('/login')
  })
})

describe('getRiskMetrics', () => {
  it('requests the risk metrics endpoint', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ has_data: false }))

    const result = await getRiskMetrics()

    expect(result).toEqual({ has_data: false })
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/analytics/risk/'),
      expect.anything()
    )
  })

  it('defaults to the world benchmark', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ has_data: false }))

    await getRiskMetrics()

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('?benchmark=world'),
      expect.anything()
    )
  })

  it('passes the requested benchmark through', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ has_data: false }))

    await getRiskMetrics('sp500')

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('?benchmark=sp500'),
      expect.anything()
    )
  })
})

describe('getNetWorthHistory / getCashFlow', () => {
  it('requests net worth history with the given range', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([{ date: '2026-07-01', net_worth: '1000.00' }]))

    const result = await getNetWorthHistory('6M')

    expect(result).toEqual([{ date: '2026-07-01', net_worth: '1000.00' }])
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/core/net-worth-history/?range=6M'),
      expect.anything()
    )
  })

  it('defaults range to ALL when not provided', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([]))

    await getNetWorthHistory()

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/core/net-worth-history/?range=ALL'),
      expect.anything()
    )
  })

  it('requests monthly cash flow', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([{ month: '2026-06', inflow: '500.00', outflow: '10.00' }]))

    const result = await getCashFlow()

    expect(result).toEqual([{ month: '2026-06', inflow: '500.00', outflow: '10.00' }])
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/transactions/cash-flow/'),
      expect.anything()
    )
  })
})

describe('research endpoints', () => {
  beforeEach(() => {
    localStorage.setItem('access', 'valid-access')
  })

  it('returns null instead of throwing on a 204 delete', async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body to parse')
      },
    })

    await expect(removeWatchlistItem(1, 7)).resolves.toBeNull()
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/research/watchlists/1/items/7/'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('carries the status on a failed request so 409 can be told apart', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ detail: 'Saxo is not connected.' }, false, 409))

    await expect(getChart({ uic: 211, assetType: 'Stock' })).rejects.toMatchObject({ status: 409 })
  })

  it('asks for a chart with the uic, asset type, horizon and count', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([]))

    await getChart({ uic: 211, assetType: 'Stock', horizon: 1440, count: 66 })

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/research/chart/?uic=211&asset_type=Stock&horizon=1440&count=66'),
      expect.anything()
    )
  })

  it('batches every uic into one quotes request', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([]))

    await getQuotes({ uics: [211, 212], assetType: 'Stock' })

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/research/quotes/?uics=211,212&asset_type=Stock'),
      expect.anything()
    )
  })

  it('url-encodes a search term', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([]))

    await searchInstruments('van eck')

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('q=van%20eck'),
      expect.anything()
    )
  })

  it('sends a json body when creating a watchlist', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: 'Tech' }, true, 201))

    await createWatchlist('Tech')

    const options = window.fetch.mock.calls[0][1]
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ name: 'Tech' })
  })
})
