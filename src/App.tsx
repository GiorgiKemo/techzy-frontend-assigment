import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  ArrowDownIcon, ArrowUpIcon, BoardIcon, BookIcon, CalendarIcon, CheckIcon, ChevronDownIcon,
  ChevronLeftIcon, ChevronRightIcon, ClockIcon, CloseIcon, DoorIcon, EditIcon, GridIcon,
  LogOutIcon, MapPinIcon, MenuIcon, MonitorIcon, MoreIcon, PlusIcon, SearchIcon, SlidersIcon, SparkleIcon,
  TrashIcon, UsersIcon, VideoIcon,
} from './lib/icons'
import { addDays, formatDate, formatTime, getTodayDate, getWeekDates, isUpcoming, parseDate, timeToMinutes } from './lib/date'
import { cancelBooking as cancelBookingRequest, createBooking, getAppData, updateBooking } from './services/data'
import { getCurrentUser, login, logout, register, updateProfile } from './services/auth'
import type { AppData, AuthUser, Booking, BookingStatus, Room, ViewName } from './types'

const HOURS = Array.from({ length: 10 }, (_, index) => 8 + index)
const NAV_ITEMS: { id: ViewName; label: string; icon: typeof GridIcon }[] = [
  { id: 'dashboard', label: 'Overview', icon: GridIcon },
  { id: 'rooms', label: 'Rooms', icon: DoorIcon },
  { id: 'schedule', label: 'Schedule', icon: CalendarIcon },
  { id: 'bookings', label: 'Bookings', icon: BookIcon },
]

type BookingForm = Omit<Booking, 'id' | 'status'> & { status: BookingStatus }

const defaultForm: BookingForm = {
  roomId: 'room-atlas',
  title: '',
  organizerId: 'nino-chkheidze',
  date: getTodayDate(),
  start: '09:00',
  end: '10:00',
  attendees: 2,
  status: 'confirmed',
  notes: '',
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [data, setData] = useState<AppData | null>(null)
  const [appError, setAppError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<ViewName>(getViewFromUrl)
  const [selectedDate, setSelectedDate] = useState(getDateFromUrl)
  const [isBookingModalOpen, setBookingModalOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [prefilledRoomId, setPrefilledRoomId] = useState<string | undefined>()
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [isProfileModalOpen, setProfileModalOpen] = useState(false)

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!user) {
      setData(null)
      return
    }
    setAppError(null)
    getAppData().then(setData).catch((error) => setAppError(error instanceof Error ? error.message : 'We could not load your workspace.'))
  }, [user])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('view', activeView)
    params.set('date', selectedDate)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [activeView, selectedDate])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!workspaceOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest('.workspace-menu')) setWorkspaceOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWorkspaceOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [workspaceOpen])

  useEffect(() => {
    const hasOverlay = isBookingModalOpen || Boolean(selectedBooking) || Boolean(cancelBooking) || isProfileModalOpen
    if (!hasOverlay) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (cancelBooking) setCancelBooking(null)
      else if (isBookingModalOpen) setBookingModalOpen(false)
      else if (isProfileModalOpen) setProfileModalOpen(false)
      else setSelectedBooking(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [cancelBooking, isBookingModalOpen, selectedBooking])

  if (authLoading) return <div className="loading-screen"><div className="loading-mark">L</div><span>Checking your session…</span></div>
  if (!user) return <AuthScreen onAuthenticated={setUser} />
  if (appError) return <ErrorState message={appError} onRetry={() => { setAppError(null); getAppData().then(setData).catch((error) => setAppError(error instanceof Error ? error.message : 'We could not load your workspace.')) }} onLogout={() => logout().finally(() => { setUser(null); setData(null) })} />
  if (!data) return <div className="loading-screen"><div className="loading-mark">L</div><span>Loading your workspace…</span></div>

  const upcomingBookingCount = data.bookings.filter((booking) => booking.status !== 'cancelled' && isUpcoming(booking.date, booking.start)).length

  const navigate = (view: ViewName) => {
    setActiveView(view)
    setSidebarOpen(false)
    setWorkspaceOpen(false)
  }

  const openNewBooking = (roomId?: string, date = selectedDate) => {
    setEditingBooking(null)
    setPrefilledRoomId(roomId)
    setSelectedDate(date)
    setBookingModalOpen(true)
  }

  const openEditBooking = (booking: Booking) => {
    setSelectedBooking(null)
    setEditingBooking(booking)
    setPrefilledRoomId(undefined)
    setBookingModalOpen(true)
  }

  const handleSaveBooking = async (form: BookingForm): Promise<string | null> => {
    const cleanedForm = { ...form, title: form.title.trim(), notes: form.notes.trim(), attendees: Number(form.attendees) }
    const room = data.rooms.find((item) => item.id === cleanedForm.roomId)
    if (room && cleanedForm.attendees > room.capacity) return `This room fits up to ${room.capacity} people.`
    const duplicate = data.bookings.some((booking) => (
      booking.id !== editingBooking?.id && booking.status !== 'cancelled' && booking.roomId === cleanedForm.roomId && booking.date === cleanedForm.date &&
      timeToMinutes(cleanedForm.start) < timeToMinutes(booking.end) && timeToMinutes(cleanedForm.end) > timeToMinutes(booking.start)
    ))
    if (duplicate) return 'That room is already booked during this time.'
    try {
      const saved = editingBooking ? await updateBooking(editingBooking.id, cleanedForm) : await createBooking(cleanedForm)
      const nextBookings = editingBooking
        ? data.bookings.map((booking) => booking.id === saved.id ? saved : booking)
        : [...data.bookings, saved]
      setData({ ...data, bookings: nextBookings })
      setBookingModalOpen(false)
      setToast(editingBooking ? 'Booking updated' : 'Booking created')
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'The booking could not be saved.'
    }
  }

  const handleCancelBooking = async () => {
    if (!cancelBooking) return
    try {
      const cancelled = await cancelBookingRequest(cancelBooking.id)
      setData({ ...data, bookings: data.bookings.map((booking) => booking.id === cancelled.id ? cancelled : booking) })
      setCancelBooking(null)
      setSelectedBooking(null)
      setToast('Booking cancelled')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The booking could not be cancelled.')
    }
  }

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    setUser(null)
    setData(null)
  }

  const handleSaveProfile = async (name: string, color: string): Promise<string | null> => {
    try {
      const updatedUser = await updateProfile(name, color)
      setUser(updatedUser)
      setData((current) => current ? { ...current, employees: current.employees.map((employee) => employee.id === updatedUser.id ? { ...employee, name: updatedUser.name, initials: updatedUser.initials, color: updatedUser.color } : employee) } : current)
      setProfileModalOpen(false)
      setToast('Profile updated')
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Your profile could not be updated.'
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <button type="button" className="brand-lockup" aria-label="Go to Overview" onClick={() => navigate('dashboard')}>
          <div className="brand-mark">L</div>
          <div><strong>loop</strong><span>workplace</span></div>
        </button>
        <div className="workspace-menu">
          <button type="button" className="workspace-switcher" aria-haspopup="menu" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen((open) => !open)}>
            <div className="workspace-avatar">AC</div>
            <div><span className="eyebrow">Workspace</span><strong>Kartuli Labs</strong></div>
            <ChevronDownIcon size={15} />
          </button>
          {workspaceOpen && <div className="workspace-dropdown" role="menu" aria-label="Workspaces">
            <button type="button" className="workspace-option" role="menuitem" onClick={() => { setWorkspaceOpen(false); setToast('Kartuli Labs is already selected') }}>
              <span className="workspace-option-avatar">AC</span>
              <span><strong>Kartuli Labs</strong><small>Active workspace</small></span>
              <CheckIcon size={15} />
            </button>
            <div className="workspace-dropdown-note">You have access to 1 workspace</div>
          </div>}
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <span className="nav-label">Manage</span>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={18} /><span>{label}</span>{id === 'bookings' && <span className="nav-count">{upcomingBookingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><SparkleIcon size={17} /><div><strong>Room tip</strong><span>Narikala is free all afternoon.</span></div></div>
        <button type="button" className="sidebar-profile" onClick={handleLogout}><div className="avatar avatar-nia" style={{ background: user.color }}>{user.initials}</div><div><strong>{user.name}</strong><span>{user.role}</span></div><LogOutIcon size={16} /></button>
      </aside>
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><MenuIcon /></button>
          <div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{NAV_ITEMS.find((item) => item.id === activeView)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="topbar-search" onClick={() => navigate('bookings')}><SearchIcon size={17} /><span>Search bookings</span><kbd>⌘ K</kbd></button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('You are all caught up')}><span className="notification-dot" /><SparkleIcon size={18} /></button>
            <button type="button" className="topbar-avatar profile-trigger" style={{ background: user.color }} aria-label="Open profile settings" onClick={() => setProfileModalOpen(true)}>{user.initials}</button>
          </div>
        </header>
        <div className="page-content">
          {activeView === 'dashboard' && <Dashboard data={data} user={user} selectedDate={selectedDate} onNavigate={navigate} onCreate={() => openNewBooking()} onSelectBooking={setSelectedBooking} />}
          {activeView === 'rooms' && <RoomsPage data={data} selectedDate={selectedDate} onCreate={openNewBooking} onSelectBooking={setSelectedBooking} />}
          {activeView === 'schedule' && <SchedulePage data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onCreate={openNewBooking} onSelectBooking={setSelectedBooking} />}
          {activeView === 'bookings' && <BookingsPage data={data} onCreate={() => openNewBooking()} onSelectBooking={setSelectedBooking} onEdit={openEditBooking} onCancel={setCancelBooking} />}
        </div>
      </main>
      {isBookingModalOpen && <BookingModal data={data} currentUserId={user.id} initialBooking={editingBooking} roomId={prefilledRoomId} selectedDate={selectedDate} onClose={() => setBookingModalOpen(false)} onSave={handleSaveBooking} />}
      {isProfileModalOpen && <ProfileModal user={user} onClose={() => setProfileModalOpen(false)} onSave={handleSaveProfile} />}
      {selectedBooking && <BookingDetails booking={selectedBooking} data={data} onClose={() => setSelectedBooking(null)} onEdit={() => openEditBooking(selectedBooking)} onCancel={() => setCancelBooking(selectedBooking)} />}
      {cancelBooking && <CancelModal booking={cancelBooking} onClose={() => setCancelBooking(null)} onConfirm={handleCancelBooking} />}
      {toast && <div className="toast"><div className="toast-check"><CheckIcon size={15} /></div>{toast}</div>}
    </div>
  )
}

function Dashboard({ data, user, selectedDate, onNavigate, onCreate, onSelectBooking }: { data: AppData; user: AuthUser; selectedDate: string; onNavigate: (view: ViewName) => void; onCreate: () => void; onSelectBooking: (booking: Booking) => void }) {
  const dayBookings = data.bookings.filter((booking) => booking.date === selectedDate && booking.status !== 'cancelled').sort(sortBookings)
  const weekDates = new Set(getWeekDates(selectedDate))
  const confirmedCount = data.bookings.filter((booking) => booking.status === 'confirmed' && weekDates.has(booking.date)).length
  const availableRooms = data.rooms.filter((room) => !dayBookings.some((booking) => booking.roomId === room.id && timeToMinutes(booking.start) <= 720 && timeToMinutes(booking.end) > 720)).length
  const totalHours = data.bookings.filter((booking) => booking.status !== 'cancelled' && weekDates.has(booking.date)).reduce((sum, booking) => sum + (timeToMinutes(booking.end) - timeToMinutes(booking.start)) / 60, 0)
  const utilization = Math.round((totalHours / (data.rooms.length * 8 * 5)) * 100)

  return <>
    <div className="page-heading dashboard-heading">
      <div><span className="overline">{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span><h1>Good morning, {user.name.split(' ')[0]} <span className="heading-sun">✦</span></h1><p>Here’s the pulse of your workplace today.</p></div>
      <button className="button button-primary" onClick={onCreate}><PlusIcon size={17} /> New booking</button>
    </div>
    <div className="metric-grid">
      <MetricCard label="Rooms available now" value={String(availableRooms).padStart(2, '0')} detail="of 08 total rooms" trend="+2" trendLabel="vs yesterday" icon={<DoorIcon size={19} />} />
      <MetricCard label="Bookings this week" value={String(confirmedCount).padStart(2, '0')} detail="confirmed meetings" trend="+12%" trendLabel="vs last week" icon={<CalendarIcon size={19} />} />
      <MetricCard label="Space utilization" value={`${utilization}%`} detail="weekly average" trend="+4.8%" trendLabel="vs last week" icon={<ArrowUpIcon size={18} />} />
    </div>
    <div className="dashboard-grid">
      <section className="panel schedule-panel">
        <div className="panel-heading"><div><span className="overline">Your calendar</span><h2>Today’s flow</h2></div><button className="text-button" onClick={() => onNavigate('schedule')}>View schedule <ChevronRightIcon size={15} /></button></div>
        <div className="flow-list">
          {dayBookings.slice(0, 4).map((booking, index) => {
            const room = data.rooms.find((item) => item.id === booking.roomId)
            const organizer = data.employees.find((item) => item.id === booking.organizerId)
            return <button className="flow-row" key={booking.id} onClick={() => onSelectBooking(booking)}>
              <span className={`flow-time ${index === 0 ? 'current' : ''}`}><strong>{formatTime(booking.start)}</strong><small>{formatTime(booking.end)}</small></span>
              <span className="flow-line"><i /></span>
              <span className="flow-content"><strong>{booking.title}</strong><span>{room?.name} · {organizer?.name}</span></span>
              <span className="flow-status"><span className={`status-dot ${booking.status}`} />{booking.status}</span>
            </button>
          })}
          {dayBookings.length === 0 && <EmptyState title="A clear calendar" body="You have no bookings scheduled for today." />}
        </div>
        <button className="panel-footer-button" onClick={() => onNavigate('schedule')}>Open full schedule <ArrowUpIcon size={15} /></button>
      </section>
      <section className="panel pulse-panel">
        <div className="panel-heading"><div><span className="overline">Live view</span><h2>Room pulse</h2></div><button className="icon-button" onClick={() => onNavigate('rooms')} aria-label="View rooms"><MoreIcon size={18} /></button></div>
        <div className="pulse-visual"><div className="pulse-ring"><strong>{availableRooms}</strong><span>free now</span></div><div className="pulse-legend"><span><i className="legend-free" />Available <b>{availableRooms}</b></span><span><i className="legend-busy" />In use <b>{data.rooms.length - availableRooms}</b></span></div></div>
        <div className="pulse-list">{data.rooms.slice(0, 4).map((room) => { const busy = dayBookings.some((booking) => booking.roomId === room.id && timeToMinutes(booking.start) <= 720 && timeToMinutes(booking.end) > 720); return <div key={room.id} className="pulse-row"><span className="room-color" style={{ background: room.color }} /><strong>{room.name}</strong><span className={busy ? 'room-busy' : 'room-free'}>{busy ? 'In use' : 'Available'}</span><span className="room-capacity"><UsersIcon size={13} /> {room.capacity}</span></div> })}</div>
      </section>
      <section className="panel insight-panel"><div className="insight-icon"><SparkleIcon size={18} /></div><div><span className="overline">Workspace insight</span><h3>Friday is your busiest day</h3><p>Rooms are 82% booked between 10:00 and 14:00. Consider getting a room on the calendar early.</p><button className="text-button" onClick={() => onNavigate('schedule')}>See this week <ChevronRightIcon size={15} /></button></div></section>
    </div>
  </>
}

function MetricCard({ label, value, detail, trend, trendLabel, icon }: { label: string; value: string; detail: string; trend: string; trendLabel: string; icon: ReactNode }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon">{icon}</div></div><div className="metric-value-row"><strong>{value}</strong><span>{detail}</span></div><div className="metric-trend"><span className="trend-up"><ArrowUpIcon size={13} /> {trend}</span><span>{trendLabel}</span></div></div>
}

function RoomsPage({ data, selectedDate, onCreate, onSelectBooking }: { data: AppData; selectedDate: string; onCreate: (roomId?: string, date?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'All types' | Room['type']>('All types')
  const [capacity, setCapacity] = useState('Any capacity')
  const [location, setLocation] = useState('All locations')
  const locations = useMemo(() => ['All locations', ...Array.from(new Set(data.rooms.map((room) => room.location)))], [data.rooms])
  const filteredRooms = data.rooms.filter((room) => {
    const matchesQuery = `${room.name} ${room.floor} ${room.location} ${room.amenities.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesType = type === 'All types' || room.type === type
    const matchesCapacity = capacity === 'Any capacity' || room.capacity >= Number(capacity)
    const matchesLocation = location === 'All locations' || room.location === location
    return matchesQuery && matchesType && matchesCapacity && matchesLocation
  })

  return <>
    <div className="page-heading"><div><span className="overline">Workspace directory</span><h1>Rooms</h1><p>Find the right space for the work ahead.</p></div><button className="button button-primary" onClick={() => onCreate()}><PlusIcon size={17} /> New booking</button></div>
    <div className="filter-bar"><label className="search-field"><SearchIcon size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by room, floor or amenity" /></label><FilterSelect value={type} onChange={(value) => setType(value as typeof type)} options={['All types', 'Meeting', 'Workshop', 'Focus']} /><FilterSelect value={capacity} onChange={setCapacity} options={['Any capacity', '2', '6', '10', '14']} /><FilterSelect value={location} onChange={setLocation} options={locations} /></div>
    <div className="room-summary"><span><strong>{filteredRooms.length}</strong> rooms</span><span className="summary-divider" /><span className="availability-key"><i className="legend-free" /> Available right now</span><span className="availability-key"><i className="legend-busy" /> In use</span></div>
    <div className="room-grid">{filteredRooms.map((room) => <RoomCard key={room.id} room={room} bookings={data.bookings} selectedDate={selectedDate} onCreate={onCreate} onSelectBooking={onSelectBooking} />)}</div>
    {filteredRooms.length === 0 && <EmptyState title="No rooms match those filters" body="Try widening your search or choosing a different room type." />}
  </>
}

function RoomCard({ room, bookings, selectedDate, onCreate, onSelectBooking }: { room: Room; bookings: Booking[]; selectedDate: string; onCreate: (roomId?: string, date?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  const booking = bookings.find((item) => item.roomId === room.id && item.date === selectedDate && item.status !== 'cancelled' && timeToMinutes(item.start) <= 720 && timeToMinutes(item.end) > 720)
  const nextBooking = bookings.filter((item) => item.roomId === room.id && item.date === selectedDate && item.status !== 'cancelled' && timeToMinutes(item.start) > 720).sort(sortBookings)[0]
  return <article className="room-card"><div className="room-card-top" style={{ background: room.color }}><span className={`room-status ${booking ? 'busy' : 'available'}`}><i />{booking ? 'In use' : 'Available'}</span><div className="room-illustration"><DoorIcon size={32} /></div></div><div className="room-card-body"><div className="room-title-row"><div><h3>{room.name}</h3><span><MapPinIcon size={13} /> {room.floor} · {room.location}</span></div><span className="capacity-pill"><UsersIcon size={13} /> {room.capacity}</span></div><div className="amenity-list">{room.amenities.slice(0, 3).map((amenity) => <span key={amenity}>{amenity}</span>)}</div><div className="room-card-footer">{booking ? <button className="next-booking" onClick={() => onSelectBooking(booking)}><span>Until {formatTime(booking.end)}</span><strong>{booking.title}</strong></button> : nextBooking ? <div className="next-booking"><span>Next · {formatTime(nextBooking.start)}</span><strong>{nextBooking.title}</strong></div> : <div className="next-booking"><span>Open schedule</span><strong>Free for the rest of today</strong></div>}<button className="small-book-button" onClick={() => onCreate(room.id, selectedDate)}><PlusIcon size={15} /> Book</button></div></div></article>
}

function SchedulePage({ data, selectedDate, setSelectedDate, onCreate, onSelectBooking }: { data: AppData; selectedDate: string; setSelectedDate: (date: string) => void; onCreate: (roomId?: string, date?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [roomFilter, setRoomFilter] = useState('All rooms')
  const scheduleBookings = data.bookings.filter((booking) => booking.status !== 'cancelled' && (roomFilter === 'All rooms' || booking.roomId === roomFilter))
  const displayedRooms = roomFilter === 'All rooms' ? data.rooms : data.rooms.filter((room) => room.id === roomFilter)
  const weekDates = getWeekDates(selectedDate)
  return <>
    <div className="page-heading schedule-heading"><div><span className="overline">Plan your week</span><h1>Schedule</h1><p>See what’s happening across every room.</p></div><button className="button button-primary" onClick={() => onCreate(undefined, selectedDate)}><PlusIcon size={17} /> New booking</button></div>
    <div className="schedule-toolbar"><div className="view-toggle"><button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>Day</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Week</button></div><div className="date-switcher"><button onClick={() => setSelectedDate(addDays(selectedDate, mode === 'week' ? -7 : -1))} aria-label="Previous date"><ChevronLeftIcon size={17} /></button><strong>{mode === 'day' ? formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' }) : `${formatDate(weekDates[0], { month: 'short', day: 'numeric' })} – ${formatDate(weekDates[6], { month: 'short', day: 'numeric', year: 'numeric' })}`}</strong><button onClick={() => setSelectedDate(addDays(selectedDate, mode === 'week' ? 7 : 1))} aria-label="Next date"><ChevronRightIcon size={17} /></button><button className="today-button" onClick={() => setSelectedDate(getTodayDate())}>Today</button></div><FilterSelect value={roomFilter} onChange={setRoomFilter} options={['All rooms', ...data.rooms.map((room) => room.id)]} labels={['All rooms', ...data.rooms.map((room) => room.name)]} /></div>
    {mode === 'day' ? <DaySchedule rooms={displayedRooms} bookings={scheduleBookings.filter((booking) => booking.date === selectedDate)} onCreate={onCreate} onSelectBooking={onSelectBooking} /> : <WeekSchedule dates={weekDates} rooms={data.rooms} bookings={scheduleBookings} onSelectBooking={onSelectBooking} />}
  </>
}

function DaySchedule({ rooms, bookings, onCreate, onSelectBooking }: { rooms: Room[]; bookings: Booking[]; onCreate: (roomId?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  return <section className="schedule-card"><div className="schedule-date-note"><span className="live-indicator"><i /> Live schedule</span><span>{bookings.length} bookings · 8:00 AM – 6:00 PM</span></div><div className="timeline"><div className="timeline-header"><div className="timeline-room-label">Room</div><div className="timeline-hours">{HOURS.map((hour) => <span key={hour}>{formatTime(`${String(hour).padStart(2, '0')}:00`)}</span>)}</div></div>{rooms.map((room) => <div className="timeline-row" key={room.id}><div className="timeline-room-label"><span className="room-color" style={{ background: room.color }} /><div><strong>{room.name}</strong><small>{room.capacity} seats</small></div></div><div className="timeline-track">{HOURS.map((hour) => <i key={hour} />)}{bookings.filter((booking) => booking.roomId === room.id).map((booking) => <button key={booking.id} className={`timeline-booking ${booking.status}`} onClick={() => onSelectBooking(booking)} style={bookingStyle(booking)}><strong>{booking.title}</strong><span>{formatTime(booking.start)} – {formatTime(booking.end)}</span></button>)}{bookings.every((booking) => booking.roomId !== room.id) && <button className="track-empty" onClick={() => onCreate(room.id)}>+ Add booking</button>}</div></div>)}</div></section>
}

function WeekSchedule({ dates, rooms, bookings, onSelectBooking }: { dates: string[]; rooms: Room[]; bookings: Booking[]; onSelectBooking: (booking: Booking) => void }) {
  return <section className="week-schedule-card"><div className="week-header"><div className="week-label">Week view</div>{dates.map((date) => <div className={`week-day-label ${date === getTodayDate() ? 'today' : ''}`} key={date}><span>{formatDate(date, { weekday: 'short' })}</span><strong>{formatDate(date, { day: 'numeric' })}</strong></div>)}</div><div className="week-body"><div className="week-room-list">{rooms.map((room) => <div className="week-room-label" key={room.id}><span className="room-color" style={{ background: room.color }} />{room.name}</div>)}</div><div className="week-columns">{dates.map((date) => <div className="week-column" key={date}>{rooms.map((room) => <div className="week-slot" key={room.id}>{bookings.filter((booking) => booking.date === date && booking.roomId === room.id).map((booking) => <button className={`week-booking ${booking.status}`} key={booking.id} onClick={() => onSelectBooking(booking)}><strong>{booking.title}</strong><span>{formatTime(booking.start)}</span></button>)}</div>)}</div>)}</div></div></section>
}

function BookingsPage({ data, onCreate, onSelectBooking, onEdit, onCancel }: { data: AppData; onCreate: () => void; onSelectBooking: (booking: Booking) => void; onEdit: (booking: Booking) => void; onCancel: (booking: Booking) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All bookings' | 'Upcoming' | 'Past' | 'Cancelled'>('All bookings')
  const [sortDescending, setSortDescending] = useState(false)
  const filtered = data.bookings.filter((booking) => {
    const room = data.rooms.find((item) => item.id === booking.roomId)
    const organizer = data.employees.find((item) => item.id === booking.organizerId)
    const matchesQuery = `${booking.title} ${room?.name} ${organizer?.name}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'All bookings' || (status === 'Upcoming' && booking.status !== 'cancelled' && isUpcoming(booking.date, booking.start)) || (status === 'Past' && booking.date < getTodayDate()) || (status === 'Cancelled' && booking.status === 'cancelled')
    return matchesQuery && matchesStatus
  }).sort((a, b) => sortDescending ? sortBookings(b, a) : sortBookings(a, b))
  return <>
    <div className="page-heading"><div><span className="overline">Everything in one place</span><h1>Bookings</h1><p>Manage upcoming meetings and keep the day moving.</p></div><button className="button button-primary" onClick={onCreate}><PlusIcon size={17} /> New booking</button></div>
    <div className="filter-bar booking-filter-bar"><label className="search-field"><SearchIcon size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bookings, rooms or people" /></label><FilterSelect value={status} onChange={(value) => setStatus(value as typeof status)} options={['All bookings', 'Upcoming', 'Past', 'Cancelled']} /><span className="filter-results">{filtered.length} results</span></div>
    <section className="bookings-panel"><div className="bookings-table-head"><span>Booking</span><span>Room</span><span>Date & time</span><span>Organizer</span><span>Status</span><span /></div>{filtered.map((booking) => { const room = data.rooms.find((item) => item.id === booking.roomId)!; const organizer = data.employees.find((item) => item.id === booking.organizerId)!; return <div className="booking-row" key={booking.id}><button className="booking-main" onClick={() => onSelectBooking(booking)}><span className="booking-color" style={{ background: room.color }} /><span><strong>{booking.title}</strong><small>{booking.attendees} attendees</small></span></button><div className="booking-room"><span className="room-color" style={{ background: room.color }} />{room.name}</div><div className="booking-date"><strong>{formatDate(booking.date, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span>{formatTime(booking.start)} – {formatTime(booking.end)}</span></div><div className="booking-organizer"><span className="mini-avatar" style={{ background: organizer.color }}>{organizer.initials}</span>{organizer.name}</div><div><span className={`booking-status ${booking.status}`}>{booking.status}</span></div><div className="row-actions"><button onClick={() => onEdit(booking)} aria-label={`Edit ${booking.title}`}><EditIcon size={16} /></button>{booking.status !== 'cancelled' && <button onClick={() => onCancel(booking)} aria-label={`Cancel ${booking.title}`}><TrashIcon size={16} /></button>}<button onClick={() => onSelectBooking(booking)} aria-label={`View ${booking.title}`}><MoreIcon size={17} /></button></div></div>})}{filtered.length === 0 && <EmptyState title="No bookings found" body="Try another search or create a new booking." />}</section>
    <div className="table-footnote"><span><span className="green-dot" /> Changes are saved automatically</span><button className="sort-button" onClick={() => setSortDescending(!sortDescending)}>{sortDescending ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />} Sort by date</button></div>
  </>
}

function BookingDetails({ booking, data, onClose, onEdit, onCancel }: { booking: Booking; data: AppData; onClose: () => void; onEdit: () => void; onCancel: () => void }) {
  const room = data.rooms.find((item) => item.id === booking.roomId)!
  const organizer = data.employees.find((item) => item.id === booking.organizerId)!
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="details-drawer"><div className="drawer-top" style={{ background: room.color }}><button className="icon-button drawer-close" onClick={onClose} aria-label="Close booking details"><CloseIcon size={18} /></button><span className="drawer-room-label"><DoorIcon size={15} /> {room.name}</span><div className="drawer-symbol"><CalendarIcon size={42} /></div></div><div className="drawer-content"><div className="drawer-heading"><div><span className={`booking-status ${booking.status}`}>{booking.status}</span><h2>{booking.title}</h2></div></div><div className="detail-list"><DetailItem icon={<CalendarIcon size={17} />} label="When" value={`${formatDate(booking.date, { weekday: 'long', month: 'long', day: 'numeric' })} · ${formatTime(booking.start)} – ${formatTime(booking.end)}`} /><DetailItem icon={<MapPinIcon size={17} />} label="Where" value={`${room.name}, ${room.floor}`} /><DetailItem icon={<UsersIcon size={17} />} label="Attendees" value={`${booking.attendees} people`} /><DetailItem icon={<UsersIcon size={17} />} label="Organizer" value={organizer.name} avatar={organizer} /></div>{booking.notes && <div className="notes-block"><span className="overline">Notes</span><p>{booking.notes}</p></div>}<div className="drawer-actions"><button className="button button-secondary" onClick={onEdit}><EditIcon size={16} /> Edit booking</button>{booking.status !== 'cancelled' && <button className="button button-danger-ghost" onClick={onCancel}><TrashIcon size={16} /> Cancel</button>}</div></div></aside></div>
}

function DetailItem({ icon, label, value, avatar }: { icon: ReactNode; label: string; value: string; avatar?: { initials: string; color: string } }) { return <div className="detail-item"><span className="detail-icon">{icon}</span><span><small>{label}</small><strong>{avatar && <span className="mini-avatar" style={{ background: avatar.color }}>{avatar.initials}</span>}{value}</strong></span></div> }

function BookingModal({ data, currentUserId, initialBooking, roomId, selectedDate, onClose, onSave }: { data: AppData; currentUserId: string; initialBooking: Booking | null; roomId?: string; selectedDate: string; onClose: () => void; onSave: (form: BookingForm) => Promise<string | null> }) {
  const [form, setForm] = useState<BookingForm>(() => initialBooking ? { ...initialBooking } : { ...defaultForm, organizerId: currentUserId, roomId: roomId || defaultForm.roomId, date: selectedDate })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = <K extends keyof BookingForm>(key: K, value: BookingForm[K]) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => { event.preventDefault(); if (saving) return; if (!form.title.trim()) { setError('Give your booking a title.'); return } if (timeToMinutes(form.end) <= timeToMinutes(form.start)) { setError('End time needs to be after the start time.'); return } setSaving(true); setError(''); const saveError = await onSave({ ...form, attendees: Number(form.attendees) }); setSaving(false); if (saveError) setError(saveError) }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}><div className="booking-modal"><div className="modal-header"><div><span className="overline">{initialBooking ? 'Update the details' : 'Add to the calendar'}</span><h2>{initialBooking ? 'Edit booking' : 'New booking'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close" disabled={saving}><CloseIcon /></button></div><form onSubmit={submit}><div className="form-grid"><label className="form-field full"><span>What’s happening?</span><input autoFocus value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Product planning" /></label><label className="form-field"><span>Date</span><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></label><label className="form-field"><span>Room</span><select value={form.roomId} onChange={(event) => update('roomId', event.target.value)}>{data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.capacity} seats</option>)}</select></label><label className="form-field"><span>Starts</span><input type="time" value={form.start} onChange={(event) => update('start', event.target.value)} /></label><label className="form-field"><span>Ends</span><input type="time" value={form.end} onChange={(event) => update('end', event.target.value)} /></label><label className="form-field"><span>Organizer</span><select value={form.organizerId} onChange={(event) => update('organizerId', event.target.value)}>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="form-field"><span>Attendees</span><input type="number" min="1" max="100" value={form.attendees} onChange={(event) => update('attendees', Number(event.target.value))} /></label><label className="form-field full"><span>Notes <em>Optional</em></span><textarea rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Add context for your teammates" /></label></div>{error && <div className="form-error">{error}</div>}<div className="modal-footer"><span><span className="green-dot" /> Saved to this workspace</span><div><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : initialBooking ? 'Save changes' : 'Create booking'}</button></div></div></form></div></div>
}

function CancelModal({ booking, onClose, onConfirm }: { booking: Booking; onClose: () => void; onConfirm: () => Promise<void> }) { const [busy, setBusy] = useState(false); const confirm = async () => { if (busy) return; setBusy(true); await onConfirm(); setBusy(false) }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><div className="confirm-modal"><div className="confirm-icon"><TrashIcon size={20} /></div><h2>Cancel this booking?</h2><p><strong>{booking.title}</strong> will be removed from the room schedule. This action can’t be undone.</p><div className="confirm-actions"><button className="button button-secondary" onClick={onClose} disabled={busy}>Keep booking</button><button className="button button-danger" onClick={confirm} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel booking'}</button></div></div></div> }

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegistering = mode === 'register'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (isRegistering && password !== confirmPassword) { setError('Passwords do not match.'); return }
    setBusy(true)
    setError('')
    try {
      const user = isRegistering ? await register(name, email, password) : await login(email, password)
      onAuthenticated(user)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'We could not sign you in.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><div className="brand-mark">L</div><div><strong>loop</strong><span>workplace</span></div></div><div className="auth-copy"><span className="overline">Kartuli Labs workspace</span><h1>{isRegistering ? 'Create your account' : 'Welcome back'}</h1><p>{isRegistering ? 'Set up your account to start booking rooms.' : 'Sign in to manage your meetings and rooms.'}</p></div><form className="auth-form" onSubmit={submit}>{isRegistering && <label className="form-field"><span>Full name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nino Chkheidze" autoComplete="name" required /></label>}<label className="form-field"><span>Email address</span><input autoFocus={!isRegistering} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@kartulilabs.com" autoComplete="email" required /></label><label className="form-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={isRegistering ? 'new-password' : 'current-password'} minLength={8} required /></label>{isRegistering && <label className="form-field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" minLength={8} required /></label>}{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? (isRegistering ? 'Creating account…' : 'Signing in…') : (isRegistering ? 'Create account' : 'Sign in')}<ChevronRightIcon size={16} /></button></form><p className="auth-switch">{isRegistering ? 'Already have an account?' : 'New to Loop?'} <button type="button" onClick={() => { setMode(isRegistering ? 'login' : 'register'); setError('') }}>{isRegistering ? 'Sign in' : 'Create an account'}</button></p><p className="auth-footnote">Your session is protected with an HttpOnly cookie.</p></section></main>
}

function ErrorState({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <main className="error-shell"><div className="error-card"><div className="loading-mark">L</div><span className="overline">Kartuli Labs workspace</span><h1>We couldn’t load your workspace.</h1><p>{message}</p><div className="error-actions"><button className="button button-primary" onClick={onRetry}>Try again</button><button className="button button-secondary" onClick={onLogout}>Sign out</button></div></div></main>
}

function FilterSelect({ value, onChange, options, labels = options }: { value: string; onChange: (value: string) => void; options: string[]; labels?: string[] }) { return <label className="filter-select"><SlidersIcon size={15} /><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option, index) => <option key={option} value={option}>{labels[index]}</option>)}</select><ChevronDownIcon size={14} /></label> }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><div className="empty-icon"><CalendarIcon size={20} /></div><strong>{title}</strong><span>{body}</span></div> }
function sortBookings(a: Booking, b: Booking) { return `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`) }
function bookingStyle(booking: Booking): CSSProperties { const start = Math.max(0, timeToMinutes(booking.start) - 480); const duration = timeToMinutes(booking.end) - timeToMinutes(booking.start); return { left: `${(start / 600) * 100}%`, width: `${(duration / 600) * 100}%` } }
function getViewFromUrl(): ViewName { const view = new URLSearchParams(window.location.search).get('view'); return NAV_ITEMS.some((item) => item.id === view) ? view as ViewName : 'dashboard' }
function getDateFromUrl(): string {
  const date = new URLSearchParams(window.location.search).get('date')
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseDate(date).getTime()) ? date : getTodayDate()
}

export default App

const PROFILE_COLORS = [
  { value: '#f1d2b9', label: 'Peach' },
  { value: '#c9e5e2', label: 'Seafoam' },
  { value: '#d9c9f0', label: 'Lilac' },
  { value: '#d9e4b7', label: 'Leaf' },
  { value: '#f0cdd3', label: 'Rose' },
  { value: '#cbd9ef', label: 'Sky' },
] as const

function ProfileModal({ user, onClose, onSave }: { user: AuthUser; onClose: () => void; onSave: (name: string, color: string) => Promise<string | null> }) {
  const [name, setName] = useState(user.name)
  const [color, setColor] = useState(() => PROFILE_COLORS.some((option) => option.value === user.color) ? user.color : PROFILE_COLORS[0].value)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const previewInitials = getProfileInitials(name) || user.initials

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const cleanedName = name.trim()
    if (cleanedName.length < 2 || cleanedName.length > 80) {
      setError('Enter a name between 2 and 80 characters.')
      return
    }
    setSaving(true)
    setError('')
    const saveError = await onSave(cleanedName, color)
    setSaving(false)
    if (saveError) setError(saveError)
  }

  return <div className="modal-backdrop profile-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><div className="modal-header"><div><span className="overline">Your account</span><h2 id="profile-modal-title">Profile settings</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close profile settings" disabled={saving}><CloseIcon /></button></div><form className="profile-form" onSubmit={submit}><div className="profile-preview"><div className="profile-avatar-preview" style={{ background: color }}>{previewInitials}</div><div><strong>{name.trim() || 'Your name'}</strong><span>{user.email}</span></div></div><label className="form-field"><span>Display name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" /></label><label className="form-field"><span>Email address</span><input value={user.email} readOnly aria-describedby="profile-email-note" /><small id="profile-email-note" className="form-help">Email changes require an administrator.</small></label><fieldset className="avatar-picker"><legend>Profile icon</legend><div className="avatar-options">{PROFILE_COLORS.map((option) => <button type="button" key={option.value} className={`avatar-option ${color === option.value ? 'selected' : ''}`} style={{ background: option.value }} aria-label={`Use ${option.label} profile color`} aria-pressed={color === option.value} onClick={() => setColor(option.value)}>{previewInitials}</button>)}</div><span className="form-help">Your initials update automatically from your display name.</span></fieldset>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-footer profile-footer"><span><span className="green-dot" /> Saved securely to your profile</span><div><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div></div></form></section></div>
}

function getProfileInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}
