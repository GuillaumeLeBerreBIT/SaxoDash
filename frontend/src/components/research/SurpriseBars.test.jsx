import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import SurpriseBars from './SurpriseBars'

describe('SurpriseBars', () => {
  it('renders nothing without data', () => {
    const { container } = render(<SurpriseBars data={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('reserves its plot height when it has data', () => {
    const { container } = render(
      <SurpriseBars data={[{ label: 'Q1', value: 4 }, { label: 'Q2', value: -3 }]} height={120} />,
    )
    expect(container.firstChild).toHaveStyle({ height: '120px' })
  })
})
