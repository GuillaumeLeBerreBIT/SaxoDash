import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import LabeledAccountsSection from './LabeledAccountsSection'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const householdLabel = {
  id: 1, iban: null, counterparty_name: 'GUILLAUME LE BERRE', label: 'My other account', category: 'TRANSFER',
}

function stub({ labels = [], candidates = [] } = {}) {
  queries.useLabeledAccounts.mockReturnValue({ ...idle, data: labels })
  queries.useLabeledAccountCandidates.mockReturnValue({ ...idle, data: candidates })
}

describe('LabeledAccountsSection', () => {
  let createMutate
  let deleteMutate

  beforeEach(() => {
    createMutate = vi.fn((_payload, { onSuccess } = {}) => onSuccess?.())
    deleteMutate = vi.fn()
    queries.useCreateLabeledAccount.mockReturnValue({ mutate: createMutate, isPending: false })
    queries.useDeleteLabeledAccount.mockReturnValue({ mutate: deleteMutate })
  })

  it('shows an empty state when nothing is labeled yet', () => {
    stub()
    renderWithProviders(<LabeledAccountsSection />)
    expect(screen.getByText(/no labeled accounts yet/i)).toBeInTheDocument()
  })

  it('lists existing labels with what they match on', () => {
    stub({ labels: [householdLabel] })
    renderWithProviders(<LabeledAccountsSection />)
    expect(screen.getByText('My other account')).toBeInTheDocument()
    expect(screen.getByText(/GUILLAUME LE BERRE/)).toBeInTheDocument()
  })

  it('removes a label', async () => {
    stub({ labels: [householdLabel] })
    renderWithProviders(<LabeledAccountsSection />)
    await userEvent.click(screen.getByRole('button', { name: /remove my other account/i }))
    expect(deleteMutate).toHaveBeenCalledWith(1)
  })

  it('opens a modal to add a new label and submits iban/name/label/category', async () => {
    stub()
    renderWithProviders(<LabeledAccountsSection />)

    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/iban/i), 'BE99000000000000')
    await userEvent.type(within(dialog).getByLabelText(/^label$/i), 'Household')
    await userEvent.selectOptions(within(dialog).getByLabelText(/category/i), 'TRANSFER')
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ iban: 'BE99000000000000', label: 'Household', category: 'TRANSFER' }),
      expect.anything(),
    )
  })

  it('rejects a submission with neither iban nor counterparty name, client-side', async () => {
    stub()
    renderWithProviders(<LabeledAccountsSection />)

    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^label$/i), 'Nothing to match')
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    expect(screen.getByText(/provide an iban or a counterparty name/i)).toBeInTheDocument()
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('lists recurring unlabeled counterparties as suggestions', () => {
    stub({ candidates: [{ counterparty_name: 'HANNE MISSIAEN', counterparty_iban: 'BE01', count: 5, total: '750.00' }] })
    renderWithProviders(<LabeledAccountsSection />)
    expect(screen.getByText(/HANNE MISSIAEN/)).toBeInTheDocument()
    expect(screen.getByText(/5×/)).toBeInTheDocument()
  })

  it('opens the modal pre-filled from a suggestion', async () => {
    stub({ candidates: [{ counterparty_name: 'HANNE MISSIAEN', counterparty_iban: 'BE01', count: 5, total: '750.00' }] })
    renderWithProviders(<LabeledAccountsSection />)

    await userEvent.click(screen.getByRole('button', { name: /label this/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/iban/i)).toHaveValue('BE01')
    expect(within(dialog).getByLabelText(/counterparty name/i)).toHaveValue('HANNE MISSIAEN')
  })

  it('shows the server error when the API rejects the label', async () => {
    createMutate = vi.fn((_payload, { onError } = {}) => onError?.({ detail: 'Provide an IBAN or a counterparty name to match on.' }))
    queries.useCreateLabeledAccount.mockReturnValue({ mutate: createMutate, isPending: false })
    stub()
    renderWithProviders(<LabeledAccountsSection />)

    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/iban/i), 'BE99')
    await userEvent.type(within(dialog).getByLabelText(/^label$/i), 'X')
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(screen.getByText('Provide an IBAN or a counterparty name to match on.')).toBeInTheDocument(),
    )
  })
})
