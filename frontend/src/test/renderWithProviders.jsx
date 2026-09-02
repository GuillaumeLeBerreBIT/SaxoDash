import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'

/** Renders a page with the providers the app gives it at runtime.
 *
 *  A fresh QueryClient per call keeps one test's cache out of the next, and
 *  retry: false means a rejected query surfaces immediately instead of after
 *  three backed-off attempts.
 */
export function renderWithProviders(ui, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
