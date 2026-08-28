import { sendBookingEmail, sendPasswordResetEmail, sendVerificationEmail, isEmailConfigured } from '../email.mjs'

function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function handleSendVerification(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : 'there'
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  if (!validateEmail(email) || token.length < 32) {
    return res.status(400).json({ message: 'Invalid verification request.' })
  }
  try {
    await sendVerificationEmail({ email, name, token })
    return res.json({ ok: true, sent: isEmailConfigured() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'We could not send the verification email.' })
  }
}

export async function handleSendPasswordReset(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : 'there'
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  if (!validateEmail(email) || token.length < 32) {
    return res.status(400).json({ message: 'Invalid reset request.' })
  }
  try {
    await sendPasswordResetEmail({ email, name, token })
    return res.json({ ok: true, sent: isEmailConfigured() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'We could not send the reset email.' })
  }
}

export async function handleSendBooking(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : 'there'
  const event = req.body?.event
  const booking = req.body?.booking
  const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : 'Room'
  if (!validateEmail(email) || !booking || typeof booking !== 'object') {
    return res.status(400).json({ message: 'Invalid booking notification request.' })
  }
  if (event !== 'created' && event !== 'updated' && event !== 'cancelled') {
    return res.status(400).json({ message: 'Invalid booking event.' })
  }
  try {
    await sendBookingEmail({ email, name, event, booking, roomName })
    return res.json({ ok: true, sent: isEmailConfigured() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'We could not send the booking email.' })
  }
}
