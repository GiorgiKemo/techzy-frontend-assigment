import roomsSeed from '../data/rooms.json'
import employeesSeed from '../data/employees.json'
import bookingsSeed from '../data/bookings.json'
import { addDays, daysBetween, getTodayDate, SEED_BASE_DATE, timeToMinutes } from '../lib/date'
import type { AppData, AuthUser, Booking, BookingStatus, Employee, Room } from '../types'
import { ApiError, AuthError } from './errors'

const STORAGE_PREFIX = 'loop.v1.'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const colors = ['#f1d2b9', '#c9e5e2', '#d9c9f0', '#d9e4b7', '#f0cdd3', '#cbd9ef']

interface StoredUser extends AuthUser {
  salt: string
  hash: string
}

interface StoredSession {
  token: string
  userId: string
  expiresAt: number
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function publicUser(user: StoredUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials, color: user.color }
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function ensureInitialized() {
  if (load('initialized', false)) return
  const offset = daysBetween(getTodayDate(), SEED_BASE_DATE)
  save('rooms', roomsSeed)
  save('employees', employeesSeed)
  save('bookings', (bookingsSeed as Booking[]).map((booking) => ({ ...booking, date: addDays(booking.date, offset) })))
  save('users', [] as StoredUser[])
  save('initialized', true)
}

function currentSession(): StoredSession | null {
  const session = load<StoredSession | null>('session', null)
  if (!session || session.expiresAt <= Date.now()) {
    localStorage.removeItem(STORAGE_PREFIX + 'session')
    return null
  }
  return session
}

function requireUser(): StoredUser {
  const session = currentSession()
  const user = session ? load<StoredUser[]>('users', []).find((item) => item.id === session.userId) : undefined
  if (!user) throw new AuthError('Please sign in to continue.', 401)
  return user
}

function validateBooking(booking: Booking, bookings: Booking[], editingId: string | null) {
  if (!booking.title.trim() || booking.title.trim().length > 160) throw new ApiError('Give your booking a title of up to 160 characters.', 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) throw new ApiError('Choose a valid date.', 400)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.end)) throw new ApiError('Choose a valid start and end time.', 400)
  if (timeToMinutes(booking.end) <= timeToMinutes(booking.start)) throw new ApiError('End time needs to be after the start time.', 400)
  const rooms = load<Room[]>('rooms', [])
  const room = rooms.find((item) => item.id === booking.roomId)
  if (!room) throw new ApiError('Choose an available room.', 400)
  if (!Number.isInteger(booking.attendees) || booking.attendees < 1) throw new ApiError('Add at least one attendee.', 400)
  if (booking.attendees > room.capacity) throw new ApiError(`This room fits up to ${room.capacity} people.`, 400)
  if (booking.notes.length > 2000) throw new ApiError('Notes can be up to 2,000 characters.', 400)
  if (booking.status !== 'confirmed' && booking.status !== 'tentative') throw new ApiError('Choose a valid booking status.', 400)
  const employees = load<Employee[]>('employees', [])
  const users = load<StoredUser[]>('users', [])
  if (!employees.some((item) => item.id === booking.organizerId) && !users.some((item) => item.id === booking.organizerId)) throw new ApiError('Choose a valid organizer.', 400)
  const duplicate = bookings.some((item) => item.id !== editingId && item.status !== 'cancelled' && item.roomId === booking.roomId && item.date === booking.date && timeToMinutes(booking.start) < timeToMinutes(item.end) && timeToMinutes(booking.end) > timeToMinutes(item.start))
  if (duplicate) throw new ApiError('That room is already booked during this time.', 400)
}

function normalizeBooking(input: Omit<Booking, 'id'> & { id?: string }, id: string, status: BookingStatus): Booking {
  return {
    id,
    roomId: input.roomId,
    title: input.title.trim(),
    organizerId: input.organizerId,
    date: input.date,
    start: input.start,
    end: input.end,
    attendees: Number(input.attendees),
    status,
    notes: input.notes.trim(),
  }
}

export async function getCurrentUser() {
  ensureInitialized()
  const session = currentSession()
  if (!session) return null
  const user = load<StoredUser[]>('users', []).find((item) => item.id === session.userId)
  return user ? publicUser(user) : null
}

export async function login(email: string, password: string) {
  ensureInitialized()
  const users = load<StoredUser[]>('users', [])
  const user = users.find((item) => item.email === email.trim().toLowerCase())
  const valid = user ? (await hashPassword(password, user.salt)) === user.hash : false
  if (!user || !valid) throw new AuthError('Email or password is incorrect.', 401)
  save('session', { token: crypto.randomUUID(), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS })
  return publicUser(user)
}

export async function register(name: string, email: string, password: string) {
  ensureInitialized()
  const cleanedName = name.trim()
  const cleanedEmail = email.trim().toLowerCase()
  if (cleanedName.length < 2 || cleanedName.length > 80) throw new AuthError('Enter a name between 2 and 80 characters.', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) throw new AuthError('Enter a valid email address.', 400)
  if (password.length < 8 || password.length > 128) throw new AuthError('Use a password between 8 and 128 characters.', 400)
  const users = load<StoredUser[]>('users', [])
  if (users.some((user) => user.email === cleanedEmail)) throw new AuthError('An account with that email already exists.', 409)
  const salt = crypto.randomUUID()
  const user: StoredUser = {
    id: `user-${crypto.randomUUID()}`,
    name: cleanedName,
    email: cleanedEmail,
    role: 'Workspace member',
    initials: initials(cleanedName),
    color: colors[users.length % colors.length],
    salt,
    hash: await hashPassword(password, salt),
  }
  save('users', [...users, user])
  save('session', { token: crypto.randomUUID(), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS })
  return publicUser(user)
}

export async function updateProfile(name: string, color: string) {
  ensureInitialized()
  const current = requireUser()
  const cleanedName = name.trim()
  if (cleanedName.length < 2 || cleanedName.length > 80) throw new AuthError('Enter a name between 2 and 80 characters.', 400)
  if (!colors.includes(color)) throw new AuthError('Choose a valid profile color.', 400)
  const users = load<StoredUser[]>('users', [])
  const index = users.findIndex((user) => user.id === current.id)
  if (index === -1) throw new AuthError('Account not found.', 404)
  const updated = { ...users[index], name: cleanedName, initials: initials(cleanedName), color }
  users[index] = updated
  save('users', users)
  return publicUser(updated)
}

export async function logout() {
  localStorage.removeItem(STORAGE_PREFIX + 'session')
}

export async function getAppData(): Promise<AppData> {
  ensureInitialized()
  const user = requireUser()
  const employees = load<Employee[]>('employees', [])
  if (!employees.some((employee) => employee.id === user.id)) {
    employees.push({ id: user.id, name: user.name, role: user.role, initials: user.initials, color: user.color })
  }
  return { rooms: load<Room[]>('rooms', []), employees, bookings: load<Booking[]>('bookings', []) }
}

export async function createBooking(input: Omit<Booking, 'id'>) {
  ensureInitialized()
  requireUser()
  const bookings = load<Booking[]>('bookings', [])
  const status: BookingStatus = input.status === 'tentative' ? 'tentative' : 'confirmed'
  const booking = normalizeBooking(input, `booking-${crypto.randomUUID()}`, status)
  validateBooking(booking, bookings, null)
  save('bookings', [...bookings, booking])
  return booking
}

export async function updateBooking(id: string, input: Omit<Booking, 'id'>) {
  ensureInitialized()
  requireUser()
  const bookings = load<Booking[]>('bookings', [])
  const index = bookings.findIndex((booking) => booking.id === id)
  if (index === -1) throw new ApiError('Booking not found.', 404)
  const status: BookingStatus = input.status === 'tentative' || input.status === 'confirmed' ? input.status : 'confirmed'
  const booking = normalizeBooking(input, id, status)
  validateBooking(booking, bookings, id)
  bookings[index] = booking
  save('bookings', bookings)
  return booking
}

export async function cancelBooking(id: string) {
  ensureInitialized()
  requireUser()
  const bookings = load<Booking[]>('bookings', [])
  const index = bookings.findIndex((booking) => booking.id === id)
  if (index === -1) throw new ApiError('Booking not found.', 404)
  bookings[index] = { ...bookings[index], status: 'cancelled' }
  save('bookings', bookings)
  return bookings[index]
}
