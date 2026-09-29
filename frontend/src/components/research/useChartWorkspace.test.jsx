import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

import { useChartWorkspace } from './useChartWorkspace'

const KEY = 'saxodash:chart-workspace'
const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const tsla = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }

let navigations

function useHarness() {
  const [params, setParams] = useSearchParams()
  const symbol = params.get('symbol') ?? 'NVDA'
  const uic = Number(params.get('uic')) || null
  const instrument = uic ? { uic, assetType: params.get('assetType') } : null
  const selectSymbol = (next, picked) => {
    navigations.push(next)
    setParams({ symbol: next, uic: String(picked.uic), assetType: picked.assetType }, { replace: true })
  }
  return { workspace: useChartWorkspace({ symbol, instrument, selectSymbol }), selectSymbol, params }
}

const renderWorkspace = (route = '/research/chart?symbol=NVDA&uic=211&assetType=Stock') =>
  renderHook(useHarness, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
  })

const store = (workspace) => localStorage.setItem(KEY, JSON.stringify(workspace))
const stored = () => JSON.parse(localStorage.getItem(KEY))

describe('useChartWorkspace', () => {
  beforeEach(() => {
    localStorage.clear()
    navigations = []
  })

  it('starts as one pane showing the URL symbol', () => {
    const { result } = renderWorkspace()
    expect(result.current.workspace.layout).toBe('1')
    expect(result.current.workspace.slots).toEqual([nvda])
  })

  it('loads a new pick into the active pane', () => {
    const { result } = renderWorkspace()
    act(() => result.current.selectSymbol('TSLA', tsla))
    expect(result.current.workspace.slots).toEqual([tsla])
  })

  it('grows into empty panes and activates the first one without navigating', () => {
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('4'))
    expect(result.current.workspace.slots).toEqual([nvda, null, null, null])
    expect(result.current.workspace.active).toBe(1)
    expect(navigations).toEqual([])
  })

  it('fills the empty active pane even when the pick is already in the URL', () => {
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('2h'))
    act(() => result.current.selectSymbol('NVDA', nvda))
    expect(result.current.workspace.slots).toEqual([nvda, nvda])
  })

  it('activating a filled pane puts its symbol in the URL', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 0 })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.activate(1))
    expect(result.current.workspace.active).toBe(1)
    expect(result.current.params.get('symbol')).toBe('AMD')
    expect(result.current.workspace.slots).toEqual([nvda, amd])
  })

  it('activating an empty pane leaves the URL alone', () => {
    store({ layout: '2h', slots: [nvda, null], active: 0 })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.activate(1))
    expect(result.current.workspace.active).toBe(1)
    expect(navigations).toEqual([])
    expect(result.current.workspace.slots).toEqual([nvda, null])
  })

  it('shrinking past the active pane activates the last pane kept and follows its symbol', () => {
    store({ layout: '4', slots: [nvda, amd, tsla, nvda], active: 3 })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('2h'))
    expect(result.current.workspace.active).toBe(1)
    expect(result.current.params.get('symbol')).toBe('AMD')
  })

  it('restores the stored active symbol when the URL names none', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 1 })
    const { result } = renderWorkspace('/research/chart')
    expect(result.current.params.get('symbol')).toBe('AMD')
    expect(result.current.workspace.slots).toEqual([nvda, amd])
  })

  it('lets a deep link win over the stored active symbol', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 1 })
    const { result } = renderWorkspace('/research/chart?symbol=TSLA&uic=9&assetType=Stock')
    expect(result.current.workspace.slots).toEqual([nvda, tsla])
    expect(navigations).toEqual([])
  })

  it('persists the workspace', () => {
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('2v'))
    expect(stored()).toEqual({ layout: '2v', slots: [nvda, null], active: 1 })
  })
})
