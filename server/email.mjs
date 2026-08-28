const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_FROM = process.env.RESEND_FROM || 'Loop <onboarding@resend.dev>'
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')

export function isEmailConfigured() {
  return Boolean(RESEND_API_KEY)
}

export function appUrl(path = '') {
  return `${APP_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.info('[email stub]', { to, subject })
    return { ok: true, stub: true }
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend API error (${response.status}): ${body}`)
  }
  return response.json()
}

function layout(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:DM Sans,Arial,sans-serif;background:#f6f7f5;color:#18201e;padding:24px;"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e6e2;border-radius:12px;padding:28px;">${bodyHtml}<p style="margin-top:28px;font-size:12px;color:#75807c;">Loop · Kartuli Labs workplace</p></div></body></html>`
}

export async function sendVerificationEmail({ email, name, token }) {
  const link = appUrl(`?verify=${encodeURIComponent(token)}`)
  const subject = 'Verify your Loop account'
  const html = layout(subject, `
    <h1 style="font-size:22px;margin:0 0 12px;">Verify your email</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Confirm your email address to start booking rooms in Loop.</p>
    <p><a href="${link}" style="display:inline-block;background:#163b34;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Verify email</a></p>
    <p style="font-size:13px;color:#75807c;">This link expires in 24 hours and can only be used once.</p>
    <p style="font-size:12px;color:#98a39d;word-break:break-all;">${link}</p>
  `)
  const text = `Hi ${name},\n\nVerify your Loop account: ${link}\n\nThis link expires in 24 hours.`
  return sendEmail({ to: email, subject, html, text })
}

export async function sendPasswordResetEmail({ email, name, token }) {
  const link = appUrl(`?reset=${encodeURIComponent(token)}`)
  const subject = 'Reset your Loop password'
  const html = layout(subject, `
    <h1 style="font-size:22px;margin:0 0 12px;">Reset your password</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>We received a request to reset your Loop password.</p>
    <p><a href="${link}" style="display:inline-block;background:#163b34;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Choose a new password</a></p>
    <p style="font-size:13px;color:#75807c;">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
    <p style="font-size:12px;color:#98a39d;word-break:break-all;">${link}</p>
  `)
  const text = `Hi ${name},\n\nReset your Loop password: ${link}\n\nThis link expires in 1 hour.`
  return sendEmail({ to: email, subject, html, text })
}

export async function sendBookingEmail({ email, name, event, booking, roomName }) {
  const when = `${booking.date} · ${booking.start}–${booking.end}`
  const titles = {
    created: 'Booking confirmed',
    updated: 'Booking updated',
    cancelled: 'Booking cancelled',
  }
  const intros = {
    created: 'Your room booking has been confirmed.',
    updated: 'Your room booking has been updated.',
    cancelled: 'Your room booking has been cancelled.',
  }
  const subject = `${titles[event]}: ${booking.title}`
  const html = layout(subject, `
    <h1 style="font-size:22px;margin:0 0 12px;">${titles[event]}</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>${intros[event]}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:6px 0;color:#75807c;">Meeting</td><td style="padding:6px 0;"><strong>${escapeHtml(booking.title)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#75807c;">Room</td><td style="padding:6px 0;">${escapeHtml(roomName)}</td></tr>
      <tr><td style="padding:6px 0;color:#75807c;">When</td><td style="padding:6px 0;">${escapeHtml(when)}</td></tr>
      <tr><td style="padding:6px 0;color:#75807c;">Status</td><td style="padding:6px 0;">${escapeHtml(booking.status)}</td></tr>
    </table>
    ${booking.notes ? `<p style="font-size:13px;color:#75807c;"><strong>Notes:</strong> ${escapeHtml(booking.notes)}</p>` : ''}
    <p><a href="${appUrl()}" style="color:#163b34;">Open Loop</a></p>
  `)
  const text = `${intros[event]}\n\n${booking.title}\n${roomName}\n${when}\nStatus: ${booking.status}`
  return sendEmail({ to: email, subject, html, text })
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
