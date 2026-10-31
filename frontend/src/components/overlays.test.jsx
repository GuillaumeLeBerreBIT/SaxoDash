import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Dialog, Menu, Popover, Tooltip } from './overlays'

describe('Dialog', () => {
  it('traps focus and closes on Escape', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <button type="button">outside</button>
        <Dialog open onOpenChange={onOpenChange} title="Label an account">
          <input aria-label="Name" />
        </Dialog>
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Label an account' })
    expect(dialog).toContainElement(document.activeElement)
    await user.tab()
    await user.tab()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement)
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing while closed', () => {
    render(<Dialog open={false} onOpenChange={() => {}} title="Hidden">x</Dialog>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes from its close button', async () => {
    const onOpenChange = vi.fn()
    render(<Dialog open onOpenChange={onOpenChange} title="Label">x</Dialog>)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Menu', () => {
  it('opens on click and runs onSelect', async () => {
    const onSelect = vi.fn()
    render(
      <Menu
        trigger={<button type="button">Actions</button>}
        items={[{ label: 'Rename', onSelect }, { label: 'Delete', onSelect: vi.fn(), danger: true }]}
      />,
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Popover', () => {
  it('shows its content from the trigger and closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Popover trigger={<button type="button">Filters</button>} label="Filters">
        <p>Panel body</p>
      </Popover>,
    )
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveTextContent('Panel body')
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Panel body')).not.toBeInTheDocument()
  })
})

describe('Tooltip', () => {
  it('describes its trigger on keyboard focus', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Explains the figure">
        <button type="button">What</button>
      </Tooltip>,
    )
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Explains the figure')
  })
})
