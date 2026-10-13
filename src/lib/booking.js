export const TIME_ZONE = 'Africa/Johannesburg'

export const SERVICE_TYPES = [
  { value: 'tourism', label: 'Tourism & Day Tours' },
  { value: 'airport_transfer', label: 'Airport Transfers' },
  { value: 'long_distance', label: 'Long Distance & Road Trips' },
  { value: 'executive_event', label: 'Executive & Event Transfers' },
]
export const serviceLabel = value => SERVICE_TYPES.find(s => s.value === value)?.label ?? value

export const STATUS_FLOW = ['pending', 'confirmed', 'driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'in_progress', 'completed']
export const ALL_STATUSES = [...STATUS_FLOW, 'cancelled']

export const STATUS_LABELS = {
  pending: 'Submitted',
  confirmed: 'Confirmed',
  driver_assigned: 'Driver assigned',
  en_route_to_pickup: 'On the way to pickup',
  arrived_at_pickup: 'Arrived at pickup',
  in_progress: 'Trip in progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
export const statusLabel = status => STATUS_LABELS[status] ?? status

export const STATUS_DESCRIPTIONS = {
  pending: 'We have received your booking and will confirm it shortly.',
  confirmed: 'Your booking is confirmed. A driver will be assigned before your trip.',
  driver_assigned: 'Your driver and vehicle have been assigned.',
  en_route_to_pickup: 'Your driver is on the way to the pickup point.',
  arrived_at_pickup: 'Your driver has arrived at the pickup point.',
  in_progress: 'You have been picked up. Enjoy the journey.',
  completed: 'Trip completed. Thank you for travelling with Lion\'s Route.',
  cancelled: 'This booking has been cancelled.',
}

// Driver-facing actions: current status -> next status and button label.
export const DRIVER_NEXT = {
  driver_assigned: { next: 'en_route_to_pickup', label: 'On my way to pickup' },
  en_route_to_pickup: { next: 'arrived_at_pickup', label: 'Arrived at pickup' },
  arrived_at_pickup: { next: 'in_progress', label: 'Client picked up — start trip' },
  in_progress: { next: 'completed', label: 'Complete trip' },
}

export const ACTIVE_TRIP_STATUSES = ['en_route_to_pickup', 'arrived_at_pickup', 'in_progress']
export const OPEN_STATUSES = ['pending', 'confirmed', 'driver_assigned', ...ACTIVE_TRIP_STATUSES]
export const canClientCancel = booking => ['pending', 'confirmed'].includes(booking.status) && !booking.driver_id

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT' },
  { value: 'other', label: 'Other' },
]
export const paymentMethodLabel = value => PAYMENT_METHODS.find(m => m.value === value)?.label ?? ''

export const BOOKING_SELECT = '*, driver:profiles!bookings_driver_id_fkey(id, full_name, phone), vehicle:vehicles(id, name, vehicle_type, registration, seats)'

const dateTimeFormat = new Intl.DateTimeFormat('en-ZA', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const dateFormat = new Intl.DateTimeFormat('en-ZA', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-ZA', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false })
const isoDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })

export const formatDateTime = iso => (iso ? dateTimeFormat.format(new Date(iso)) : '')
export const formatDate = iso => (iso ? dateFormat.format(new Date(iso)) : '')
export const formatTime = iso => (iso ? timeFormat.format(new Date(iso)) : '')
export const formatMoney = value => (value === null || value === undefined || value === '' ? '' : money.format(Number(value)))

// South Africa has no daylight saving, so SAST is always UTC+02:00.
export const sastToIso = (date, time) => new Date(`${date}T${time}:00+02:00`).toISOString()
export const isoToSastDate = iso => isoDateFormat.format(new Date(iso))
export const isoToSastTime = iso => timeFormat.format(new Date(iso))
export const sastToday = (offsetDays = 0) => isoDateFormat.format(new Date(Date.now() + offsetDays * 86400000))
export const sastDayStartIso = date => new Date(`${date}T00:00:00+02:00`).toISOString()

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return ''
  const message = error.message || String(error)
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'We could not reach the booking service. Check your connection and try again.'
  if (/Invalid login credentials/i.test(message)) return 'That email and password do not match an account.'
  if (/Email not confirmed/i.test(message)) return 'Please confirm your email address first — check your inbox for the confirmation link.'
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Please sign in instead.'
  if (/JWT|token/i.test(message) && /expired|invalid/i.test(message)) return 'Your session has expired. Please sign in again.'
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.'
  if (/violates check constraint|invalid input/i.test(message)) return 'Some details are not valid. Please review the form and try again.'
  return message.length < 220 ? message : fallback
}

export const whatsappLink = (phone, text = '') => {
  const digits = String(phone || '').replace(/\D/g, '')
  const international = digits.startsWith('0') ? `27${digits.slice(1)}` : digits
  return `https://wa.me/${international}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
export const telLink = phone => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`
export const mapsLink = place => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`

// Strip characters that have meaning in PostgREST filter syntax.
export const cleanSearch = text => String(text || '').replace(/[,()*:%\\"']/g, ' ').trim()

export function validateTrip(trip, { requireFuture = true } = {}) {
  const errors = {}
  if (!SERVICE_TYPES.some(s => s.value === trip.service_type)) errors.service_type = 'Please choose a service.'
  if ((trip.pickup_location || '').trim().length < 3) errors.pickup_location = 'Please enter a pickup address or place.'
  if ((trip.dropoff_location || '').trim().length < 3) errors.dropoff_location = 'Please enter a drop-off address or place.'
  if (!trip.date) errors.date = 'Please choose a date.'
  if (!trip.time) errors.time = 'Please choose a time.'
  if (trip.date && trip.time && requireFuture && new Date(sastToIso(trip.date, trip.time)) <= new Date()) {
    errors.time = 'Please choose a pickup time in the future.'
  }
  const passengers = Number(trip.passengers)
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 60) errors.passengers = 'Passengers must be between 1 and 60.'
  const luggage = Number(trip.luggage)
  if (!Number.isInteger(luggage) || luggage < 0 || luggage > 100) errors.luggage = 'Luggage must be between 0 and 100 bags.'
  if (trip.flight_number && !/^[A-Za-z0-9]{2,3}\s?\d{1,5}[A-Za-z]?$/.test(trip.flight_number.trim())) {
    errors.flight_number = 'Use a flight number like SA 345 or FA123.'
  }
  if ((trip.notes || '').length > 1000) errors.notes = 'Please keep special requests under 1000 characters.'
  return errors
}

export function validateContact(contact) {
  const errors = {}
  if ((contact.client_name || '').trim().length < 2) errors.client_name = 'Please enter a full name.'
  if ((contact.client_phone || '').replace(/\D/g, '').length < 9) errors.client_phone = 'Please enter a valid phone number.'
  if (contact.client_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.client_email.trim())) errors.client_email = 'Please enter a valid email address.'
  return errors
}

export const tripToRow = trip => ({
  service_type: trip.service_type,
  pickup_location: trip.pickup_location.trim(),
  dropoff_location: trip.dropoff_location.trim(),
  pickup_at: sastToIso(trip.date, trip.time),
  passengers: Number(trip.passengers),
  luggage: Number(trip.luggage),
  flight_number: trip.service_type === 'airport_transfer' && trip.flight_number ? trip.flight_number.trim() : null,
  notes: trip.notes?.trim() || null,
})

export const emptyTrip = (service = 'airport_transfer') => ({
  service_type: service, pickup_location: '', dropoff_location: '', date: '', time: '', passengers: 1, luggage: 1, flight_number: '', notes: '',
})

export const rowToTrip = booking => ({
  service_type: booking.service_type,
  pickup_location: booking.pickup_location,
  dropoff_location: booking.dropoff_location,
  date: isoToSastDate(booking.pickup_at),
  time: isoToSastTime(booking.pickup_at),
  passengers: booking.passengers,
  luggage: booking.luggage,
  flight_number: booking.flight_number || '',
  notes: booking.notes || '',
})
