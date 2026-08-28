export function isUserVerified(user: { emailVerified?: boolean }) {
  return user.emailVerified !== false
}

async function postEmail(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  return { ok: response.ok, sent: Boolean(payload.sent), message: payload.message as string | undefined }
}

export async function sendVerificationEmailProxy(email: string, name: string, token: string) {
  const result = await postEmail('/api/email/send-verification', { email, name, token })
  if (!result.ok) {
    console.info('[Loop] Verification link (dev):', `${window.location.origin}${window.location.pathname}?verify=${token}`)
  }
  return result
}

export async function sendPasswordResetEmailProxy(email: string, name: string, token: string) {
  const result = await postEmail('/api/email/send-password-reset', { email, name, token })
  if (!result.ok) {
    console.info('[Loop] Password reset link (dev):', `${window.location.origin}${window.location.pathname}?reset=${token}`)
  }
  return result
}

import type { Booking } from '../types'

export async function sendBookingEmailProxy(email: string, name: string, event: 'created' | 'updated' | 'cancelled', booking: Booking, roomName: string) {
  const result = await postEmail('/api/email/send-booking', { email, name, event, booking, roomName })
  if (!result.ok) {
    console.info('[Loop] Booking notification skipped (email service unavailable).')
  }
  return result
}
