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

describe('useResearchInstrument lookup', () => {
  const render = (route) => renderHook(() => useResearchInstrument(), { wrapper: wrapperFor(route) }).result.current
  const nvda = { symbol: 'NVDA', description: 'NVIDIA', exchange: 'NASDAQ', uic: 7, asset_type: 'Stock', currency: 'USD' }

  it('is resolving while the instrument search has not settled', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: true })
    expect(render('/research?symbol=ZZZZ')).toMatchObject({ resolving: true, instrument: null })
  })

  it('is no longer resolving once the search settled without a match', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: false })
    expect(render('/research?symbol=ZZZZ')).toMatchObject({ resolving: false, instrument: null })
  })

  it('ignores results left over from the previous symbol while the new search is pending', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [nvda], isResolving: true })
    expect(render('/research?symbol=BBBB')).toMatchObject({ resolving: true, instrument: null })
  })

  it('carries the listing currency of a search match', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [nvda], isResolving: false })
    expect(render('/research?symbol=NVDA').instrument).toMatchObject({ uic: 7, currency: 'USD' })
  })

  it('takes a pinned instrument at once, even while a search is still running', () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: true })
    expect(render('/research?symbol=NVDA&uic=7&assetType=Stock')).toMatchObject({ resolving: false, instrument: { uic: 7 } })
  })

  it('takes a held position without any search', () => {
    queries.usePositions.mockReturnValue({ data: [{ ticker: 'NVDA', uic: 211, asset_type: 'Stock' }] })
    expect(render('/research?symbol=NVDA')).toMatchObject({ resolving: false, instrument: { uic: 211 } })
  })

  it('is resolving while the positions that could answer are still loading', () => {
    queries.usePositions.mockReturnValue({ data: undefined, isLoading: true })
    queries.useInstrumentSearch.mockReturnValue({ data: [], isResolving: false })
    expect(render('/research?symbol=ASML')).toMatchObject({ resolving: true, instrument: null })
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
