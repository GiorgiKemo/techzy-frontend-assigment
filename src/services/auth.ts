import type { AuthUser } from '../types'
import { AuthError } from './errors'
import { useLocalApi } from './mode'
import * as localApi from './localApi'

export { AuthError }
export { isUserVerified } from './emailProxy'

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

export async function verifyEmail(token: string) {
  if (useLocalApi) return localApi.verifyEmail(token)
  return request<AuthUser>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
}

export async function resendVerification() {
  if (useLocalApi) return localApi.resendVerification()
  return request<{ ok: boolean; sent?: boolean; message?: string }>('/api/auth/resend-verification', { method: 'POST' })
}

export async function forgotPassword(email: string) {
  if (useLocalApi) return localApi.forgotPassword(email)
  return request<{ ok: boolean; message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
}

export async function resetPassword(token: string, password: string) {
  if (useLocalApi) return localApi.resetPassword(token, password)
  return request<{ ok: boolean; message: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
}
