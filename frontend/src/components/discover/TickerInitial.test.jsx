import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import TickerInitial from './TickerInitial'

describe('TickerInitial', () => {
  it('shows the ticker initial in capitals', () => {
    const { container } = render(<TickerInitial ticker="brk.b" size={24} />)
    expect(container).toHaveTextContent('B')
  })

  it('renders an empty tile for a missing ticker', () => {
    const { container } = render(<TickerInitial ticker="" size={24} />)
    expect(container.firstChild).toBeEmptyDOMElement()
  })
})
