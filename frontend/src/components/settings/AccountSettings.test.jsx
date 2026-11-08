import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

import AccountSettings from './AccountSettings'
import { useMe } from '../../api/queries'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ApiError } from '../../api/client'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
  signOutEverywhere: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
}))
import * as client from '../../api/client'

function CurrentName() {
  const { data } = useMe()
  return <output data-testid="current-name">{data?.username}</output>
}

function renderAccount() {
  return renderWithProviders(
    <>
      <CurrentName />
      <Routes>
        <Route path="/" element={<AccountSettings />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  client.getMe.mockResolvedValue({ username: 'alice', email: 'alice@example.com', is_owner: false })
})

describe('AccountSettings', () => {
  it('shows the current username and email', async () => {
    renderAccount()
    expect(await screen.findByLabelText('Username')).toHaveValue('alice')
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
  })

  it('changes the username and the rest of the app sees it without a reload', async () => {
    client.updateMe.mockResolvedValue({ username: 'bob', email: 'alice@example.com', is_owner: false })
    renderAccount()
    const username = await screen.findByLabelText('Username')
    await userEvent.clear(username)
    await userEvent.type(username, 'bob')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(screen.getByTestId('current-name')).toHaveTextContent('bob'))
    expect(client.updateMe).toHaveBeenCalledWith({ username: 'bob' })
    expect(await screen.findByText('Profile saved')).toBeInTheDocument()
  })

  it('asks for the current password only when the email changes', async () => {
    client.updateMe.mockResolvedValue({ username: 'alice', email: 'new@example.com', is_owner: false })
    renderAccount()
    const email = await screen.findByLabelText('Email')
    expect(screen.queryByLabelText('Current password to change email')).not.toBeInTheDocument()

    await userEvent.clear(email)
    await userEvent.type(email, 'new@example.com')
    await userEvent.type(screen.getByLabelText('Current password to change email'), 'hunter2')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() =>
      expect(client.updateMe).toHaveBeenCalledWith({ email: 'new@example.com', current_password: 'hunter2' }),
    )
  })

  it('shows the server field error beside the field', async () => {
    client.updateMe.mockRejectedValue(new ApiError(400, null, { current_password: ['Wrong password.'] }))
    renderAccount()
    const email = await screen.findByLabelText('Email')
    await userEvent.clear(email)
    await userEvent.type(email, 'new@example.com')
    await userEvent.type(screen.getByLabelText('Current password to change email'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('Wrong password.')).toBeInTheDocument()
  })

  it('changes the password, says so, and keeps this browser signed in', async () => {
    client.changePassword.mockResolvedValue({ access: 'new', refresh: 'new-r' })
    renderAccount()
    await screen.findByLabelText('Username')
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password')
    await userEvent.type(screen.getByLabelText('New password'), 'a-better-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-better-password')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText(/Password changed/)).toBeInTheDocument()
    expect(client.changePassword).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'a-better-password' })
    expect(client.logout).not.toHaveBeenCalled()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('refuses mismatched new passwords without a request and clears the message on edit', async () => {
    renderAccount()
    await screen.findByLabelText('Username')
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password')
    await userEvent.type(screen.getByLabelText('New password'), 'a-better-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-better-passwore')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    const message = await screen.findByText("Passwords don't match.")
    const confirm = screen.getByLabelText('Confirm new password')
    expect(confirm).toHaveAttribute('aria-invalid', 'true')
    expect(confirm.getAttribute('aria-describedby')).toBe(message.id)
    expect(client.changePassword).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('New password'), 'x')
    expect(screen.queryByText("Passwords don't match.")).not.toBeInTheDocument()
  })

  it('shows password field errors', async () => {
    client.changePassword.mockRejectedValue(new ApiError(400, null, { new_password: ['Too short.'] }))
    renderAccount()
    await screen.findByLabelText('Username')
    await userEvent.type(screen.getByLabelText('Current password'), 'old')
    await userEvent.type(screen.getByLabelText('New password'), 'x')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Too short.')).toBeInTheDocument()
  })

  it('signs out everywhere, clears the local session and goes to login', async () => {
    client.signOutEverywhere.mockResolvedValue(null)
    renderAccount()
    await screen.findByLabelText('Username')
    await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(client.signOutEverywhere).toHaveBeenCalledTimes(1)
    expect(client.logout).toHaveBeenCalledTimes(1)
  })
})
