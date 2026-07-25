import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  login,
  logout,
  isAuthenticated,
  getUsername,
  getPositions,
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

  it('logout clears stored tokens and username', () => {
    localStorage.setItem('access', 'a')
    localStorage.setItem('refresh', 'r')
    localStorage.setItem('username', 'alice')

    logout()

    expect(localStorage.getItem('access')).toBeNull()
    expect(localStorage.getItem('refresh')).toBeNull()
    expect(localStorage.getItem('username')).toBeNull()
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
