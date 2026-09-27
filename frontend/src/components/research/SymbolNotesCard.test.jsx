import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../api/client')
import * as client from '../../api/client'
import { useSymbolNote, useSymbolNoteMutation } from '../../api/queries'
import ThesisAndRisksCard, { BusinessSummaryCard } from './SymbolNotesCard'

function SavedThesis({ symbol }) {
  const note = useSymbolNote(symbol)
  const save = useSymbolNoteMutation(symbol)
  return (
    <>
      <ThesisAndRisksCard note={note.data} onSave={(patch) => save.mutate(patch)} />
      {save.isError ? <span>save failed</span> : null}
    </>
  )
}

describe('BusinessSummaryCard', () => {
  it('renders the saved summary', () => {
    render(<BusinessSummaryCard note={{ business_summary: 'Makes phones.' }} onSave={() => {}} />)
    expect(screen.getByDisplayValue('Makes phones.')).toBeInTheDocument()
  })

  it('saves on blur only when the value changed', () => {
    const onSave = vi.fn()
    render(<BusinessSummaryCard note={{ business_summary: 'Old' }} onSave={onSave} />)

    const field = screen.getByDisplayValue('Old')
    fireEvent.blur(field)
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: 'New' } })
    fireEvent.blur(field)
    expect(onSave).toHaveBeenCalledWith({ business_summary: 'New' })
  })
})

describe('ThesisAndRisksCard', () => {
  it('renders the bull, bear, target price and sell trigger fields', () => {
    render(
      <ThesisAndRisksCard
        note={{ bull_case: 'Growth', bear_case: 'Competition', target_price: '250.00', sell_trigger: 'Margin drop' }}
        onSave={() => {}}
        fundamentals={{ data: { available: false } }}
      />,
    )
    expect(screen.getByDisplayValue('Growth')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Competition')).toBeInTheDocument()
    expect(screen.getByDisplayValue('250.00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Margin drop')).toBeInTheDocument()
  })

  it('shows a leverage flag when the fundamentals verdict is cautionary', () => {
    render(
      <ThesisAndRisksCard
        note={null}
        onSave={() => {}}
        fundamentals={{ data: { available: true, debt_to_equity: 5, current_ratio: 0.4 } }}
      />,
    )
    expect(screen.getByText(/leveraged or tight on liquidity/i)).toBeInTheDocument()
  })

  it('omits the leverage flag without a cautionary verdict', () => {
    render(<ThesisAndRisksCard note={null} onSave={() => {}} fundamentals={{ data: { available: false } }} />)
    expect(screen.queryByText(/leveraged/i)).not.toBeInTheDocument()
  })

  it('shows when the thesis was last reviewed', () => {
    render(<ThesisAndRisksCard note={{ reviewed_at: null }} onSave={() => {}} onMarkReviewed={() => {}} />)
    expect(screen.getByText('Never reviewed')).toBeInTheDocument()
  })

  it('marks the thesis reviewed on request', () => {
    const onMarkReviewed = vi.fn()
    render(<ThesisAndRisksCard note={{ reviewed_at: null }} onSave={() => {}} onMarkReviewed={onMarkReviewed} />)

    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }))

    expect(onMarkReviewed).toHaveBeenCalledOnce()
  })

  it('shows the saved stop price', () => {
    render(
      <ThesisAndRisksCard
        note={{ stop_price: '180.50' }}
        onSave={() => {}}
        fundamentals={{ data: { available: false } }}
      />,
    )
    expect(screen.getByDisplayValue('180.50')).toBeInTheDocument()
  })

  it('saves a changed stop price and clears an emptied one', () => {
    const onSave = vi.fn()
    render(
      <ThesisAndRisksCard
        note={{ stop_price: '180.50' }}
        onSave={onSave}
        fundamentals={{ data: { available: false } }}
      />,
    )
    const field = screen.getByLabelText(/stop price/i)

    fireEvent.change(field, { target: { value: '175' } })
    fireEvent.blur(field)
    expect(onSave).toHaveBeenLastCalledWith({ stop_price: '175' })

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(onSave).toHaveBeenLastCalledWith({ stop_price: null })
  })
})

describe('ThesisAndRisksCard saving through the note mutation', () => {
  it('a failed text save keeps the draft', async () => {
    let failSave
    client.getSymbolNote.mockResolvedValue({ symbol: 'NVDA', bull_case: 'Old thesis' })
    client.updateSymbolNote.mockReturnValue(
      new Promise((_, reject) => {
        failSave = reject
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SavedThesis symbol="NVDA" />
      </QueryClientProvider>,
    )
    const field = await screen.findByDisplayValue('Old thesis')

    fireEvent.change(field, { target: { value: 'Paragraphs of new thesis' } })
    fireEvent.blur(field)
    await waitFor(() =>
      expect(client.updateSymbolNote).toHaveBeenCalledWith('NVDA', { bull_case: 'Paragraphs of new thesis' }),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      failSave(new Error('offline'))
    })

    await screen.findByText('save failed')
    expect(field).toHaveValue('Paragraphs of new thesis')
  })
})
