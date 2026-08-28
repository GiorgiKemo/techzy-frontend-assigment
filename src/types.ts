export type RoomType = 'Meeting' | 'Workshop' | 'Focus'
export type BookingStatus = 'confirmed' | 'tentative' | 'cancelled'

export interface Room {
  id: string
  name: string
  floor: string
  location: string
  capacity: number
  type: RoomType
  amenities: string[]
  color: string
}

export interface Employee {
  id: string
  name: string
  role: string
  initials: string
  color: string
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  initials: string
  color: string
  emailVerified?: boolean
}

export interface Booking {
  id: string
  roomId: string
  title: string
  organizerId: string
  date: string
  start: string
  end: string
  attendees: number
  status: BookingStatus
  notes: string
}

export interface AppData {
  rooms: Room[]
  employees: Employee[]
  bookings: Booking[]
}

export type ViewName = 'dashboard' | 'rooms' | 'schedule' | 'bookings'
