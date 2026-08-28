import type { AppData, Booking } from '../types'
import { ApiError } from './errors'
import { useLocalApi } from './mode'
import * as localApi from './localApi'

export { ApiError }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.message || 'Something went wrong.', response.status)
  return payload as T
}

export async function getAppData() {
  if (useLocalApi) return localApi.getAppData()
  return request<AppData>('/api/app-data')
}

export async function createBooking(booking: Omit<Booking, 'id'>) {
  if (useLocalApi) return localApi.createBooking(booking)
  return request<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify(booking) })
}

export async function updateBooking(id: string, booking: Omit<Booking, 'id'>) {
  if (useLocalApi) return localApi.updateBooking(id, booking)
  return request<Booking>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(booking) })
}

export async function cancelBooking(id: string) {
  if (useLocalApi) return localApi.cancelBooking(id)
  return request<Booking>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
