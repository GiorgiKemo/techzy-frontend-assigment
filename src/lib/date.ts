export const SEED_BASE_DATE = '2025-03-18'

export function getTodayDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDate(date: string) {
  return new Date(`${date}T12:00:00`)
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

export function addDays(date: string, amount: number) {
  const next = parseDate(date)
  next.setDate(next.getDate() + amount)
  return next.toISOString().slice(0, 10)
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
  return date > today || (date === today && timeToMinutes(start) >= 0)
}
