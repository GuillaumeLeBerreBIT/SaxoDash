import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Signup from './Signup'
import { ApiError, signup } from '../api/client'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  signup: vi.fn(),
}))

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<p>home</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
  await userEvent.type(screen.getByLabelText('Username'), 'alice')
  await userEvent.type(screen.getByLabelText('Password'), 'S3cure-passw0rd')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeEach(() => {
  signup.mockReset()
})

describe('Signup', () => {
  it('explains why the email matters', () => {
    renderSignup()
    expect(
      screen.getByText("We only use this to send you a password reset link. A typo means you can't reset it."),
    ).toBeInTheDocument()
  })

  it('hides a honeypot from people and assistive tech', () => {
    const { container } = renderSignup()
    const trap = container.querySelector('input[name="website"]')
    expect(trap).toHaveAttribute('tabindex', '-1')
    expect(trap).toHaveAttribute('autocomplete', 'off')
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('submits the four fields and goes home', async () => {
    signup.mockResolvedValue({})
    renderSignup()
    await fillAndSubmit()
    expect(signup).toHaveBeenCalledWith({
      email: 'a@b.com',
      username: 'alice',
      password: 'S3cure-passw0rd',
      website: '',
    })
    expect(await screen.findByText('home')).toBeInTheDocument()
  })

  it('shows server field errors beside the field', async () => {
    signup.mockRejectedValue(new ApiError(400, null, { username: ['That username is taken.'] }))
    renderSignup()
    await fillAndSubmit()
    expect(await screen.findByText('That username is taken.')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })

  it('shows non-field errors as an alert', async () => {
    signup.mockRejectedValue(new ApiError(400, null, { non_field_errors: ['Sign-ups are closed.'] }))
    renderSignup()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-ups are closed.')
  })

  it('stays calm when throttled', async () => {
    signup.mockRejectedValue(new ApiError(429, null, null))
    renderSignup()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts, try again later.')
  })

  it('links back to sign in', () => {
    renderSignup()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })
})
