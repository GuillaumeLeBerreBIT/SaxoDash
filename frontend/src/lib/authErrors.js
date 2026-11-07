import { ApiError, TOO_MANY_REQUESTS_STATUS } from '../api/client'

export const TOO_MANY_ATTEMPTS = 'Too many attempts, try again later.'

export const RETRYABLE = 'Something went wrong. Try again.'

export const isThrottled = (error) => error?.status === TOO_MANY_REQUESTS_STATUS

export function fieldErrors(error) {
  const body = error?.body
  if (!body || typeof body !== 'object') return {}
  return Object.fromEntries(
    Object.entries(body)
      .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
      .map(([field, messages]) => [field, messages.join(' ')]),
  )
}

export const isRefusal = (error) => error instanceof ApiError && error.status === 400
