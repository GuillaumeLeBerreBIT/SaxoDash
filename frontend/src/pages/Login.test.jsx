import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from './Login'
import { ApiError, login } from '../api/client'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  login: vi.fn(),
}))

let queryClient

function renderLogin() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  login.mockReset()
  queryClient = new QueryClient()
})

describe('Login', () => {
  it('leaves no cached user from a previous session', async () => {
    queryClient.setQueryData(['me'], { username: 'previous', is_owner: true })
    login.mockResolvedValue()
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email or username'), 'b')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeUndefined())
  })

  it('keeps the previous cache when the login fails', async () => {
    queryClient.setQueryData(['me'], { username: 'previous', is_owner: true })
    login.mockRejectedValue(new Error('nope'))
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email or username'), 'b')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByRole('alert')
    expect(queryClient.getQueryData(['me'])).toEqual({ username: 'previous', is_owner: true })
  })

  it('labels both fields', () => {
    renderLogin()

    expect(screen.getByLabelText('Email or username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('announces a failed login and flags the inputs invalid', async () => {
    login.mockRejectedValue(new Error('nope'))
    renderLogin()

    await userEvent.type(screen.getByLabelText('Email or username'), 'a')
    await userEvent.type(screen.getByLabelText('Password'), 'b')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid username or password')
    await waitFor(() => {
      expect(screen.getByLabelText('Email or username')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('links to signup and password reset', () => {
    renderLogin()

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('stays calm when throttled', async () => {
    login.mockRejectedValue(new ApiError(429, null, null))
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts, try again later.')
  })

  it('does not flag inputs before a failure', () => {
    renderLogin()

    expect(screen.getByLabelText('Email or username')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('styles both labels identically', () => {
    renderLogin()

    const user = screen.getByText('Email or username', { selector: 'label' })
    const pass = screen.getByText('Password', { selector: 'label' })
    expect(user.className).toBe(pass.className)
    expect(pass).toHaveClass('text-ink-2')
  })

  it('links the inputs to the error only while it is shown', async () => {
    login.mockRejectedValue(new Error('nope'))
    renderLogin()
    expect(screen.getByLabelText('Email or username')).not.toHaveAttribute('aria-describedby')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    await waitFor(() => {
      expect(screen.getByLabelText('Email or username')).toHaveAttribute('aria-describedby', alert.id)
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', alert.id)
    })
  })
})
