import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ResetPassword from './ResetPassword'
import { ApiError, confirmPasswordReset } from '../api/client'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmPasswordReset: vi.fn(),
}))

function renderReset(url = '/reset-password?uid=u1&token=t1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function submit() {
  await userEvent.type(screen.getByLabelText('New password'), 'S3cure-passw0rd')
  await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))
}

beforeEach(() => {
  confirmPasswordReset.mockReset()
})

describe('ResetPassword', () => {
  it('submits the link parameters with the new password and goes home', async () => {
    confirmPasswordReset.mockResolvedValue({})
    renderReset()
    await submit()
    expect(confirmPasswordReset).toHaveBeenCalledWith({
      uid: 'u1',
      token: 't1',
      newPassword: 'S3cure-passw0rd',
    })
    expect(await screen.findByText('home')).toBeInTheDocument()
  })

  it('says the link is invalid and offers a new one', async () => {
    confirmPasswordReset.mockRejectedValue(
      new ApiError(400, 'This reset link is invalid or has expired.', {
        detail: 'This reset link is invalid or has expired.',
      }),
    )
    renderReset()
    await submit()
    expect(await screen.findByText('This reset link is invalid or has expired.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('keeps the form for a weak password', async () => {
    confirmPasswordReset.mockRejectedValue(
      new ApiError(400, null, { new_password: ['This password is too common.'] }),
    )
    renderReset()
    await submit()
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('link', { name: 'Request a new link' })).not.toBeInTheDocument()
  })

  it('treats a link without parameters as invalid', () => {
    renderReset('/reset-password')
    expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument()
  })

  it('stays calm when throttled', async () => {
    confirmPasswordReset.mockRejectedValue(new ApiError(429, null, null))
    renderReset()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts, try again later.')
  })
})
