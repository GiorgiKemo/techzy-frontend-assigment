import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  ArrowDownIcon, ArrowUpIcon, BoardIcon, BookIcon, CalendarIcon, CheckIcon, ChevronDownIcon,
  ChevronLeftIcon, ChevronRightIcon, ClockIcon, CloseIcon, DoorIcon, EditIcon, GridIcon,
  LogOutIcon, MapPinIcon, MenuIcon, MonitorIcon, MoreIcon, PlusIcon, SearchIcon, SlidersIcon, SparkleIcon,
  TrashIcon, UsersIcon, VideoIcon,
} from './lib/icons'
import { addDays, formatDate, formatTime, getReferenceMinutes, getTodayDate, getWeekDates, greetingForNow, isPast, isUpcoming, parseDate, timeToMinutes } from './lib/date'
import { ApiError, cancelBooking as cancelBookingRequest, createBooking, getAppData, updateBooking } from './services/data'
import { getCurrentUser, isUserVerified, login, logout, register, resendVerification, updateProfile, verifyEmail, forgotPassword, resetPassword } from './services/auth'
import { useLocalApi } from './services/mode'
import type { AppData, AuthUser, Booking, BookingStatus, Employee, Room, ViewName } from './types'

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
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verifyToken = params.get('verify')
    const resetToken = params.get('reset')
    if (!verifyToken && !resetToken) return
    params.delete('verify')
    params.delete('reset')
    const nextSearch = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`)
    if (verifyToken) {
      verifyEmail(verifyToken)
        .then((verifiedUser) => {
          setUser(verifiedUser)
          setAuthNotice('Your email is verified. Welcome to Loop.')
        })
        .catch((error) => setAuthNotice(error instanceof Error ? error.message : 'Verification failed.'))
      return
    }
    if (resetToken) {
      logout().catch(() => undefined).finally(() => {
        setUser(null)
        setAuthNotice(`reset:${resetToken}`)
      })
    }
  }, [])

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!user) {
      setData(null)
      return
    }
    if (!isUserVerified(user)) {
      setData(null)
      return
    }
    setAppError(null)
    getAppData().then(setData).catch((error) => {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null)
        return
      }
      if (error instanceof ApiError && error.status === 403) {
        setData(null)
        return
      }
      setAppError(error instanceof Error ? error.message : 'We could not load your workspace.')
    })
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
  }, [cancelBooking, isBookingModalOpen, isProfileModalOpen, selectedBooking])

  useEffect(() => {
    const focusBookingsSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setActiveView('bookings')
      setSidebarOpen(false)
      window.setTimeout(() => document.getElementById('bookings-search')?.focus(), 0)
    }
    window.addEventListener('keydown', focusBookingsSearch)
    return () => window.removeEventListener('keydown', focusBookingsSearch)
  }, [])

  if (authLoading) return <div className="loading-screen" role="status" aria-live="polite"><div className="loading-mark">L</div><span>Checking your session…</span></div>
  if (!user) {
    const resetToken = authNotice?.startsWith('reset:') ? authNotice.slice(6) : undefined
    return <AuthScreen onAuthenticated={setUser} initialNotice={resetToken ? undefined : authNotice} resetToken={resetToken} onClearNotice={() => setAuthNotice(null)} />
  }
  if (!isUserVerified(user)) {
    return <VerifyEmailScreen user={user} onLogout={async () => { await logout().catch(() => undefined); setUser(null); setData(null) }} initialNotice={authNotice} onClearNotice={() => setAuthNotice(null)} />
  }
  if (appError) return <ErrorState message={appError} onRetry={() => { setAppError(null); getAppData().then(setData).catch((error) => { if (error instanceof ApiError && error.status === 401) { setUser(null); return } setAppError(error instanceof Error ? error.message : 'We could not load your workspace.') }) }} onLogout={() => logout().finally(() => { setUser(null); setData(null) })} />
  if (!data) return <div className="loading-screen" role="status" aria-live="polite"><div className="loading-mark">L</div><span>Loading your workspace…</span></div>

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
    if (!canEditBooking(booking)) {
      setToast('Only upcoming bookings can be edited.')
      return
    }
    setSelectedBooking(null)
    setEditingBooking(booking)
    setPrefilledRoomId(undefined)
    setBookingModalOpen(true)
  }

  const searchHotkey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

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
      <a className="skip-link" href="#main-content">Skip to content</a>
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
              <button key={id} type="button" className={`nav-item ${activeView === id ? 'active' : ''}`} aria-current={activeView === id ? 'page' : undefined} onClick={() => navigate(id)}>
              <Icon size={18} /><span>{label}</span>{id === 'bookings' && <span className="nav-count">{upcomingBookingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><SparkleIcon size={17} /><div><strong>Room tip</strong><span>{afternoonRoomTip(data, selectedDate)}</span></div></div>
        <div className="sidebar-user">
          <button type="button" className="sidebar-profile-button" onClick={() => setProfileModalOpen(true)}>
            <div className="avatar avatar-nia" style={{ background: user.color }}>{user.initials}</div>
            <div><strong>{user.name}</strong><span>{user.role}</span></div>
          </button>
          <button type="button" className="sidebar-logout" aria-label="Sign out" onClick={handleLogout}><LogOutIcon size={16} /></button>
        </div>
      </aside>
      {sidebarOpen && <button type="button" className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
      <main className="main-area" id="main-content">
        <header className="topbar">
          <button type="button" className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><MenuIcon /></button>
          <div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{NAV_ITEMS.find((item) => item.id === activeView)?.label}</strong></div>
          <div className="topbar-actions">
            <button type="button" className="topbar-search" onClick={() => { navigate('bookings'); window.setTimeout(() => document.getElementById('bookings-search')?.focus(), 0) }}><SearchIcon size={17} /><span>Search bookings</span><kbd>{searchHotkey}</kbd></button>
            <button type="button" className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('You are all caught up')}><SparkleIcon size={18} /></button>
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
      {toast && <div className="toast" role="status" aria-live="polite"><div className="toast-check"><CheckIcon size={15} /></div>{toast}</div>}
    </div>
  )
}

function Dashboard({ data, user, selectedDate, onNavigate, onCreate, onSelectBooking }: { data: AppData; user: AuthUser; selectedDate: string; onNavigate: (view: ViewName) => void; onCreate: () => void; onSelectBooking: (booking: Booking) => void }) {
  const nowMinutes = getReferenceMinutes(selectedDate)
  const dayBookings = data.bookings.filter((booking) => booking.date === selectedDate && booking.status !== 'cancelled').sort(sortBookings)
  const weekDates = getWeekDates(selectedDate)
  const lastWeekDates = getWeekDates(addDays(selectedDate, -7))
  const weekSet = new Set(weekDates)
  const lastWeekSet = new Set(lastWeekDates)
  const confirmedCount = data.bookings.filter((booking) => booking.status === 'confirmed' && weekSet.has(booking.date)).length
  const lastWeekConfirmed = data.bookings.filter((booking) => booking.status === 'confirmed' && lastWeekSet.has(booking.date)).length
  const availableRooms = data.rooms.filter((room) => !isRoomBusy(data.bookings, room.id, selectedDate, nowMinutes)).length
  const yesterdayAvailable = data.rooms.filter((room) => !isRoomBusy(data.bookings, room.id, addDays(selectedDate, -1), nowMinutes)).length
  const totalHours = bookedHours(data.bookings, weekSet)
  const lastWeekHours = bookedHours(data.bookings, lastWeekSet)
  const capacityHours = Math.max(1, data.rooms.length * 8 * 5)
  const utilization = Math.round((totalHours / capacityHours) * 100)
  const lastUtilization = Math.round((lastWeekHours / capacityHours) * 100)
  const availableDelta = availableRooms - yesterdayAvailable
  const bookingTrend = percentTrend(confirmedCount, lastWeekConfirmed)
  const utilizationTrend = percentTrend(utilization, lastUtilization)
  const insight = weekInsight(data, weekDates)
  const availabilityLabel = selectedDate === getTodayDate() ? 'Rooms available now' : 'Rooms free at midday'

  return <>
    <div className="page-heading dashboard-heading">
      <div><span className="overline">{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span><h1>{greetingForNow()}, {user.name.split(' ')[0]} <span className="heading-sun">✦</span></h1><p>Here’s the pulse of your workplace today.</p></div>
      <button type="button" className="button button-primary" onClick={onCreate}><PlusIcon size={17} /> New booking</button>
    </div>
    <div className="metric-grid">
      <MetricCard label={availabilityLabel} value={String(availableRooms).padStart(2, '0')} detail={`of ${String(data.rooms.length).padStart(2, '0')} total rooms`} trend={availableDelta === 0 ? '0' : `${availableDelta > 0 ? '+' : ''}${availableDelta}`} trendLabel="vs yesterday" trendDirection={availableDelta > 0 ? 'up' : availableDelta < 0 ? 'down' : 'flat'} icon={<DoorIcon size={19} />} />
      <MetricCard label="Bookings this week" value={String(confirmedCount).padStart(2, '0')} detail="confirmed meetings" trend={bookingTrend.label} trendLabel="vs last week" trendDirection={bookingTrend.direction} icon={<CalendarIcon size={19} />} />
      <MetricCard label="Space utilization" value={`${utilization}%`} detail="weekly average" trend={utilizationTrend.label} trendLabel="vs last week" trendDirection={utilizationTrend.direction} icon={utilizationTrend.direction === 'down' ? <ArrowDownIcon size={18} /> : <ArrowUpIcon size={18} />} />
    </div>
    <div className="dashboard-grid">
      <section className="panel schedule-panel">
        <div className="panel-heading"><div><span className="overline">Your calendar</span><h2>Today’s flow</h2></div><button type="button" className="text-button" onClick={() => onNavigate('schedule')}>View schedule <ChevronRightIcon size={15} /></button></div>
        <div className="flow-list">
          {dayBookings.slice(0, 4).map((booking, index) => {
            const room = findRoom(data, booking.roomId)
            const organizer = findEmployee(data, booking.organizerId)
            return <button type="button" className="flow-row" key={booking.id} onClick={() => onSelectBooking(booking)}>
              <span className={`flow-time ${index === 0 ? 'current' : ''}`}><strong>{formatTime(booking.start)}</strong><small>{formatTime(booking.end)}</small></span>
              <span className="flow-line"><i /></span>
              <span className="flow-content"><strong>{booking.title}</strong><span>{room.name} · {organizer.name}</span></span>
              <span className="flow-status"><span className={`status-dot ${booking.status}`} />{booking.status}</span>
            </button>
          })}
          {dayBookings.length === 0 && <EmptyState title="A clear calendar" body="You have no bookings scheduled for today." />}
        </div>
        <button type="button" className="panel-footer-button" onClick={() => onNavigate('schedule')}>Open full schedule <ArrowUpIcon size={15} /></button>
      </section>
      <section className="panel pulse-panel">
        <div className="panel-heading"><div><span className="overline">Live view</span><h2>Room pulse</h2></div><button type="button" className="icon-button" onClick={() => onNavigate('rooms')} aria-label="View rooms"><MoreIcon size={18} /></button></div>
        <div className="pulse-visual"><div className="pulse-ring"><strong>{availableRooms}</strong><span>free now</span></div><div className="pulse-legend"><span><i className="legend-free" />Available <b>{availableRooms}</b></span><span><i className="legend-busy" />In use <b>{data.rooms.length - availableRooms}</b></span></div></div>
        <div className="pulse-list">{data.rooms.slice(0, 4).map((room) => { const busy = isRoomBusy(data.bookings, room.id, selectedDate, nowMinutes); return <div key={room.id} className="pulse-row"><span className="room-color" style={{ background: room.color }} /><strong>{room.name}</strong><span className={busy ? 'room-busy' : 'room-free'}>{busy ? 'In use' : 'Available'}</span><span className="room-capacity"><UsersIcon size={13} /> {room.capacity}</span></div> })}</div>
      </section>
      <section className="panel insight-panel"><div className="insight-icon"><SparkleIcon size={18} /></div><div><span className="overline">Workspace insight</span><h3>{insight.title}</h3><p>{insight.body}</p><button type="button" className="text-button" onClick={() => onNavigate('schedule')}>See this week <ChevronRightIcon size={15} /></button></div></section>
    </div>
  </>
}

function MetricCard({ label, value, detail, trend, trendLabel, icon, trendDirection = 'up' }: { label: string; value: string; detail: string; trend: string; trendLabel: string; icon: ReactNode; trendDirection?: 'up' | 'down' | 'flat' }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon">{icon}</div></div><div className="metric-value-row"><strong>{value}</strong><span>{detail}</span></div><div className="metric-trend"><span className={`trend-${trendDirection}`}>{trendDirection === 'down' ? <ArrowDownIcon size={13} /> : <ArrowUpIcon size={13} />} {trend}</span><span>{trendLabel}</span></div></div>
}

function RoomsPage({ data, selectedDate, onCreate, onSelectBooking }: { data: AppData; selectedDate: string; onCreate: (roomId?: string, date?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  const locations = useMemo(() => ['All locations', ...Array.from(new Set(data.rooms.map((room) => room.location)))], [data.rooms])
  const [query, setQuery] = useState(() => getUrlParam('roomsSearch'))
  const [type, setType] = useState<RoomFilterType>(getRoomTypeFromUrl)
  const [capacity, setCapacity] = useState(getRoomCapacityFromUrl)
  const [location, setLocation] = useState(() => locations.includes(getUrlParam('roomsLocation')) ? getUrlParam('roomsLocation') : 'All locations')
  useEffect(() => {
    replaceUrlParams({ roomsSearch: query, roomsType: type, roomsCapacity: capacity, roomsLocation: location })
  }, [capacity, location, query, type])
  const filteredRooms = data.rooms.filter((room) => {
    const matchesQuery = `${room.name} ${room.floor} ${room.location} ${room.amenities.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesType = type === 'All types' || room.type === type
    const matchesCapacity = capacity === 'Any capacity' || room.capacity >= Number(capacity)
    const matchesLocation = location === 'All locations' || room.location === location
    return matchesQuery && matchesType && matchesCapacity && matchesLocation
  })

  return <>
    <div className="page-heading"><div><span className="overline">Workspace directory</span><h1>Rooms</h1><p>Find the right space for the work ahead.</p></div><button type="button" className="button button-primary" onClick={() => onCreate()}><PlusIcon size={17} /> New booking</button></div>
    <div className="filter-bar"><label className="search-field"><SearchIcon size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by room, floor or amenity" aria-label="Search rooms" /></label><FilterSelect value={type} onChange={(value) => setType(value as typeof type)} options={['All types', 'Meeting', 'Workshop', 'Focus']} ariaLabel="Filter by room type" /><FilterSelect value={capacity} onChange={setCapacity} options={['Any capacity', '2', '6', '10', '14']} ariaLabel="Filter by capacity" /><FilterSelect value={location} onChange={setLocation} options={locations} ariaLabel="Filter by location" /></div>
    <div className="room-summary"><span><strong>{filteredRooms.length}</strong> rooms</span><span className="summary-divider" /><span className="availability-key"><i className="legend-free" /> {selectedDate === getTodayDate() ? 'Available right now' : 'Available at midday'}</span><span className="availability-key"><i className="legend-busy" /> In use</span></div>
    <div className="room-grid">{filteredRooms.map((room) => <RoomCard key={room.id} room={room} bookings={data.bookings} selectedDate={selectedDate} onCreate={onCreate} onSelectBooking={onSelectBooking} />)}</div>
    {filteredRooms.length === 0 && <EmptyState title="No rooms match those filters" body="Try widening your search or choosing a different room type." />}
  </>
}

function RoomCard({ room, bookings, selectedDate, onCreate, onSelectBooking }: { room: Room; bookings: Booking[]; selectedDate: string; onCreate: (roomId?: string, date?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  const nowMinutes = getReferenceMinutes(selectedDate)
  const booking = bookings.find((item) => item.roomId === room.id && item.date === selectedDate && item.status !== 'cancelled' && timeToMinutes(item.start) <= nowMinutes && timeToMinutes(item.end) > nowMinutes)
  const nextBooking = bookings.filter((item) => item.roomId === room.id && item.date === selectedDate && item.status !== 'cancelled' && timeToMinutes(item.start) > nowMinutes).sort(sortBookings)[0]
  return <article className="room-card"><div className="room-card-top" style={{ background: room.color }}><span className={`room-status ${booking ? 'busy' : 'available'}`}><i />{booking ? 'In use' : 'Available'}</span><div className="room-illustration"><DoorIcon size={32} /></div></div><div className="room-card-body"><div className="room-title-row"><div><h3>{room.name}</h3><span><MapPinIcon size={13} /> {room.floor} · {room.location}</span></div><span className="capacity-pill"><UsersIcon size={13} /> {room.capacity}</span></div><div className="amenity-list">{room.amenities.slice(0, 3).map((amenity) => <span key={amenity}>{amenity}</span>)}</div><div className="room-card-footer">{booking ? <button type="button" className="next-booking" onClick={() => onSelectBooking(booking)}><span>Until {formatTime(booking.end)}</span><strong>{booking.title}</strong></button> : nextBooking ? <div className="next-booking"><span>Next · {formatTime(nextBooking.start)}</span><strong>{nextBooking.title}</strong></div> : <div className="next-booking"><span>Open schedule</span><strong>Free for the rest of today</strong></div>}<button type="button" className="small-book-button" onClick={() => onCreate(room.id, selectedDate)}><PlusIcon size={15} /> Book</button></div></div></article>
}

function SchedulePage({ data, selectedDate, setSelectedDate, onCreate, onSelectBooking }: { data: AppData; selectedDate: string; setSelectedDate: (date: string) => void; onCreate: (roomId?: string, date?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  const [mode, setMode] = useState<'day' | 'week'>(getRangeFromUrl)
  const roomOptions = useMemo(() => ['All rooms', ...data.rooms.map((room) => room.id)], [data.rooms])
  const [roomFilter, setRoomFilter] = useState(() => roomOptions.includes(getUrlParam('scheduleRoom')) ? getUrlParam('scheduleRoom') : 'All rooms')
  const scheduleBookings = data.bookings.filter((booking) => booking.status !== 'cancelled' && (roomFilter === 'All rooms' || booking.roomId === roomFilter))
  const displayedRooms = roomFilter === 'All rooms' ? data.rooms : data.rooms.filter((room) => room.id === roomFilter)
  const weekDates = getWeekDates(selectedDate)
  useEffect(() => {
    replaceUrlParams({ range: mode, scheduleRoom: roomFilter })
  }, [mode, roomFilter])
  return <>
    <div className="page-heading schedule-heading"><div><span className="overline">Plan your week</span><h1>Schedule</h1><p>See what’s happening across every room.</p></div><button type="button" className="button button-primary" onClick={() => onCreate(undefined, selectedDate)}><PlusIcon size={17} /> New booking</button></div>
    <div className="schedule-toolbar"><div className="view-toggle" role="group" aria-label="Schedule range"><button type="button" className={mode === 'day' ? 'active' : ''} aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Day</button><button type="button" className={mode === 'week' ? 'active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Week</button></div><div className="date-switcher"><button type="button" onClick={() => setSelectedDate(addDays(selectedDate, mode === 'week' ? -7 : -1))} aria-label="Previous date"><ChevronLeftIcon size={17} /></button><strong>{mode === 'day' ? formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' }) : `${formatDate(weekDates[0], { month: 'short', day: 'numeric' })} – ${formatDate(weekDates[6], { month: 'short', day: 'numeric', year: 'numeric' })}`}</strong><button type="button" onClick={() => setSelectedDate(addDays(selectedDate, mode === 'week' ? 7 : 1))} aria-label="Next date"><ChevronRightIcon size={17} /></button><button type="button" className="today-button" onClick={() => setSelectedDate(getTodayDate())}>Today</button></div><FilterSelect value={roomFilter} onChange={setRoomFilter} options={['All rooms', ...data.rooms.map((room) => room.id)]} labels={['All rooms', ...data.rooms.map((room) => room.name)]} ariaLabel="Filter schedule by room" /></div>
    {mode === 'day' ? <DaySchedule rooms={displayedRooms} bookings={scheduleBookings.filter((booking) => booking.date === selectedDate)} onCreate={onCreate} onSelectBooking={onSelectBooking} /> : <WeekSchedule dates={weekDates} rooms={displayedRooms} bookings={scheduleBookings} onSelectBooking={onSelectBooking} />}
  </>
}

function DaySchedule({ rooms, bookings, onCreate, onSelectBooking }: { rooms: Room[]; bookings: Booking[]; onCreate: (roomId?: string) => void; onSelectBooking: (booking: Booking) => void }) {
  return <section className="schedule-card"><div className="schedule-date-note"><span className="live-indicator"><i /> Live schedule</span><span>{bookings.length} bookings · 8:00 AM – 6:00 PM</span></div><div className="timeline"><div className="timeline-header"><div className="timeline-room-label">Room</div><div className="timeline-hours">{HOURS.map((hour) => <span key={hour}>{formatTime(`${String(hour).padStart(2, '0')}:00`)}</span>)}</div></div>{rooms.map((room) => <div className="timeline-row" key={room.id}><div className="timeline-room-label"><span className="room-color" style={{ background: room.color }} /><div><strong>{room.name}</strong><small>{room.capacity} seats</small></div></div><div className="timeline-track">{HOURS.map((hour) => <i key={hour} />)}{bookings.filter((booking) => booking.roomId === room.id).map((booking) => <button key={booking.id} className={`timeline-booking ${booking.status}`} onClick={() => onSelectBooking(booking)} style={bookingStyle(booking)}><strong>{booking.title}</strong><span>{formatTime(booking.start)} – {formatTime(booking.end)}</span></button>)}{bookings.every((booking) => booking.roomId !== room.id) && <button className="track-empty" onClick={() => onCreate(room.id)}>+ Add booking</button>}</div></div>)}</div></section>
}

function WeekSchedule({ dates, rooms, bookings, onSelectBooking }: { dates: string[]; rooms: Room[]; bookings: Booking[]; onSelectBooking: (booking: Booking) => void }) {
  return <section className="week-schedule-card"><div className="week-header"><div className="week-label">Week view</div>{dates.map((date) => <div className={`week-day-label ${date === getTodayDate() ? 'today' : ''}`} key={date}><span>{formatDate(date, { weekday: 'short' })}</span><strong>{formatDate(date, { day: 'numeric' })}</strong></div>)}</div><div className="week-body"><div className="week-room-list">{rooms.map((room) => <div className="week-room-label" key={room.id}><span className="room-color" style={{ background: room.color }} />{room.name}</div>)}</div><div className="week-columns">{dates.map((date) => <div className="week-column" style={{ gridTemplateRows: `repeat(${rooms.length}, 84px)` }} key={date}>{rooms.map((room) => <div className="week-slot" key={room.id}>{bookings.filter((booking) => booking.date === date && booking.roomId === room.id).map((booking) => <button type="button" className={`week-booking ${booking.status}`} key={booking.id} onClick={() => onSelectBooking(booking)}><strong>{booking.title}</strong><span>{formatTime(booking.start)}</span></button>)}</div>)}</div>)}</div></div></section>
}

function BookingsPage({ data, onCreate, onSelectBooking, onEdit, onCancel }: { data: AppData; onCreate: () => void; onSelectBooking: (booking: Booking) => void; onEdit: (booking: Booking) => void; onCancel: (booking: Booking) => void }) {
  const [query, setQuery] = useState(() => getUrlParam('bookingsSearch'))
  const [status, setStatus] = useState<BookingFilterStatus>(getBookingStatusFromUrl)
  const [sortDescending, setSortDescending] = useState(() => getUrlParam('bookingsSort') === 'desc')
  useEffect(() => {
    replaceUrlParams({ bookingsSearch: query, bookingsStatus: status, bookingsSort: sortDescending ? 'desc' : 'asc' })
  }, [query, sortDescending, status])
  const filtered = data.bookings.filter((booking) => {
    const room = findRoom(data, booking.roomId)
    const organizer = findEmployee(data, booking.organizerId)
    const matchesQuery = `${booking.title} ${room.name} ${organizer.name}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'All bookings' || (status === 'Upcoming' && booking.status !== 'cancelled' && isUpcoming(booking.date, booking.start)) || (status === 'Past' && isPast(booking.date, booking.end) && booking.status !== 'cancelled') || (status === 'Cancelled' && booking.status === 'cancelled')
    return matchesQuery && matchesStatus
  }).sort((a, b) => sortDescending ? sortBookings(b, a) : sortBookings(a, b))
  return <>
    <div className="page-heading"><div><span className="overline">Everything in one place</span><h1>Bookings</h1><p>Manage upcoming meetings and keep the day moving.</p></div><button type="button" className="button button-primary" onClick={onCreate}><PlusIcon size={17} /> New booking</button></div>
    <div className="filter-bar booking-filter-bar"><label className="search-field"><SearchIcon size={17} /><input id="bookings-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bookings, rooms or people" aria-label="Search bookings" /></label><FilterSelect value={status} onChange={(value) => setStatus(value as typeof status)} options={['All bookings', 'Upcoming', 'Past', 'Cancelled']} ariaLabel="Filter bookings by status" /><span className="filter-results">{filtered.length} results</span></div>
    <section className="bookings-panel"><div className="bookings-table-head"><span>Booking</span><span>Room</span><span>Date & time</span><span>Organizer</span><span>Status</span><span /></div>{filtered.map((booking) => { const room = findRoom(data, booking.roomId); const organizer = findEmployee(data, booking.organizerId); return <div className="booking-row" key={booking.id}><button type="button" className="booking-main" onClick={() => onSelectBooking(booking)}><span className="booking-color" style={{ background: room.color }} /><span><strong>{booking.title}</strong><small>{booking.attendees} attendees</small></span></button><div className="booking-room"><span className="room-color" style={{ background: room.color }} />{room.name}</div><div className="booking-date"><strong>{formatDate(booking.date, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span>{formatTime(booking.start)} – {formatTime(booking.end)}</span></div><div className="booking-organizer"><span className="mini-avatar" style={{ background: organizer.color }}>{organizer.initials}</span>{organizer.name}</div><div><span className={`booking-status ${booking.status}`}>{booking.status}</span></div><div className="row-actions">{canEditBooking(booking) && <button type="button" onClick={() => onEdit(booking)} aria-label={`Edit ${booking.title}`}><EditIcon size={16} /></button>}{canCancelBooking(booking) && <button type="button" onClick={() => onCancel(booking)} aria-label={`Cancel ${booking.title}`}><TrashIcon size={16} /></button>}<button type="button" onClick={() => onSelectBooking(booking)} aria-label={`View ${booking.title}`}><MoreIcon size={17} /></button></div></div>})}{filtered.length === 0 && <EmptyState title="No bookings found" body="Try another search or create a new booking." />}</section>
    <div className="table-footnote"><span><span className="green-dot" /> Changes are saved automatically</span><button className="sort-button" onClick={() => setSortDescending(!sortDescending)}>{sortDescending ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />} Sort by date</button></div>
  </>
}

function BookingDetails({ booking, data, onClose, onEdit, onCancel }: { booking: Booking; data: AppData; onClose: () => void; onEdit: () => void; onCancel: () => void }) {
  const room = findRoom(data, booking.roomId)
  const organizer = findEmployee(data, booking.organizerId)
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="details-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-details-title"><div className="drawer-top" style={{ background: room.color }}><button type="button" className="icon-button drawer-close" onClick={onClose} aria-label="Close booking details"><CloseIcon size={18} /></button><span className="drawer-room-label"><DoorIcon size={15} /> {room.name}</span><div className="drawer-symbol"><CalendarIcon size={42} /></div></div><div className="drawer-content"><div className="drawer-heading"><div><span className={`booking-status ${booking.status}`}>{booking.status}</span><h2 id="booking-details-title">{booking.title}</h2></div></div><div className="detail-list"><DetailItem icon={<CalendarIcon size={17} />} label="When" value={`${formatDate(booking.date, { weekday: 'long', month: 'long', day: 'numeric' })} · ${formatTime(booking.start)} – ${formatTime(booking.end)}`} /><DetailItem icon={<MapPinIcon size={17} />} label="Where" value={`${room.name}, ${room.floor}`} /><DetailItem icon={<UsersIcon size={17} />} label="Attendees" value={`${booking.attendees} people`} /><DetailItem icon={<UsersIcon size={17} />} label="Organizer" value={organizer.name} avatar={organizer} /></div>{booking.notes && <div className="notes-block"><span className="overline">Notes</span><p>{booking.notes}</p></div>}<div className="drawer-actions">{canEditBooking(booking) && <button type="button" className="button button-secondary" onClick={onEdit}><EditIcon size={16} /> Edit booking</button>}{canCancelBooking(booking) && <button type="button" className="button button-danger-ghost" onClick={onCancel}><TrashIcon size={16} /> Cancel</button>}</div></div></aside></div>
}

function DetailItem({ icon, label, value, avatar }: { icon: ReactNode; label: string; value: string; avatar?: { initials: string; color: string } }) { return <div className="detail-item"><span className="detail-icon">{icon}</span><span><small>{label}</small><strong>{avatar && <span className="mini-avatar" style={{ background: avatar.color }}>{avatar.initials}</span>}{value}</strong></span></div> }

function BookingModal({ data, currentUserId, initialBooking, roomId, selectedDate, onClose, onSave }: { data: AppData; currentUserId: string; initialBooking: Booking | null; roomId?: string; selectedDate: string; onClose: () => void; onSave: (form: BookingForm) => Promise<string | null> }) {
  const [form, setForm] = useState<BookingForm>(() => initialBooking ? { ...initialBooking, status: initialBooking.status === 'tentative' ? 'tentative' : 'confirmed' } : { ...defaultForm, organizerId: currentUserId, roomId: roomId || data.rooms[0]?.id || defaultForm.roomId, date: selectedDate })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = <K extends keyof BookingForm>(key: K, value: BookingForm[K]) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => { event.preventDefault(); if (saving) return; if (!form.title.trim()) { setError('Give your booking a title.'); return } if (timeToMinutes(form.end) <= timeToMinutes(form.start)) { setError('End time needs to be after the start time.'); return } setSaving(true); setError(''); const saveError = await onSave({ ...form, attendees: Number(form.attendees) }); setSaving(false); if (saveError) setError(saveError) }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}><div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title"><div className="modal-header"><div><span className="overline">{initialBooking ? 'Update the details' : 'Add to the calendar'}</span><h2 id="booking-modal-title">{initialBooking ? 'Edit booking' : 'New booking'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close" disabled={saving}><CloseIcon /></button></div><form onSubmit={submit}><div className="form-grid"><label className="form-field full"><span>What’s happening?</span><input autoFocus value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Product planning" maxLength={160} /></label><label className="form-field"><span>Date</span><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></label><label className="form-field"><span>Room</span><select value={form.roomId} onChange={(event) => update('roomId', event.target.value)}>{data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.capacity} seats</option>)}</select></label><label className="form-field"><span>Starts</span><input type="time" value={form.start} onChange={(event) => update('start', event.target.value)} /></label><label className="form-field"><span>Ends</span><input type="time" value={form.end} onChange={(event) => update('end', event.target.value)} /></label><label className="form-field"><span>Organizer</span><select value={form.organizerId} onChange={(event) => update('organizerId', event.target.value)}>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="form-field"><span>Attendees</span><input type="number" min="1" max="100" value={form.attendees} onChange={(event) => update('attendees', Number(event.target.value))} /></label><label className="form-field full"><span>Notes <em>Optional</em></span><textarea rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Add context for your teammates" maxLength={2000} /></label></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-footer"><span><span className="green-dot" /> Saved to this workspace</span><div><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : initialBooking ? 'Save changes' : 'Create booking'}</button></div></div></form></div></div>
}

function CancelModal({ booking, onClose, onConfirm }: { booking: Booking; onClose: () => void; onConfirm: () => Promise<void> }) { const [busy, setBusy] = useState(false); const confirm = async () => { if (busy) return; setBusy(true); await onConfirm(); setBusy(false) }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}><div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="cancel-modal-title"><div className="confirm-icon"><TrashIcon size={20} /></div><h2 id="cancel-modal-title">Cancel this booking?</h2><p><strong>{booking.title}</strong> will be removed from the room schedule. This action can’t be undone.</p><div className="confirm-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Keep booking</button><button type="button" className="button button-danger" onClick={confirm} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel booking'}</button></div></div></div> }

function AuthScreen({ onAuthenticated, initialNotice, resetToken, onClearNotice }: { onAuthenticated: (user: AuthUser) => void; initialNotice?: string | null; resetToken?: string; onClearNotice?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(initialNotice || '')
  const [busy, setBusy] = useState(false)
  const isRegistering = mode === 'register'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'

  useEffect(() => {
    if (initialNotice) setNotice(initialNotice)
  }, [initialNotice])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (isRegistering && password !== confirmPassword) { setError('Passwords do not match.'); return }
    setBusy(true)
    setError('')
    setNotice('')
    onClearNotice?.()
    try {
      if (isForgot) {
        const result = await forgotPassword(email)
        setNotice(result.message)
        return
      }
      if (isReset && resetToken) {
        const result = await resetPassword(resetToken, password)
        setNotice(result.message)
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        return
      }
      const nextUser = isRegistering ? await register(name, email, password) : await login(email, password)
      onAuthenticated(nextUser)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'We could not complete that request.')
    } finally {
      setBusy(false)
    }
  }

  const heading = isReset ? 'Choose a new password' : isForgot ? 'Reset your password' : isRegistering ? 'Create your account' : 'Welcome back'
  const copy = isReset
    ? 'Enter a new password for your Loop account.'
    : isForgot
      ? 'We will email you a secure link to reset your password.'
      : isRegistering
        ? 'Set up your account to start booking rooms.'
        : 'Sign in to manage your meetings and rooms.'

  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><div className="brand-mark">L</div><div><strong>loop</strong><span>workplace</span></div></div><div className="auth-copy"><span className="overline">Kartuli Labs workspace</span><h1>{heading}</h1><p>{copy}</p></div>{notice && <div className="auth-notice" role="status">{notice}</div>}<form className="auth-form" onSubmit={submit}>{isRegistering && <label className="form-field"><span>Full name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nino Chkheidze" autoComplete="name" required /></label>}{!isReset && <label className="form-field"><span>Email address</span><input autoFocus={!isRegistering && !isReset} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@kartulilabs.com" autoComplete="email" required={!isReset} readOnly={isReset} /></label>}<label className="form-field"><span>{isReset ? 'New password' : 'Password'}</span><input autoFocus={isReset} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={isRegistering || isReset ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required /></label>{(isRegistering || isReset) && <label className="form-field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>}{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : isReset ? 'Update password' : isForgot ? 'Send reset link' : isRegistering ? 'Create account' : 'Sign in'}<ChevronRightIcon size={16} /></button></form><p className="auth-switch">{isForgot || isReset ? <button type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Back to sign in</button> : isRegistering ? <>Already have an account? <button type="button" onClick={() => { setMode('login'); setError('') }}>Sign in</button></> : <>New to Loop? <button type="button" onClick={() => { setMode('register'); setError('') }}>Create an account</button> · <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice('') }}>Forgot password?</button></>}</p><p className="auth-footnote">{useLocalApi ? 'Bookings stay in this browser. Email delivery uses Vercel serverless when configured.' : 'Your session is protected with an HttpOnly cookie.'}</p></section></main>
}

function VerifyEmailScreen({ user, onLogout, initialNotice, onClearNotice }: { user: AuthUser; onLogout: () => Promise<void>; initialNotice?: string | null; onClearNotice?: () => void }) {
  const [notice, setNotice] = useState(initialNotice || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initialNotice) setNotice(initialNotice)
  }, [initialNotice])

  const handleResend = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    onClearNotice?.()
    try {
      const result = await resendVerification()
      setNotice(result.sent === false && !useLocalApi ? 'Email service is not configured. Check server logs for the verification link.' : 'Verification email sent. Check your inbox.')
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'We could not resend the email.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-shell"><section className="auth-card verify-card"><div className="auth-brand"><div className="brand-mark">L</div><div><strong>loop</strong><span>workplace</span></div></div><div className="auth-copy"><span className="overline">Almost there</span><h1>Verify your email</h1><p>We sent a verification link to <strong>{user.email}</strong>. Confirm your address to book rooms and receive booking updates.</p></div>{notice && <div className="auth-notice" role="status">{notice}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="verify-actions"><button type="button" className="button button-primary" onClick={handleResend} disabled={busy}>{busy ? 'Sending…' : 'Resend verification email'}</button><button type="button" className="button button-secondary" onClick={() => onLogout()}>Sign out</button></div><p className="auth-footnote">Didn’t get the email? Check spam, or use resend. In local dev without Resend, open the browser console for the verification link.</p></section></main>
}

function ErrorState({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <main className="error-shell"><div className="error-card"><div className="loading-mark">L</div><span className="overline">Kartuli Labs workspace</span><h1>We couldn’t load your workspace.</h1><p>{message}</p><div className="error-actions"><button type="button" className="button button-primary" onClick={onRetry}>Try again</button><button type="button" className="button button-secondary" onClick={onLogout}>Sign out</button></div></div></main>
}

function FilterSelect({ value, onChange, options, labels = options, ariaLabel = 'Filter' }: { value: string; onChange: (value: string) => void; options: string[]; labels?: string[]; ariaLabel?: string }) { return <label className="filter-select"><SlidersIcon size={15} /><select value={value} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)}>{options.map((option, index) => <option key={option} value={option}>{labels[index]}</option>)}</select><ChevronDownIcon size={14} /></label> }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><div className="empty-icon"><CalendarIcon size={20} /></div><strong>{title}</strong><span>{body}</span></div> }
function sortBookings(a: Booking, b: Booking) { return `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`) }
function bookingStyle(booking: Booking): CSSProperties {
  const start = Math.max(0, timeToMinutes(booking.start) - 480)
  const duration = Math.max(15, timeToMinutes(booking.end) - timeToMinutes(booking.start))
  const left = Math.min(100, (start / 600) * 100)
  const width = Math.min(100 - left, (duration / 600) * 100)
  return { left: `${left}%`, width: `${Math.max(width, 2)}%` }
}
type RoomFilterType = 'All types' | Room['type']
type BookingFilterStatus = 'All bookings' | 'Upcoming' | 'Past' | 'Cancelled'

function getUrlParam(key: string) { return new URLSearchParams(window.location.search).get(key) || '' }
function replaceUrlParams(updates: Record<string, string>) {
  const params = new URLSearchParams(window.location.search)
  Object.entries(updates).forEach(([key, value]) => {
    if (value) params.set(key, value)
    else params.delete(key)
  })
  window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`)
}
function getViewFromUrl(): ViewName { const view = getUrlParam('view'); return NAV_ITEMS.some((item) => item.id === view) ? view as ViewName : 'dashboard' }
function getRangeFromUrl(): 'day' | 'week' { return getUrlParam('range') === 'week' ? 'week' : 'day' }
function getRoomTypeFromUrl(): RoomFilterType { const type = getUrlParam('roomsType') as RoomFilterType; return ['All types', 'Meeting', 'Workshop', 'Focus'].includes(type) ? type : 'All types' }
function getRoomCapacityFromUrl() { const capacity = getUrlParam('roomsCapacity'); return ['Any capacity', '2', '6', '10', '14'].includes(capacity) ? capacity : 'Any capacity' }
function getBookingStatusFromUrl(): BookingFilterStatus { const status = getUrlParam('bookingsStatus') as BookingFilterStatus; return ['All bookings', 'Upcoming', 'Past', 'Cancelled'].includes(status) ? status : 'All bookings' }
function getDateFromUrl(): string {
  const date = new URLSearchParams(window.location.search).get('date')
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseDate(date).getTime()) ? date : getTodayDate()
}
function canEditBooking(booking: Booking) { return booking.status !== 'cancelled' && isUpcoming(booking.date, booking.start) }
function canCancelBooking(booking: Booking) { return booking.status !== 'cancelled' && !isPast(booking.date, booking.end) }
function isRoomBusy(bookings: Booking[], roomId: string, date: string, minutes: number) {
  return bookings.some((booking) => booking.roomId === roomId && booking.date === date && booking.status !== 'cancelled' && timeToMinutes(booking.start) <= minutes && timeToMinutes(booking.end) > minutes)
}
function bookedHours(bookings: Booking[], dates: Set<string>) {
  return bookings.filter((booking) => booking.status !== 'cancelled' && dates.has(booking.date)).reduce((sum, booking) => sum + (timeToMinutes(booking.end) - timeToMinutes(booking.start)) / 60, 0)
}
function percentTrend(current: number, previous: number) {
  if (previous === 0) return { label: current === 0 ? '0%' : 'New', direction: current === 0 ? 'flat' as const : 'up' as const }
  const delta = Math.round(((current - previous) / previous) * 100)
  return { label: `${delta > 0 ? '+' : ''}${delta}%`, direction: delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'flat' as const }
}
function weekInsight(data: AppData, weekDates: string[]) {
  const counts = weekDates.map((date) => ({ date, hours: bookedHours(data.bookings, new Set([date])) }))
  const busiest = counts.reduce((best, item) => item.hours > best.hours ? item : best)
  if (busiest.hours === 0) return { title: 'A quiet week', body: 'No meetings are on the calendar yet. Book a room when you need the space.' }
  return { title: `${formatDate(busiest.date, { weekday: 'long' })} is your busiest day`, body: `${busiest.hours % 1 === 0 ? busiest.hours : busiest.hours.toFixed(1)} booked hours across rooms. Reserve early if you need space that day.` }
}
function afternoonRoomTip(data: AppData, selectedDate: string) {
  const freeRoom = data.rooms.find((room) => !data.bookings.some((booking) => booking.status !== 'cancelled' && booking.roomId === room.id && booking.date === selectedDate && timeToMinutes(booking.start) < 18 * 60 && timeToMinutes(booking.end) > 12 * 60))
  return freeRoom ? `${freeRoom.name} is free this afternoon.` : 'Every room has afternoon bookings.'
}
function findRoom(data: AppData, roomId: string): Room {
  return data.rooms.find((item) => item.id === roomId) ?? { id: roomId, name: 'Unknown room', floor: '', location: '', capacity: 0, type: 'Meeting', amenities: [], color: '#dfe6e1' }
}
function findEmployee(data: AppData, employeeId: string): Employee {
  return data.employees.find((item) => item.id === employeeId) ?? { id: employeeId, name: 'Unknown person', role: '', initials: '?', color: '#dfe6e1' }
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
