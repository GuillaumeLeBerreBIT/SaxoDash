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
