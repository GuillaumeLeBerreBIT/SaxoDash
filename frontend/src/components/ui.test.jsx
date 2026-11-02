import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen } from '@testing-library/react'

import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InstrumentLogo,
  LetterAvatar,
  MetricTile,
  InfoTip,
  Modal,
  StatStrip,
  StatRow,
  Skeleton,
  Metric,
  DayChange,
  PageHeader,
  Th,
  SortableTh,
  Td,
  TabList,
  TabButton,
  TBtn,
  Chip,
  QueryState,
  Segmented,
  Tag,
  Tile,
  StatusDot,
  Move,
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
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(img).toHaveAttribute('loading', 'lazy')
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

  it('Modal calls onClose when the backdrop is clicked, not when the panel is', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Label an account" onClose={onClose}>
        <p>Form goes here</p>
      </Modal>,
    )
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByText('Form goes here'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(document.body)
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

  it('InfoTip shows its content when the trigger is clicked', async () => {
    render(<InfoTip label="What is Sharpe">Return per unit of risk</InfoTip>)
    await userEvent.click(screen.getByRole('button', { name: 'What is Sharpe' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Return per unit of risk')
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
    expect(negative.className).toContain('text-flat')
    expect(negative.className).not.toContain('text-down')
    expect(zero.className).toContain('text-flat')
    expect(zero.className).not.toContain('text-up')
  })

  it('keeps colour and an arrow for real moves', () => {
    render(<DayChange value={1.2} />)
    expect(screen.getByText('▲ 1.20%').className).toContain('text-up')
  })
})

describe('Card', () => {
  it('Card renders context row, title and menu button', () => {
    render(
      <Card context="Saxo · 30 Oct" dot="ok" title="Positions" menu>
        rows
      </Card>,
    )
    expect(screen.getByText('Saxo · 30 Oct')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Positions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Positions options' })).toBeInTheDocument()
    expect(screen.getByText('rows')).toBeInTheDocument()
  })

  it('opens its options menu from the menu items', async () => {
    const onSelect = vi.fn()
    render(
      <Card title="Positions" menu={[{ label: 'Export CSV', onSelect }]}>
        rows
      </Card>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Positions options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export CSV' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('renders a bare panel without context or title', () => {
    const { container } = render(<Card>body</Card>)
    expect(container.firstChild).toHaveClass('bg-pane', 'rounded-xl', 'sd-panel')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('drops side padding when flush', () => {
    const { container } = render(<Card flush title="Holdings">table</Card>)
    expect(container.firstChild).not.toHaveClass('px-[18px]')
  })

  it('keeps old interactive callers clickable', () => {
    const onClick = vi.fn()
    render(<Card interactive onClick={onClick}>open</Card>)
    fireEvent.click(screen.getByText('open'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Segmented', () => {
  const options = [
    { value: '3M', label: '3M' },
    { value: '6M', label: '6M' },
  ]

  it('Segmented reports the picked value and marks it pressed', () => {
    const onChange = vi.fn()
    render(<Segmented label="Range" options={options} value="6M" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'Range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '3M' }))
    expect(onChange).toHaveBeenCalledWith('3M')
  })
})

describe('Move', () => {
  it('Move shows arrow and sign', () => {
    const { container } = render(<Move value={-1.4} />)
    expect(container).toHaveTextContent('▼ 1.40%')
    expect(container.firstChild.className).toContain('text-down')
  })

  it('shows an up arrow for a gain and honours digits', () => {
    const { container } = render(<Move value={2.345} digits={1} />)
    expect(container).toHaveTextContent('▲ 2.3%')
    expect(container.firstChild.className).toContain('text-up')
  })

  it('Move renders absent as a dash', () => {
    const { container } = render(<Move value={null} />)
    expect(container).toHaveTextContent('—')
    expect(container.firstChild.className).toContain('text-ink-3')
  })
})

describe('Tag, Tile and StatusDot', () => {
  it('Tag example', () => {
    render(<Tag tone="example">Example</Tag>)
    expect(screen.getByText('Example')).toHaveClass('text-warn-text')
    expect(screen.getByText('Example').className).not.toMatch(/data-theme/)
  })

  it('Tile shows label, value and sub-line', () => {
    render(<Tile label="Win rate" value="62%" sub="last 12 months" />)
    expect(screen.getByText('Win rate')).toBeInTheDocument()
    expect(screen.getByText('62%')).toHaveClass('num')
    expect(screen.getByText('last 12 months')).toHaveClass('num')
  })

  it('Tile as a list item keeps every child of its dl a dt or a dd', () => {
    const { container } = render(
      <ul>
        <Tile listItem label="Win rate" value="62%" sub="last 12 months" right={<span>i</span>} />
      </ul>,
    )
    const list = container.querySelector('dl')
    expect([...list.children].map((child) => child.tagName)).toEqual(['DT', 'DD', 'DD'])
    expect(list.querySelector('dt')).toHaveTextContent('Win rate')
    expect(screen.getByText('62%').tagName).toBe('DD')
  })

  it('StatusDot is decorative and toned', () => {
    const { container } = render(<StatusDot tone="warn" />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild.className).toContain('bg-warn')
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

  it('hides a cell below 1440px when asked for wide', () => {
    render(
      <table><thead><tr><Th hideBelow="wide">Fund shares</Th></tr></thead><tbody><tr><Td hideBelow="wide">9.3M</Td></tr></tbody></table>,
    )
    expect(screen.getByText('Fund shares')).toHaveClass('hidden', 'min-[1440px]:table-cell')
    expect(screen.getByText('9.3M')).toHaveClass('hidden', 'min-[1440px]:table-cell')
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

describe('TBtn', () => {
  it('keeps a 44px touch target in both directions below md only', () => {
    render(<TBtn active={false} onClick={() => {}}>1M</TBtn>)
    const classes = screen.getByRole('button', { name: '1M' }).className
    expect(classes).toContain('after:h-11')
    expect(classes).toContain('after:w-[max(100%,2.75rem)]')
    expect(classes).toContain('after:-translate-x-1/2')
    expect(classes).toContain('md:after:hidden')
  })
})

describe('QueryState', () => {
  it('shows a loading skeleton instead of children', () => {
    render(<QueryState isLoading label="holdings"><p>body</p></QueryState>)
    expect(screen.queryByText('body')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Loading holdings')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading holdings…')
  })

  it('shows an alert with Retry on error', () => {
    const onRetry = vi.fn()
    render(<QueryState error={new Error('boom')} onRetry={onRetry} label="holdings"><p>body</p></QueryState>)
    expect(screen.getByRole('alert')).toHaveTextContent(/holdings/i)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith()
    expect(screen.queryByText('body')).not.toBeInTheDocument()
  })

  it('renders children otherwise', () => {
    render(<QueryState label="holdings"><p>body</p></QueryState>)
    expect(screen.getByText('body')).toBeInTheDocument()
  })
})

describe('LetterAvatar', () => {
  it('shows the symbol initial in capitals, hidden from assistive tech', () => {
    const { container } = render(<LetterAvatar symbol="brk.b" size={24} />)
    expect(container).toHaveTextContent('B')
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an empty tile for a missing symbol', () => {
    const { container } = render(<LetterAvatar symbol="" size={24} />)
    expect(container.firstChild).toBeEmptyDOMElement()
  })

  it('shows as many characters as asked for', () => {
    const { container } = render(<LetterAvatar symbol="nvda" size={32} chars={2} />)
    expect(container).toHaveTextContent('NV')
  })
})

describe('InstrumentLogo fallback', () => {
  it('shows the letter avatar once the image fails', () => {
    const { container } = render(
      <InstrumentLogo symbol="AAPL" size={40} fallback={<LetterAvatar symbol="AAPL" size={40} />} />,
    )
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('A')
  })
})

describe('SortableTh', () => {
  const renderTh = (props) =>
    render(
      <table>
        <thead>
          <tr>
            <SortableTh sortKey="value" onSort={() => {}} {...props}>Value</SortableTh>
          </tr>
        </thead>
      </table>,
    )

  it('keeps a 44px wide touch target below md only', () => {
    renderTh({ sort: null })
    const button = screen.getByRole('button', { name: /Value/ })
    expect(button.className).toContain('min-w-11')
    expect(button.className).toContain('md:min-w-0')
  })

  it('reports none when another column or nothing is sorted', () => {
    renderTh({ sort: null })
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')
    renderTh({ sort: { key: 'other', direction: 'asc' } })
    expect(screen.getAllByRole('columnheader')[1]).toHaveAttribute('aria-sort', 'none')
  })

  it('reports ascending and descending with matching glyphs', () => {
    const { container, rerender } = renderTh({ sort: { key: 'value', direction: 'asc' } })
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
    expect(container.querySelector('.lucide-arrow-up')).not.toBeNull()
    rerender(
      <table>
        <thead>
          <tr>
            <SortableTh sortKey="value" sort={{ key: 'value', direction: 'desc' }} onSort={() => {}}>Value</SortableTh>
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
    expect(container.querySelector('.lucide-arrow-down')).not.toBeNull()
  })

  it('shows the neutral glyph when unsorted', () => {
    const { container } = renderTh({ sort: null })
    expect(container.querySelector('.lucide-chevrons-up-down')).not.toBeNull()
  })

  it('calls onSort with the key on click', () => {
    const onSort = vi.fn()
    renderTh({ sort: null, onSort })
    fireEvent.click(screen.getByRole('button', { name: /value/i }))
    expect(onSort).toHaveBeenCalledWith('value')
  })

  it('is a real button so Enter and Space activate it natively', () => {
    renderTh({ sort: null })
    const button = screen.getByRole('button', { name: /value/i })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('keeps Th alignment and hideBelow', () => {
    renderTh({ sort: null, align: 'right', hideBelow: 'md' })
    expect(screen.getByRole('columnheader', { hidden: true })).toHaveClass('text-right', 'hidden', 'md:table-cell')
  })
})
