const STORAGE_KEY = 'admin_token'

export function getAdminToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEY)
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(STORAGE_KEY, token)
}

export function clearAdminToken() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminToken()
}

/** Fetch wrapper that adds admin auth header */
export function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAdminToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('X-Admin-Token', token)
  return fetch(url, { ...init, headers })
}

export async function adminLogin(password: string): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await resp.json()
  if (data.ok && data.token) {
    setAdminToken(data.token)
    return { ok: true }
  }
  return { ok: false, error: data.error || 'Ошибка' }
}
