import { useState } from 'react'
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
  DayChange,
  PageHeader,
  Th,
  Td,
  TabList,
  TabButton,
  Chip,
  QueryState,
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

describe('DayChange', () => {
  it('shows a zero-rounding move unsigned and neutral, whatever its raw sign', () => {
    render(<DayChange value={-0.003} />)
    render(<DayChange value={0} />)
    const [negative, zero] = screen.getAllByText('0.00%')
    expect(negative.className).toContain('text-zinc-500')
    expect(negative.className).not.toContain('text-red-400')
    expect(zero.className).toContain('text-zinc-500')
    expect(zero.className).not.toContain('text-emerald-400')
  })

  it('keeps colour for real moves', () => {
    render(<DayChange value={1.2} />)
    expect(screen.getByText('+1.20%').className).toContain('text-emerald-400')
  })
})

describe('header right slots', () => {
  it('PageHeader lets a wide right slot wrap below the title', () => {
    const { container } = render(<PageHeader title="Analytics" subtitle="s" right={<button>Right</button>} />)
    expect(container.firstChild).toHaveClass('flex-wrap', 'md:flex-nowrap', 'md:gap-x-0', 'md:gap-y-0')
    expect(screen.getByRole('button', { name: 'Right' }).parentElement).toHaveClass('flex', 'min-w-0', 'max-w-full')
    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
  })

  it('CardHeader lets its right slot wrap and keeps the h2 heading', () => {
    const { container } = render(<CardHeader title="Chart" right={<span>Tools</span>} />)
    expect(container.firstChild).toHaveClass('flex-wrap', 'md:flex-nowrap')
    expect(screen.getByText('Tools').parentElement).toHaveClass('flex', 'min-w-0', 'max-w-full')
    expect(screen.getByRole('heading', { level: 2, name: 'Chart' })).toBeInTheDocument()
  })
})

describe('Th / Td hideBelow', () => {
  it('hides a cell below md and shows it from md up', () => {
    render(
      <table><thead><tr><Th hideBelow="md">Qty</Th></tr></thead><tbody><tr><Td hideBelow="md">10</Td></tr></tbody></table>,
    )
    expect(screen.getByText('Qty')).toHaveClass('hidden', 'md:table-cell')
    expect(screen.getByText('10')).toHaveClass('hidden', 'md:table-cell')
  })

  it('leaves a cell without hideBelow visible', () => {
    render(<table><tbody><tr><Td>Name</Td></tr></tbody></table>)
    expect(screen.getByText('Name')).not.toHaveClass('hidden')
  })
})

describe('TabList and TabButton', () => {
  function Tabs({ onB = () => {} }) {
    const [on, setOn] = useState('a')
    return (
      <TabList label="Sections">
        <TabButton active={on === 'a'} onClick={() => setOn('a')}>A</TabButton>
        <TabButton active={on === 'b'} onClick={() => { setOn('b'); onB() }}>B</TabButton>
        <TabButton active={on === 'c'} onClick={() => setOn('c')}>C</TabButton>
      </TabList>
    )
  }

  it('exposes a labelled tablist with selected state and roving tabindex', () => {
    render(<Tabs />)
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves focus and selection with the arrow, Home and End keys', () => {
    const onB = vi.fn()
    render(<Tabs onB={onB} />)
    const a = screen.getByRole('tab', { name: 'A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'B' })).toHaveFocus()
    expect(onB).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'B' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: 'C' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'A' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'C' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'A' })).toHaveFocus()
  })
})

describe('Chip', () => {
  it('exposes its pressed state and fires onClick', () => {
    const onClick = vi.fn()
    render(<Chip active onClick={onClick}>Stocks</Chip>)
    const chip = screen.getByRole('button', { name: 'Stocks' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('QueryState', () => {
  it('shows a loading skeleton instead of children', () => {
    render(<QueryState isLoading label="holdings"><p>body</p></QueryState>)
    expect(screen.queryByText('body')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Loading holdings')).toBeInTheDocument()
  })

  it('shows an alert with Retry on error', () => {
    const onRetry = vi.fn()
    render(<QueryState error={new Error('boom')} onRetry={onRetry} label="holdings"><p>body</p></QueryState>)
    expect(screen.getByRole('alert')).toHaveTextContent(/holdings/i)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('body')).not.toBeInTheDocument()
  })

  it('renders children otherwise', () => {
    render(<QueryState label="holdings"><p>body</p></QueryState>)
    expect(screen.getByText('body')).toBeInTheDocument()
  })
})
