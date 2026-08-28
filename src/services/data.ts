import type { AppData, Booking } from '../types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

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
  return request<AppData>('/api/app-data')
}

export async function createBooking(booking: Omit<Booking, 'id'>) {
  return request<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify(booking) })
}

export async function updateBooking(id: string, booking: Omit<Booking, 'id'>) {
  return request<Booking>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(booking) })
}

export async function cancelBooking(id: string) {
  return request<Booking>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
