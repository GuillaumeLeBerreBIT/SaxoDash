import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import { COMPARE_OFF } from '../../lib/chartWorkspace'
import CompareControls from './CompareControls'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const amd = { symbol: 'AMD', description: 'Advanced Micro Devices', uic: 7, asset_type: 'Stock' }
const suggestions = [{ key: 'sp500', label: 'S&P 500', title: 'S&P 500, through SPY', instrument: { uic: 36590, assetType: 'Etf' } }]

const renderControls = (props = {}) => {
  const onChange = vi.fn()
  renderWithProviders(
    <CompareControls
      symbol="NVDA"
      compare={{ ...COMPARE_OFF, on: true }}
      suggestions={suggestions}
      addedLeft={3}
      takenKeys={new Set()}
      onChange={onChange}
      {...props}
    />,
  )
  return onChange
}

describe('CompareControls', () => {
  beforeEach(() => {
    queries.useInstrumentSearch.mockReturnValue({ data: [amd], isError: false, isResolving: false })
  })

  it('switches the stock between candles and line', async () => {
    const user = userEvent.setup()
    const onChange = renderControls()
    await user.click(screen.getByRole('button', { name: 'Line' }))
    expect(onChange).toHaveBeenCalledWith({ mainAs: 'line' })
  })

  it('turns a suggestion on', async () => {
    const user = userEvent.setup()
    const onChange = renderControls()
    await user.click(screen.getByRole('button', { name: 'S&P 500' }))
    expect(onChange).toHaveBeenCalledWith({ sp500: true })
  })

  it('adds a picked symbol after the ones already added', async () => {
    const user = userEvent.setup()
    const tsla = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }
    const onChange = renderControls({ compare: { ...COMPARE_OFF, on: true, added: [tsla] }, addedLeft: 2 })
    await user.click(screen.getByRole('button', { name: /Add symbol/ }))
    await user.click(await screen.findByRole('button', { name: /AMD/ }))
    expect(onChange).toHaveBeenCalledWith({ added: [tsla, { symbol: 'AMD', uic: 7, assetType: 'Stock' }] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cannot open the search with no slot left', () => {
    renderControls({ addedLeft: 0 })
    expect(screen.getByRole('button', { name: /Add symbol/ })).toBeDisabled()
  })
})
