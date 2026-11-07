import { ApiError, BASE_URL, setTokens } from './http'

async function postPublic(path, payload) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body?.detail, body)
  return body
}

export async function signup({ email, username, password, website }) {
  const body = await postPublic('/api/auth/signup/', { email, username, password, website })
  setTokens(body)
  localStorage.setItem('username', body.user?.username ?? username)
  return body
}

export const requestPasswordReset = (email) => postPublic('/api/auth/password-reset/', { email })

export async function confirmPasswordReset({ uid, token, newPassword }) {
  const body = await postPublic('/api/auth/password-reset/confirm/', { uid, token, new_password: newPassword })
  setTokens(body)
  return body
}
