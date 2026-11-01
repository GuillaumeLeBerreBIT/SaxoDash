import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import BoardGrid from './BoardGrid'

vi.mock('./panels', () => ({
  PANELS: {
    networth: ({ panel }) => <button type="button">Body of {panel.id}</button>,
    news: ({ panel }) => <button type="button">Body of {panel.id}</button>,
  },
}))

const board = {
  id: 'b',
  name: 'Test',
  sym: 'NVDA',
  panels: [
    { id: 'p1', type: 'networth', x: 0, y: 0, w: 4, h: 3 },
    { id: 'p2', type: 'news', x: 4, y: 0, w: 5, h: 5 },
  ],
}

const COL = 88
const GAP = 12

function renderGrid(props = {}) {
  const onChange = vi.fn()
  const view = render(<BoardGrid board={board} editing onChange={onChange} onFollow={vi.fn()} {...props} />)
  Object.defineProperty(screen.getByTestId('board-grid'), 'clientWidth', { configurable: true, value: COL * 12 + GAP * 11 })
  return { ...view, onChange }
}

const pointer = (x, y) => ({ clientX: x, clientY: y, pointerId: 1 })

describe('BoardGrid', () => {
  beforeEach(() => {
    window.innerWidth = 1440
  })

  it('names every grip, remove and resize handle after its panel', () => {
    renderGrid()

    expect(screen.getByRole('button', { name: 'Move Net worth' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Net worth' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resize News' })).toBeInTheDocument()
  })

  it('makes panel bodies inert while editing and live otherwise', () => {
    const { rerender } = renderGrid()
    expect(screen.getByText('Body of p1').closest('[inert]')).not.toBeNull()

    rerender(<BoardGrid board={board} onChange={vi.fn()} onFollow={vi.fn()} />)
    expect(screen.getByText('Body of p1').closest('[inert]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move Net worth' })).not.toBeInTheDocument()
  })

  it('moves a panel by whole columns and 64 px rows, showing the drop zone while dragging', () => {
    const { onChange } = renderGrid()
    const grip = screen.getByRole('button', { name: 'Move Net worth' })

    fireEvent.pointerDown(grip, pointer(0, 0))
    fireEvent.pointerMove(grip, pointer(2 * (COL + GAP), 64 + GAP))

    expect(screen.getByTestId('drop-zone').style.gridColumn).toBe('3 / span 4')
    expect(screen.getByTestId('drop-zone').style.gridRow).toBe('2 / span 3')

    fireEvent.pointerUp(grip, pointer(2 * (COL + GAP), 64 + GAP))

    const moved = onChange.mock.calls[0][0].panels.find((p) => p.id === 'p1')
    expect(moved).toMatchObject({ x: 2, w: 4 })
    expect(screen.queryByTestId('drop-zone')).not.toBeInTheDocument()
  })

  it('resizes from the corner handle', () => {
    const { onChange } = renderGrid()
    const corner = screen.getByRole('button', { name: 'Resize Net worth' })

    fireEvent.pointerDown(corner, pointer(0, 0))
    fireEvent.pointerMove(corner, pointer(COL + GAP, 2 * (64 + GAP)))
    fireEvent.pointerUp(corner, pointer(COL + GAP, 2 * (64 + GAP)))

    expect(onChange.mock.calls[0][0].panels.find((p) => p.id === 'p1')).toMatchObject({ w: 5, h: 5 })
  })

  it('cancels a drag on Escape and leaves the board as it was', () => {
    const { onChange } = renderGrid()
    const grip = screen.getByRole('button', { name: 'Move Net worth' })

    fireEvent.pointerDown(grip, pointer(0, 0))
    fireEvent.pointerMove(grip, pointer(3 * (COL + GAP), 0))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByTestId('drop-zone')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Net worth' }).style.transform).toBe('')

    fireEvent.pointerUp(grip, pointer(3 * (COL + GAP), 0))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not start a drag on a phone-width screen', () => {
    window.innerWidth = 500
    const { onChange } = renderGrid()
    const grip = screen.getByRole('button', { name: 'Move Net worth' })

    fireEvent.pointerDown(grip, pointer(0, 0))
    fireEvent.pointerMove(grip, pointer(400, 0))
    fireEvent.pointerUp(grip, pointer(400, 0))

    expect(screen.queryByTestId('drop-zone')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves and resizes from the keyboard with the arrow keys', () => {
    const { onChange } = renderGrid()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Move News' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize Net worth' }), { key: 'ArrowRight' })

    expect(onChange.mock.calls[0][0].panels.find((p) => p.id === 'p2').y).toBeGreaterThanOrEqual(0)
    expect(onChange.mock.calls[1][0].panels.find((p) => p.id === 'p1').w).toBe(5)
  })

  it('removes a panel', () => {
    const { onChange } = renderGrid()

    fireEvent.click(screen.getByRole('button', { name: 'Remove News' }))

    expect(onChange.mock.calls[0][0].panels.map((p) => p.id)).toEqual(['p1'])
  })

  it('lays panels out in reading order for the stacked phone layout', () => {
    renderGrid({
      board: { ...board, panels: [{ ...board.panels[1], x: 0, y: 3 }, board.panels[0]] },
    })

    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Net worth', 'News'])
  })
})
