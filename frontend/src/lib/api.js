const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export function getToken() { return localStorage.getItem('gearvault_token') }
export function getUser() {
  const raw = localStorage.getItem('gearvault_user')
  return raw ? JSON.parse(raw) : null
}
export function setSession(token, user) {
  localStorage.setItem('gearvault_token', token)
  localStorage.setItem('gearvault_user', JSON.stringify(user))
}
export function clearSession() { localStorage.removeItem('gearvault_token'); localStorage.removeItem('gearvault_user') }

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...options.headers }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}
