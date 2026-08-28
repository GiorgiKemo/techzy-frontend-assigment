export const SEED_BASE_DATE = '2025-03-18'

export function getTodayDate() {
  return formatLocalDate(new Date())
}

export function getCurrentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function greetingForNow() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function parseDate(date: string) {
  return new Date(`${date}T12:00:00`)
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = {}) {
  return parseDate(date).toLocaleDateString('en-US', options)
}

export function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date(2025, 0, 1, hours, minutes)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function getReferenceMinutes(date: string) {
  return date === getTodayDate() ? timeToMinutes(getCurrentTime()) : 12 * 60
}

export function addDays(date: string, amount: number) {
  const next = parseDate(date)
  next.setDate(next.getDate() + amount)
  return formatLocalDate(next)
}

export function daysBetween(left: string, right: string) {
  return Math.round((parseDate(left).getTime() - parseDate(right).getTime()) / 86400000)
}

export function startOfWeek(date: string) {
  const current = parseDate(date)
  const day = current.getDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

export function getWeekDates(date: string) {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function isUpcoming(date: string, start: string) {
  const today = getTodayDate()
  if (date > today) return true
  if (date < today) return false
  return timeToMinutes(start) > timeToMinutes(getCurrentTime())
}

export function isPast(date: string, end: string) {
  const today = getTodayDate()
  if (date < today) return true
  if (date > today) return false
  return timeToMinutes(end) <= timeToMinutes(getCurrentTime())
}
