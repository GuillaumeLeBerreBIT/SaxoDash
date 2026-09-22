import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import {
  Alert,
  Button,
  CardHeader,
  EmptyState,
  InstrumentLogo,
  MetricTile,
  Modal,
  StatStrip,
  StatRow,
  Skeleton,
  Metric,
} from './ui'

describe('ui primitives', () => {
  it('StatStrip renders its StatRow children with label, value, badge and note', () => {
    render(
      <StatStrip>
        <StatRow label="Net worth" value="€1,000" badge="+2.1%" badgeTone="emerald" note="all-time" />
      </StatStrip>,
    )
    expect(screen.getByText('Net worth')).toBeInTheDocument()
    expect(screen.getByText('€1,000')).toBeInTheDocument()
    expect(screen.getByText('+2.1%')).toBeInTheDocument()
    expect(screen.getByText('all-time')).toBeInTheDocument()
  })

  it('Skeleton renders a block', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })

  it('Metric shows a label, a value and an optional hint', () => {
    render(<Metric label="P/E" value="32.10" hint="hint text" />)
    expect(screen.getByText('P/E')).toBeInTheDocument()
    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('hint text')).toBeInTheDocument()
  })

  it('InstrumentLogo renders the elbstream image for a ticker symbol', () => {
    const { container } = render(
      <InstrumentLogo symbol="AAPL" size={40} fallback={<span>AA</span>} />,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://api.elbstream.com/logos/symbol/AAPL')
    expect(screen.queryByText('AA')).not.toBeInTheDocument()
  })

  it('InstrumentLogo renders the fallback without a symbol', () => {
    render(<InstrumentLogo symbol={null} size={40} fallback={<span>AA</span>} />)
    expect(screen.getByText('AA')).toBeInTheDocument()
  })

  it('InstrumentLogo falls back once the image fails to load', () => {
    const { container } = render(
      <InstrumentLogo symbol="AAPL" size={40} fallback={<span>AA</span>} />,
    )
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('AA')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('InstrumentLogo recovers when the symbol changes after a prior failure, without remounting', () => {
    const { container, rerender } = render(
      <InstrumentLogo symbol="MRVL" size={40} fallback={<span>MR</span>} />,
    )
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('MR')).toBeInTheDocument()

    // Same component instance (e.g. Research's SymbolBar navigating between
    // symbols) now shows a ticker whose logo does exist.
    rerender(<InstrumentLogo symbol="COST" size={40} fallback={<span>CO</span>} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://api.elbstream.com/logos/symbol/COST')
    expect(screen.queryByText('CO')).not.toBeInTheDocument()
  })

  it('CardHeader renders its title as an h2 by default, for a real page->section heading level', () => {
    render(<CardHeader title="Holdings" subtitle="All positions" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Holdings' })).toBeInTheDocument()
  })

  it('CardHeader renders as h3 when explicitly nested under another CardHeader', () => {
    render(<CardHeader title="Nested" as="h3" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Nested' })).toBeInTheDocument()
  })

  it('Button fires onClick and respects the disabled state', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('Button defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Cancel</Button>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
  })

  it('MetricTile shows a label, a value and an optional hint', () => {
    render(<MetricTile label="Sharpe ratio" value="1.42" hint="Downside-adjusted" />)
    expect(screen.getByText('Sharpe ratio')).toBeInTheDocument()
    expect(screen.getByText('1.42')).toBeInTheDocument()
    expect(screen.getByText('Downside-adjusted')).toBeInTheDocument()
  })

  it('Alert renders its message', () => {
    render(<Alert tone="error">Failed to load accounts</Alert>)
    expect(screen.getByText('Failed to load accounts')).toBeInTheDocument()
  })

  it('EmptyState renders a title and optional hint', () => {
    render(<EmptyState title="No transactions yet" hint="Connect a bank to get started" />)
    expect(screen.getByText('No transactions yet')).toBeInTheDocument()
    expect(screen.getByText('Connect a bank to get started')).toBeInTheDocument()
  })

  it('Modal renders its title and children as a dialog', () => {
    render(
      <Modal title="Label an account" onClose={() => {}}>
        <p>Form goes here</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Label an account' })).toBeInTheDocument()
    expect(screen.getByText('Form goes here')).toBeInTheDocument()
  })

  it('Modal calls onClose when the backdrop is clicked, not when the panel is', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Label an account" onClose={onClose}>
        <p>Form goes here</p>
      </Modal>,
    )
    fireEvent.click(screen.getByText('Form goes here'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Modal calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Label an account" onClose={onClose}>
        <p>Form goes here</p>
      </Modal>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Modal renders a close button', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Label an account" onClose={onClose}>
        <p>Form goes here</p>
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
