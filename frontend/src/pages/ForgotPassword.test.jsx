import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from './ForgotPassword'
import { ApiError, requestPasswordReset } from '../api/client'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  requestPasswordReset: vi.fn(),
}))

const SENTENCE = 'If an account exists for that address, a link is on its way.'

beforeEach(() => {
  requestPasswordReset.mockReset()
})

async function submit() {
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  )
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
}

describe('ForgotPassword', () => {
  it('shows the server sentence after submitting', async () => {
    requestPasswordReset.mockResolvedValue({ detail: SENTENCE })
    await submit()
    expect(requestPasswordReset).toHaveBeenCalledWith('a@b.com')
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
  })

  it('keeps the email and offers a retry when the server fails', async () => {
    requestPasswordReset.mockRejectedValue(new ApiError(500, null, null))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com')
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument()
  })

  it('keeps the email and offers a retry when the network is down', async () => {
    requestPasswordReset.mockRejectedValue(new TypeError('Failed to fetch'))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com')
  })

  it('keeps a status region mounted before any answer', () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('links back to sign in', () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
})
