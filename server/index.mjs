import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const runtimeDir = path.join(__dirname, 'data')
const sourceDir = path.join(rootDir, 'src', 'data')
const port = Number(process.env.PORT || 8787)
const isProduction = process.env.NODE_ENV === 'production'
const serveFrontend = isProduction || process.argv.includes('--serve-frontend')
const SESSION_COOKIE = 'loop_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const colors = ['#f1d2b9', '#c9e5e2', '#d9c9f0', '#d9e4b7', '#f0cdd3', '#cbd9ef']

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

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T12:00:00`)
  shifted.setDate(shifted.getDate() + days)
  return shifted.toISOString().slice(0, 10)
}

function daysBetween(left, right) {
  return Math.round((new Date(`${left}T12:00:00`).getTime() - new Date(`${right}T12:00:00`).getTime()) / 86400000)
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
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
  return { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials, color: user.color }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key))
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
  const sessions = getSessions()
  const session = sessions.find((item) => item.token === token && item.expiresAt > Date.now())
  if (!session) return null
  const user = getUsers().find((item) => item.id === session.userId)
  return user || null
}

function requireAuth(req, res, next) {
  const user = authenticatedUser(req)
  if (!user) return res.status(401).json({ message: 'Please sign in to continue.' })
  req.user = user
  return next()
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derivedKey = crypto.scryptSync(password, salt, 64)
  return { salt: salt.toString('base64'), hash: derivedKey.toString('base64') }
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, Buffer.from(user.salt, 'base64'))
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
  if (!Number.isInteger(Number(booking.attendees)) || Number(booking.attendees) < 1) return 'Add at least one attendee.'
  if (Number(booking.attendees) > room.capacity) return `This room fits up to ${room.capacity} people.`
  if (typeof booking.notes !== 'string' || booking.notes.length > 2000) return 'Notes can be up to 2,000 characters.'
  if (!getEmployees().some((item) => item.id === booking.organizerId) && !getUsers().some((item) => item.id === booking.organizerId)) return 'Choose a valid organizer.'
  const duplicate = bookings.some((item) => item.id !== editingId && item.status !== 'cancelled' && item.roomId === booking.roomId && item.date === booking.date && start < timeToMinutes(item.end) && end > timeToMinutes(item.start))
  if (duplicate) return 'That room is already booked during this time.'
  return null
}

function timeToMinutes(value) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/register', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (name.length < 2 || name.length > 80) return sendValidationError(res, 'Enter a name between 2 and 80 characters.')
  if (!validateEmail(email)) return sendValidationError(res, 'Enter a valid email address.')
  if (password.length < 8 || password.length > 128) return sendValidationError(res, 'Use a password between 8 and 128 characters.')
  const users = getUsers()
  if (users.some((user) => user.email === email)) return res.status(409).json({ message: 'An account with that email already exists.' })
  const credentials = hashPassword(password)
  const user = { id: `user-${crypto.randomUUID()}`, name, email, role: 'Workspace member', initials: initials(name), color: colors[users.length % colors.length], ...credentials }
  writeJson(runtimePath('users.json'), [...users, user])
  setSessionCookie(res, createSession(user.id))
  return res.status(201).json(publicUser(user))
})

app.post('/api/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const user = getUsers().find((item) => item.email === email)
  if (!user || !verifyPassword(password, user)) return res.status(401).json({ message: 'Email or password is incorrect.' })
  setSessionCookie(res, createSession(user.id))
  return res.json(publicUser(user))
})

app.get('/api/auth/me', (req, res) => {
  const user = authenticatedUser(req)
  return res.json(user ? publicUser(user) : null)
})

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const color = typeof req.body?.color === 'string' ? req.body.color : req.user.color
  if (name.length < 2 || name.length > 80) return sendValidationError(res, 'Enter a name between 2 and 80 characters.')
  if (!colors.includes(color)) return sendValidationError(res, 'Choose a valid profile color.')
  const users = getUsers()
  const index = users.findIndex((user) => user.id === req.user.id)
  if (index === -1) return res.status(404).json({ message: 'Account not found.' })
  const updatedUser = { ...users[index], name, initials: initials(name), color }
  users[index] = updatedUser
  writeJson(runtimePath('users.json'), users)
  return res.json(publicUser(updatedUser))
})

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) writeJson(runtimePath('sessions.json'), getSessions().filter((session) => session.token !== token))
  clearSessionCookie(res)
  return res.json({ ok: true })
})

app.get('/api/app-data', requireAuth, (req, res) => {
  const employees = getEmployees()
  if (!employees.some((employee) => employee.id === req.user.id)) employees.push(userForEmployees(req.user))
  return res.json({ rooms: getRooms(), employees, bookings: getBookings() })
})

app.post('/api/bookings', requireAuth, (req, res) => {
  const booking = { ...req.body, title: typeof req.body?.title === 'string' ? req.body.title.trim() : '', notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : '', attendees: Number(req.body?.attendees) }
  const error = validateBooking(booking, getBookings())
  if (error) return sendValidationError(res, error)
  const created = { ...booking, id: `booking-${crypto.randomUUID()}` }
  writeJson(runtimePath('bookings.json'), [...getBookings(), created])
  return res.status(201).json(created)
})

app.put('/api/bookings/:id', requireAuth, (req, res) => {
  const bookings = getBookings()
  const index = bookings.findIndex((booking) => booking.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Booking not found.' })
  const booking = { ...req.body, id: req.params.id, title: typeof req.body?.title === 'string' ? req.body.title.trim() : '', notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : '', attendees: Number(req.body?.attendees) }
  const error = validateBooking(booking, bookings, req.params.id)
  if (error) return sendValidationError(res, error)
  bookings[index] = booking
  writeJson(runtimePath('bookings.json'), bookings)
  return res.json(booking)
})

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  const bookings = getBookings()
  const index = bookings.findIndex((booking) => booking.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Booking not found.' })
  bookings[index] = { ...bookings[index], status: 'cancelled' }
  writeJson(runtimePath('bookings.json'), bookings)
  return res.json(bookings[index])
})

if (serveFrontend) {
  const distDir = path.join(rootDir, 'dist')
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(distDir, 'index.html'))
    return next()
  })
}

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ message: 'Request body is not valid JSON.' })
  console.error(error)
  return res.status(500).json({ message: 'The server could not complete that request.' })
})

app.listen(port, () => console.log(`Loop API listening on http://localhost:${port}`))
