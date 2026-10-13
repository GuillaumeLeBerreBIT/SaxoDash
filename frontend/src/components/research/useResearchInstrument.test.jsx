import { MemoryRouter } from 'react-router-dom'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as queries from '../../api/queries'
import { readRecentSymbols } from '../../lib/recentSymbols'
import { useResearchInstrument } from './useResearchInstrument'

vi.mock('../../api/queries')

const wrapperFor = (route) =>
  function Wrapper({ children }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  }

beforeEach(() => {
  localStorage.clear()
  queries.usePositions.mockReturnValue({ data: [] })
  queries.useInstrumentSearch.mockReturnValue({ data: [] })
})
afterEach(() => localStorage.clear())

describe('useResearchInstrument resolution', () => {
  const resolutionFor = (route) =>
    renderHook(() => useResearchInstrument(), { wrapper: wrapperFor(route) }).result.current.resolution

  it('is resolving while the instrument search has not settled', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: true })
    expect(resolutionFor('/research?symbol=ZZZZ')).toBe('resolving')
  })

  it('is unresolved once the search settled without a match', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: false })
    expect(resolutionFor('/research?symbol=ZZZZ')).toBe('unresolved')
  })

  it('is resolved as soon as an instrument is known, even while a search is still running', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: true })
    expect(resolutionFor('/research?symbol=NVDA&uic=7&assetType=Stock')).toBe('resolved')
  })

  it('is resolved for a held position without any search', () => {
    queries.usePositions.mockReturnValue({ data: [{ ticker: 'NVDA', uic: 211, asset_type: 'Stock' }] })
    expect(resolutionFor('/research?symbol=NVDA')).toBe('resolved')
  })
})

describe('useResearchInstrument recents', () => {
  it('does not remember a symbol that resolves to no instrument', () => {
    renderHook(() => useResearchInstrument(), { wrapper: wrapperFor('/research?symbol=ZZZZ') })
    expect(readRecentSymbols()).toEqual([])
  })

  it('remembers a symbol once it resolves', () => {
    queries.useInstrumentSearch.mockReturnValue({
      data: [{ symbol: 'NVDA', description: 'NVIDIA', exchange: 'NASDAQ', uic: 7, asset_type: 'Stock' }],
    })
    renderHook(() => useResearchInstrument(), { wrapper: wrapperFor('/research?symbol=NVDA') })
    expect(readRecentSymbols()).toEqual(['NVDA'])
  })
})
