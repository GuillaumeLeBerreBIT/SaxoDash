import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAuth from './RequireAuth'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/transactions" element={<div>Transactions page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('RequireAuth', () => {
  it('redirects to /login when there is no access token', () => {
    renderAt('/transactions')

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Transactions page')).not.toBeInTheDocument()
  })

  it('renders the protected route when an access token is present', () => {
    localStorage.setItem('access', 'valid-token')

    renderAt('/transactions')

    expect(screen.getByText('Transactions page')).toBeInTheDocument()
  })
})
