import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'
import { login } from '../api/client'

vi.mock('../api/client', () => ({ login: vi.fn() }))

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

beforeEach(() => {
  login.mockReset()
})

describe('Login', () => {
  it('labels both fields', () => {
    renderLogin()

    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('announces a failed login and flags the inputs invalid', async () => {
    login.mockRejectedValue(new Error('nope'))
    renderLogin()

    await userEvent.type(screen.getByLabelText('Username'), 'a')
    await userEvent.type(screen.getByLabelText('Password'), 'b')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid username or password')
    await waitFor(() => {
      expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('does not flag inputs before a failure', () => {
    renderLogin()

    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('styles both labels identically', () => {
    renderLogin()

    const user = screen.getByText('Username', { selector: 'label' })
    const pass = screen.getByText('Password', { selector: 'label' })
    expect(user.className).toBe(pass.className)
    expect(pass).toHaveClass('text-zinc-400')
  })

  it('links the inputs to the error only while it is shown', async () => {
    login.mockRejectedValue(new Error('nope'))
    renderLogin()
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-describedby')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    await waitFor(() => {
      expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', alert.id)
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', alert.id)
    })
  })
})
