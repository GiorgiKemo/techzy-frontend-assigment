import type { AuthUser } from '../types'
import { AuthError } from './errors'
import { useLocalApi } from './mode'
import * as localApi from './localApi'

export { AuthError }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new AuthError(payload.message || 'Authentication failed.', response.status)
  return payload as T
}

export async function getCurrentUser() {
  if (useLocalApi) return localApi.getCurrentUser()
  return request<AuthUser | null>('/api/auth/me')
}

export async function login(email: string, password: string) {
  if (useLocalApi) return localApi.login(email, password)
  return request<AuthUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export async function register(name: string, email: string, password: string) {
  if (useLocalApi) return localApi.register(name, email, password)
  return request<AuthUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) })
}

export async function updateProfile(name: string, color: string) {
  if (useLocalApi) return localApi.updateProfile(name, color)
  return request<AuthUser>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name, color }) })
}

export async function logout() {
  if (useLocalApi) {
    await localApi.logout()
    return
  }
  await request('/api/auth/logout', { method: 'POST' })
}
