import React from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarClock, ClipboardList, LayoutDashboard, Plus, Truck, UserCog, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { must, useAsync, useRealtime } from '../../lib/hooks'
import { ALL_STATUSES, BOOKING_SELECT, errorMessage, sastDayStartIso, sastToday, statusLabel } from '../../lib/booking'
import { Empty, ErrorNote, LiveIndicator, Loading, PortalShell } from '../../components/portal'
import BookingTable from './BookingTable'
import { AdminBookingDetail, AdminBookings, AdminNewBooking } from './AdminBookings'
import { AdminClientDetail, AdminClients, AdminDrivers } from './AdminPeople'
import AdminVehicles from './AdminVehicles'

const sections = [
  ['Dashboard', '/admin', LayoutDashboard, path => path === '/admin' || path === '/admin/'],
  ['Bookings', '/admin/bookings', ClipboardList, path => path.startsWith('/admin/bookings') && path !== '/admin/bookings/new'],
  ['New booking', '/admin/bookings/new', Plus, path => path === '/admin/bookings/new'],
  ['Drivers', '/admin/drivers', UserCog, path => path.startsWith('/admin/drivers')],
  ['Vehicles', '/admin/vehicles', Truck, path => path.startsWith('/admin/vehicles')],
  ['Clients', '/admin/clients', Users, path => path.startsWith('/admin/clients')],
]

async function loadDashboard() {
  const countResults = await Promise.all(ALL_STATUSES.map(status =>
    must(supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', status))))
  const counts = Object.fromEntries(ALL_STATUSES.map((status, i) => [status, countResults[i] || 0]))
  const start = sastDayStartIso(sastToday())
  const tomorrow = sastDayStartIso(sastToday(1))
  const weekEnd = sastDayStartIso(sastToday(8))
  const [today, upcoming, pending, unpaid] = await Promise.all([
    must(supabase.from('bookings').select(BOOKING_SELECT).gte('pickup_at', start).lt('pickup_at', tomorrow).neq('status', 'cancelled').order('pickup_at')),
    must(supabase.from('bookings').select(BOOKING_SELECT).gte('pickup_at', tomorrow).lt('pickup_at', weekEnd).neq('status', 'cancelled').order('pickup_at').limit(50)),
    must(supabase.from('bookings').select(BOOKING_SELECT).in('status', ['pending', 'confirmed']).order('pickup_at').limit(20)),
    must(supabase.from('bookings').select(BOOKING_SELECT).eq('status', 'completed').eq('payment_status', 'unpaid').order('pickup_at', { ascending: false }).limit(20)),
  ])
  return { counts, today, upcoming, pending, unpaid }
}

function Dashboard() {
  const { data, error, loading, reload } = useAsync(loadDashboard, [])
  const live = useRealtime('admin-dashboard', [{ event: '*', table: 'bookings' }], reload)
  if (loading && !data) return <Loading label="Loading dashboard…" />
  if (error && !data) return <ErrorNote error={errorMessage(error)} onRetry={reload} />
  const { counts } = data
  const onRoad = counts.en_route_to_pickup + counts.arrived_at_pickup + counts.in_progress
  const open = counts.pending + counts.confirmed + counts.driver_assigned + onRoad
  return (
    <>
      <div className="a-toolbar"><span className="p-muted">{open} open booking{open === 1 ? '' : 's'}</span><LiveIndicator status={live} /></div>
      <section className="a-stats" aria-label="Bookings by status">
        <Link to="/admin/bookings?status=pending" className="a-stat is-alert"><span>Awaiting confirmation</span><strong>{counts.pending}</strong></Link>
        <Link to="/admin/bookings?status=confirmed" className="a-stat"><span>Confirmed · needs driver</span><strong>{counts.confirmed}</strong></Link>
        <Link to="/admin/bookings?status=driver_assigned" className="a-stat"><span>Driver assigned</span><strong>{counts.driver_assigned}</strong></Link>
        <Link to="/admin/bookings?status=active" className="a-stat is-live"><span>On the road now</span><strong>{onRoad}</strong></Link>
        <Link to="/admin/bookings?status=completed" className="a-stat"><span>Completed</span><strong>{counts.completed}</strong></Link>
        <Link to="/admin/bookings?status=cancelled" className="a-stat is-muted"><span>Cancelled</span><strong>{counts.cancelled}</strong></Link>
      </section>
      {onRoad > 0 && <p className="p-muted p-small">On the road: {['en_route_to_pickup', 'arrived_at_pickup', 'in_progress'].filter(s => counts[s]).map(s => `${statusLabel(s)} ${counts[s]}`).join(' · ')}</p>}

      <section className="p-section">
        <h2 className="p-section-title"><CalendarClock aria-hidden="true" /> Today's trips <span>{data.today.length}</span></h2>
        <BookingTable bookings={data.today} emptyText="No trips scheduled for today." />
      </section>
      <section className="p-section">
        <h2 className="p-section-title">Needs confirmation or a driver <span>{data.pending.length}</span></h2>
        <BookingTable bookings={data.pending} emptyText="Nothing waiting — every booking is confirmed and dispatched." />
      </section>
      <section className="p-section">
        <h2 className="p-section-title">Next 7 days <span>{data.upcoming.length}</span></h2>
        <BookingTable bookings={data.upcoming} emptyText="No trips in the next 7 days." />
      </section>
      {data.unpaid.length > 0 && (
        <section className="p-section">
          <h2 className="p-section-title">Completed but unpaid <span>{data.unpaid.length}</span></h2>
          <BookingTable bookings={data.unpaid} />
        </section>
      )}
    </>
  )
}

export default function AdminApp() {
  const { pathname } = useLocation()
  return (
    <PortalShell eyebrow="Lion's Route · Admin" title="Operations" italic="desk." className="portal-admin">
      <nav className="a-nav" aria-label="Admin sections">
        {sections.map(([label, to, Icon, isActive]) => (
          <NavLink key={to} to={to} end className={() => (isActive(pathname) ? 'active' : '')} aria-current={isActive(pathname) ? 'page' : undefined}>
            <Icon aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="bookings/new" element={<AdminNewBooking />} />
        <Route path="bookings/:orderNumber" element={<AdminBookingDetail />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="vehicles" element={<AdminVehicles />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="clients/:id" element={<AdminClientDetail />} />
        <Route path="*" element={<Empty title="Page not found"><Link to="/admin">Back to dashboard</Link></Empty>} />
      </Routes>
    </PortalShell>
  )
}
