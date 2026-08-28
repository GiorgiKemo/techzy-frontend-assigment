import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { loadEnvFile } from './lib/env.mjs'
import { generateToken, hashToken, verifyTokenHash } from './lib/tokens.mjs'
import { isEmailConfigured, sendBookingEmail, sendPasswordResetEmail, sendVerificationEmail } from './email.mjs'
import { handleSendBooking, handleSendPasswordReset, handleSendVerification } from './routes/emailProxy.mjs'

loadEnvFile()

const scrypt = promisify(crypto.scrypt)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const runtimeDir = path.join(__dirname, 'data')
const sourceDir = path.join(rootDir, 'src', 'data')
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '0.0.0.0'
const serveFrontendFlag = process.argv.includes('--serve-frontend')
if (serveFrontendFlag && !process.env.NODE_ENV) process.env.NODE_ENV = 'production'
const isProduction = process.env.NODE_ENV === 'production'
const serveFrontend = isProduction || serveFrontendFlag
const SESSION_COOKIE = 'loop_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const AUTH_WINDOW_MS = 15 * 60 * 1000
const AUTH_ATTEMPT_LIMIT = 10
const EMAIL_WINDOW_MS = 15 * 60 * 1000
const EMAIL_ATTEMPT_LIMIT = 8
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const colors = ['#f1d2b9', '#c9e5e2', '#d9c9f0', '#d9e4b7', '#f0cdd3', '#cbd9ef']
const dummyCredentials = {
  salt: crypto.randomBytes(16).toString('base64'),
  hash: crypto.randomBytes(64).toString('base64'),
}

fs.mkdirSync(runtimeDir, { recursive: true })

function runtimePath(name) {
  return path.join(runtimeDir, name)
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

let storeLock = Promise.resolve()
function withStoreLock(fn) {
  const run = storeLock.then(() => fn(), () => fn())
  storeLock = run.then(() => undefined, () => undefined)
  return run
}

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T12:00:00`)
  shifted.setDate(shifted.getDate() + days)
  return localDate(shifted)
}

function daysBetween(left, right) {
  return Math.round((new Date(`${left}T12:00:00`).getTime() - new Date(`${right}T12:00:00`).getTime()) / 86400000)
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && localDate(date) === value
}

function initializeRuntimeData() {
  const stateFile = runtimePath('state.json')
  const state = readJson(stateFile, { initialized: false })
  if (!state.initialized) {
    const rooms = readJson(path.join(sourceDir, 'rooms.json'), [])
    const employees = readJson(path.join(sourceDir, 'employees.json'), [])
    const seedBookings = readJson(path.join(sourceDir, 'bookings.json'), [])
    const dayOffset = daysBetween(localDate(), '2025-03-18')
    writeJson(runtimePath('rooms.json'), rooms)
    writeJson(runtimePath('employees.json'), employees)
    writeJson(runtimePath('bookings.json'), seedBookings.map((booking) => ({ ...booking, date: shiftDate(booking.date, dayOffset) })))
    writeJson(runtimePath('users.json'), [])
    writeJson(runtimePath('sessions.json'), [])
    writeJson(stateFile, { initialized: true })
  }
  if (!fs.existsSync(runtimePath('rooms.json'))) writeJson(runtimePath('rooms.json'), [])
  if (!fs.existsSync(runtimePath('employees.json'))) writeJson(runtimePath('employees.json'), [])
  if (!fs.existsSync(runtimePath('bookings.json'))) writeJson(runtimePath('bookings.json'), [])
  if (!fs.existsSync(runtimePath('users.json'))) writeJson(runtimePath('users.json'), [])
  if (!fs.existsSync(runtimePath('sessions.json'))) writeJson(runtimePath('sessions.json'), [])
}

initializeRuntimeData()

function getRooms() { return readJson(runtimePath('rooms.json'), []) }
function getEmployees() { return readJson(runtimePath('employees.json'), []) }
function getBookings() { return readJson(runtimePath('bookings.json'), []) }
function getUsers() { return readJson(runtimePath('users.json'), []) }
function getSessions() { return readJson(runtimePath('sessions.json'), []) }

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    color: user.color,
    emailVerified: isEmailVerified(user),
  }
}

function isEmailVerified(user) {
  return user?.emailVerified !== false
}

function issueVerificationToken() {
  const token = generateToken()
  return {
    token,
    verificationToken: hashToken(token),
    verificationTokenExpires: Date.now() + VERIFICATION_TTL_MS,
  }
}

function issueResetToken() {
  const token = generateToken()
  return {
    token,
    resetToken: hashToken(token),
    resetTokenExpires: Date.now() + RESET_TTL_MS,
  }
}

async function notifyOrganizerBooking(user, booking, event) {
  if (!user?.email || !isEmailVerified(user)) return
  const room = getRooms().find((item) => item.id === booking.roomId)
  try {
    await sendBookingEmail({
      email: user.email,
      name: user.name,
      event,
      booking,
      roomName: room?.name || 'Room',
    })
  } catch (error) {
    console.error('Booking email failed:', error)
  }
}

function organizerUser(organizerId) {
  return getUsers().find((user) => user.id === organizerId) || null
}

function parseCookies(header = '') {
  const cookies = {}
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      cookies[decodeURIComponent(key)] = decodeURIComponent(value)
    } catch {
      // Ignore malformed cookie pairs instead of failing the request.
    }
  }
  return cookies
}

function setSessionCookie(res, token) {
  const attributes = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_TTL_MS / 1000}`]
  if (isProduction) attributes.push('Secure')
  res.setHeader('Set-Cookie', attributes.join('; '))
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}`)
}

function createSession(userId) {
  const sessions = getSessions().filter((session) => session.expiresAt > Date.now())
  const token = crypto.randomBytes(32).toString('hex')
  sessions.push({ token, userId, expiresAt: Date.now() + SESSION_TTL_MS })
  writeJson(runtimePath('sessions.json'), sessions)
  return token
}

function authenticatedUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) return null
  const session = getSessions().find((item) => item.token === token && item.expiresAt > Date.now())
  if (!session) return null
  return getUsers().find((item) => item.id === session.userId) || null
}

function requireAuth(req, res, next) {
  const user = authenticatedUser(req)
  if (!user) return res.status(401).json({ message: 'Please sign in to continue.' })
  req.user = user
  return next()
}

function requireVerified(req, res, next) {
  if (!isEmailVerified(req.user)) {
    return res.status(403).json({ message: 'Please verify your email address to continue.', code: 'EMAIL_NOT_VERIFIED' })
  }
  return next()
}

function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derivedKey = await scrypt(password, salt, 64)
  return { salt: salt.toString('base64'), hash: derivedKey.toString('base64') }
}

async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, Buffer.from(user.salt, 'base64'))
  const expected = Buffer.from(user.hash, 'base64')
  const actual = Buffer.from(hash, 'base64')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function userForEmployees(user) {
  return { id: user.id, name: user.name, role: user.role, initials: user.initials, color: user.color }
}

function sendValidationError(res, message) {
  return res.status(400).json({ message })
}

function normalizeBooking(body, id, status) {
  return {
    id,
    roomId: typeof body?.roomId === 'string' ? body.roomId : '',
    title: typeof body?.title === 'string' ? body.title.trim() : '',
    organizerId: typeof body?.organizerId === 'string' ? body.organizerId : '',
    date: typeof body?.date === 'string' ? body.date : '',
    start: typeof body?.start === 'string' ? body.start : '',
    end: typeof body?.end === 'string' ? body.end : '',
    attendees: Number(body?.attendees),
    status,
    notes: typeof body?.notes === 'string' ? body.notes.trim() : '',
  }
}

function bookingStatus(value, fallback) {
  return value === 'confirmed' || value === 'tentative' ? value : fallback
}

function validateBooking(booking, bookings, editingId = null) {
  if (!booking || typeof booking !== 'object') return 'Booking details are required.'
  if (typeof booking.title !== 'string' || !booking.title.trim() || booking.title.trim().length > 160) return 'Give your booking a title of up to 160 characters.'
  if (!isValidDate(booking.date)) return 'Choose a valid date.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.end)) return 'Choose a valid start and end time.'
  const start = Number(booking.start.slice(0, 2)) * 60 + Number(booking.start.slice(3))
  const end = Number(booking.end.slice(0, 2)) * 60 + Number(booking.end.slice(3))
  if (end <= start) return 'End time needs to be after the start time.'
  const room = getRooms().find((item) => item.id === booking.roomId)
  if (!room) return 'Choose an available room.'
  if (!Number.isInteger(booking.attendees) || booking.attendees < 1) return 'Add at least one attendee.'
  if (booking.attendees > room.capacity) return `This room fits up to ${room.capacity} people.`
  if (typeof booking.notes !== 'string' || booking.notes.length > 2000) return 'Notes can be up to 2,000 characters.'
  if (booking.status !== 'confirmed' && booking.status !== 'tentative') return 'Choose a valid booking status.'
  if (!getEmployees().some((item) => item.id === booking.organizerId) && !getUsers().some((item) => item.id === booking.organizerId)) return 'Choose a valid organizer.'
  const duplicate = bookings.some((item) => item.id !== editingId && item.status !== 'cancelled' && item.roomId === booking.roomId && item.date === booking.date && start < timeToMinutes(item.end) && end > timeToMinutes(item.start))
  if (duplicate) return 'That room is already booked during this time.'
  return null
}

function timeToMinutes(value) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

const rateBuckets = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key)
  }
}, 60_000).unref()

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

function rateLimit(key, limit, windowMs) {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

function limitAuth(req, res, next) {
  if (!rateLimit(`auth:${clientKey(req)}`, AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS)) {
    res.setHeader('Retry-After', '900')
    return res.status(429).json({ message: 'Too many attempts. Try again in a few minutes.' })
  }
  return next()
}

function limitEmail(req, res, next) {
  if (!rateLimit(`email:${clientKey(req)}`, EMAIL_ATTEMPT_LIMIT, EMAIL_WINDOW_MS)) {
    res.setHeader('Retry-After', '900')
    return res.status(429).json({ message: 'Too many email requests. Try again in a few minutes.' })
  }
  return next()
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

const app = express()
app.disable('x-powered-by')
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
app.use(express.json({ limit: '32kb' }))
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'")
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  next()
})

app.get('/api/health', (_req, res) => {
  try {
    fs.accessSync(runtimeDir, fs.constants.W_OK)
    return res.json({ ok: true })
  } catch {
    return res.status(503).json({ ok: false, message: 'Storage is not writable.' })
  }
})

app.post('/api/auth/register', limitAuth, asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (name.length < 2 || name.length > 80) return sendValidationError(res, 'Enter a name between 2 and 80 characters.')
  if (!validateEmail(email)) return sendValidationError(res, 'Enter a valid email address.')
  if (password.length < 8 || password.length > 128) return sendValidationError(res, 'Use a password between 8 and 128 characters.')
  const verification = issueVerificationToken()
  const created = await withStoreLock(async () => {
    const users = getUsers()
    if (users.some((user) => user.email === email)) return { conflict: true }
    const credentials = await hashPassword(password)
    const user = {
      id: `user-${crypto.randomUUID()}`,
      name,
      email,
      role: 'Workspace member',
      initials: initials(name),
      color: colors[users.length % colors.length],
      emailVerified: false,
      verificationToken: verification.verificationToken,
      verificationTokenExpires: verification.verificationTokenExpires,
      ...credentials,
    }
    writeJson(runtimePath('users.json'), [...users, user])
    return { user, token: createSession(user.id) }
  })
  if (created.conflict) return res.status(409).json({ message: 'An account with that email already exists.' })
  try {
    await sendVerificationEmail({ email, name, token: verification.token })
  } catch (error) {
    console.error('Verification email failed:', error)
    if (!isEmailConfigured()) {
      console.info(`[dev] Verification link: ${process.env.APP_BASE_URL || 'http://localhost:5173'}?verify=${verification.token}`)
    }
  }
  setSessionCookie(res, created.token)
  return res.status(201).json(publicUser(created.user))
}))

app.post('/api/auth/login', limitAuth, asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const result = await withStoreLock(async () => {
    const user = getUsers().find((item) => item.email === email)
    const valid = await verifyPassword(password, user || dummyCredentials)
    if (!user || !valid) return { invalid: true }
    return { user, token: createSession(user.id) }
  })
  if (result.invalid) return res.status(401).json({ message: 'Email or password is incorrect.' })
  setSessionCookie(res, result.token)
  return res.json(publicUser(result.user))
}))

app.get('/api/auth/me', (req, res) => {
  const user = authenticatedUser(req)
  return res.json(user ? publicUser(user) : null)
})

app.patch('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const color = typeof req.body?.color === 'string' ? req.body.color : req.user.color
  if (name.length < 2 || name.length > 80) return sendValidationError(res, 'Enter a name between 2 and 80 characters.')
  if (!colors.includes(color)) return sendValidationError(res, 'Choose a valid profile color.')
  const updatedUser = await withStoreLock(() => {
    const users = getUsers()
    const index = users.findIndex((user) => user.id === req.user.id)
    if (index === -1) return null
    const nextUser = { ...users[index], name, initials: initials(name), color }
    users[index] = nextUser
    writeJson(runtimePath('users.json'), users)
    return nextUser
  })
  if (!updatedUser) return res.status(404).json({ message: 'Account not found.' })
  return res.json(publicUser(updatedUser))
}))

app.post('/api/auth/logout', asyncHandler(async (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) {
    await withStoreLock(() => {
      writeJson(runtimePath('sessions.json'), getSessions().filter((session) => session.token !== token))
    })
  }
  clearSessionCookie(res)
  return res.json({ ok: true })
}))

app.post('/api/auth/verify-email', limitAuth, asyncHandler(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (token.length < 32) return sendValidationError(res, 'Verification link is invalid or expired.')
  const verified = await withStoreLock(() => {
    const users = getUsers()
    const index = users.findIndex((user) => user.verificationToken && user.verificationTokenExpires > Date.now() && verifyTokenHash(token, user.verificationToken))
    if (index === -1) return { invalid: true }
    const nextUser = {
      ...users[index],
      emailVerified: true,
      verificationToken: undefined,
      verificationTokenExpires: undefined,
    }
    users[index] = nextUser
    writeJson(runtimePath('users.json'), users)
    return { user: nextUser }
  })
  if (verified.invalid) return res.status(400).json({ message: 'Verification link is invalid or expired.' })
  return res.json(publicUser(verified.user))
}))

app.post('/api/auth/resend-verification', limitEmail, requireAuth, asyncHandler(async (req, res) => {
  if (isEmailVerified(req.user)) return res.json({ ok: true, message: 'Email is already verified.' })
  const verification = issueVerificationToken()
  const updated = await withStoreLock(() => {
    const users = getUsers()
    const index = users.findIndex((user) => user.id === req.user.id)
    if (index === -1) return null
    const nextUser = {
      ...users[index],
      verificationToken: verification.verificationToken,
      verificationTokenExpires: verification.verificationTokenExpires,
    }
    users[index] = nextUser
    writeJson(runtimePath('users.json'), users)
    return nextUser
  })
  if (!updated) return res.status(404).json({ message: 'Account not found.' })
  try {
    await sendVerificationEmail({ email: updated.email, name: updated.name, token: verification.token })
    return res.json({ ok: true, sent: isEmailConfigured() })
  } catch (error) {
    console.error('Resend verification failed:', error)
    if (!isEmailConfigured()) {
      console.info(`[dev] Verification link: ${process.env.APP_BASE_URL || 'http://localhost:5173'}?verify=${verification.token}`)
      return res.json({ ok: true, sent: false })
    }
    return res.status(500).json({ message: 'We could not send the verification email.' })
  }
}))

app.post('/api/auth/forgot-password', limitEmail, asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!validateEmail(email)) return sendValidationError(res, 'Enter a valid email address.')
  const reset = issueResetToken()
  const user = await withStoreLock(() => {
    const users = getUsers()
    const index = users.findIndex((item) => item.email === email)
    if (index === -1) return null
    const nextUser = {
      ...users[index],
      resetToken: reset.resetToken,
      resetTokenExpires: reset.resetTokenExpires,
    }
    users[index] = nextUser
    writeJson(runtimePath('users.json'), users)
    return nextUser
  })
  if (user) {
    try {
      await sendPasswordResetEmail({ email: user.email, name: user.name, token: reset.token })
    } catch (error) {
      console.error('Password reset email failed:', error)
      if (!isEmailConfigured()) {
        console.info(`[dev] Password reset link: ${process.env.APP_BASE_URL || 'http://localhost:5173'}?reset=${reset.token}`)
      }
    }
  }
  return res.json({ ok: true, message: 'If an account exists for that email, we sent password reset instructions.' })
}))

app.post('/api/auth/reset-password', limitAuth, asyncHandler(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (token.length < 32) return sendValidationError(res, 'Reset link is invalid or expired.')
  if (password.length < 8 || password.length > 128) return sendValidationError(res, 'Use a password between 8 and 128 characters.')
  const updated = await withStoreLock(async () => {
    const users = getUsers()
    const index = users.findIndex((user) => user.resetToken && user.resetTokenExpires > Date.now() && verifyTokenHash(token, user.resetToken))
    if (index === -1) return { invalid: true }
    const credentials = await hashPassword(password)
    const nextUser = {
      ...users[index],
      ...credentials,
      resetToken: undefined,
      resetTokenExpires: undefined,
    }
    users[index] = nextUser
    writeJson(runtimePath('users.json'), users)
    return { user: nextUser }
  })
  if (updated.invalid) return res.status(400).json({ message: 'Reset link is invalid or expired.' })
  return res.json({ ok: true, message: 'Your password has been updated. You can sign in now.' })
}))

app.post('/api/email/send-verification', limitEmail, asyncHandler(handleSendVerification))
app.post('/api/email/send-password-reset', limitEmail, asyncHandler(handleSendPasswordReset))
app.post('/api/email/send-booking', limitEmail, asyncHandler(handleSendBooking))

app.get('/api/app-data', requireAuth, requireVerified, (req, res) => {
  const employees = getEmployees()
  if (!employees.some((employee) => employee.id === req.user.id)) employees.push(userForEmployees(req.user))
  return res.json({ rooms: getRooms(), employees, bookings: getBookings() })
})

app.post('/api/bookings', requireAuth, requireVerified, asyncHandler(async (req, res) => {
  const created = await withStoreLock(() => {
    const bookings = getBookings()
    const booking = normalizeBooking(req.body, `booking-${crypto.randomUUID()}`, bookingStatus(req.body?.status, 'confirmed'))
    const error = validateBooking(booking, bookings)
    if (error) return { error }
    writeJson(runtimePath('bookings.json'), [...bookings, booking])
    return { booking }
  })
  if (created.error) return sendValidationError(res, created.error)
  const organizer = organizerUser(created.booking.organizerId) || req.user
  await notifyOrganizerBooking(organizer, created.booking, 'created')
  return res.status(201).json(created.booking)
}))

app.put('/api/bookings/:id', requireAuth, requireVerified, asyncHandler(async (req, res) => {
  const updated = await withStoreLock(() => {
    const bookings = getBookings()
    const index = bookings.findIndex((booking) => booking.id === req.params.id)
    if (index === -1) return { missing: true }
    const booking = normalizeBooking(req.body, req.params.id, bookingStatus(req.body?.status, bookings[index].status === 'cancelled' ? 'confirmed' : bookings[index].status))
    const error = validateBooking(booking, bookings, req.params.id)
    if (error) return { error }
    bookings[index] = booking
    writeJson(runtimePath('bookings.json'), bookings)
    return { booking }
  })
  if (updated.missing) return res.status(404).json({ message: 'Booking not found.' })
  if (updated.error) return sendValidationError(res, updated.error)
  const organizer = organizerUser(updated.booking.organizerId) || req.user
  await notifyOrganizerBooking(organizer, updated.booking, 'updated')
  return res.json(updated.booking)
}))

app.delete('/api/bookings/:id', requireAuth, requireVerified, asyncHandler(async (req, res) => {
  const cancelled = await withStoreLock(() => {
    const bookings = getBookings()
    const index = bookings.findIndex((booking) => booking.id === req.params.id)
    if (index === -1) return { missing: true }
    bookings[index] = { ...bookings[index], status: 'cancelled' }
    writeJson(runtimePath('bookings.json'), bookings)
    return { booking: bookings[index] }
  })
  if (cancelled.missing) return res.status(404).json({ message: 'Booking not found.' })
  const organizer = organizerUser(cancelled.booking.organizerId) || req.user
  await notifyOrganizerBooking(organizer, cancelled.booking, 'cancelled')
  return res.json(cancelled.booking)
}))

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found.' }))

if (serveFrontend) {
  const distDir = path.join(rootDir, 'dist')
  const indexFile = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexFile)) {
    console.error('Frontend build missing. Run `npm run build` before `npm start`.')
    process.exit(1)
  }
  app.use(express.static(distDir, {
    index: false,
    setHeaders(response, filePath) {
      if (filePath.endsWith('.html')) response.setHeader('Cache-Control', 'no-cache')
      else if (/\.[a-f0-9]{8,}\./i.test(path.basename(filePath))) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    },
  }))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indexFile))
}

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ message: 'Request body is not valid JSON.' })
  console.error(error)
  return res.status(500).json({ message: 'The server could not complete that request.' })
})

const server = app.listen(port, host, () => console.log(`Loop API listening on http://${host}:${port}`))

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
