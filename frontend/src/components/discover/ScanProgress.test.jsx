import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ScanProgress from './ScanProgress'

describe('ScanProgress', () => {
  it('fills to the share of stocks scanned', () => {
    render(<ScanProgress progress={{ done: 259, total: 518 }} />)
    const bar = screen.getByRole('progressbar', { name: 'Scanning stocks · 259 of 518' })
    expect(bar).toHaveAttribute('aria-valuenow', '259')
    expect(bar).toHaveAttribute('aria-valuemax', '518')
    expect(screen.getByTestId('scan-progress-fill')).toHaveStyle({ width: '50%' })
  })

  it('has no value while the scan is still starting', () => {
    render(<ScanProgress progress={{ done: 0, total: null }} />)
    const bar = screen.getByRole('progressbar', { name: 'Starting scan…' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
  })

  it('renders nothing when no scan is running', () => {
    const { container } = render(<ScanProgress progress={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
