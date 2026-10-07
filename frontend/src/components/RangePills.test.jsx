import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { RangePills } from './RangePills'

describe('RangePills', () => {
  it('wraps its pills instead of overflowing a narrow header', () => {
    render(<RangePills value="1Y" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '1Y' }).parentElement).toHaveClass('flex-wrap')
  })
})
