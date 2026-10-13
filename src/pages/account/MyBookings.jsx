import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, MapPin, Plus, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { must, useAsync, useRealtime } from '../../lib/hooks'
import { BOOKING_SELECT, OPEN_STATUSES, canClientCancel, errorMessage, formatDateTime, serviceLabel } from '../../lib/booking'
import { Empty, ErrorNote, Field, Loading, PaymentBadge, PortalShell, StatusBadge } from '../../components/portal'

function CancelBooking({ booking, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!open) return <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => setOpen(true)}>Cancel booking</button>
  async function confirm() {
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('cancel_booking', { p_booking_id: booking.id, p_reason: reason || null })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    setOpen(false)
    return onDone()
  }
  return (
    <div className="p-inline-confirm">
      <Field label="Reason (optional)" id={`cancel-${booking.id}`}><input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></Field>
      <ErrorNote error={error} />
      <div className="p-actions">
        <button type="button" className="p-btn p-btn-danger p-btn-small" onClick={confirm} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel booking'}</button>
        <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => setOpen(false)} disabled={busy}>Keep booking</button>
      </div>
    </div>
  )
}

export function BookingCard({ booking, onChanged }) {
  return (
    <article className="p-card p-booking-card">
      <header>
        <div>
          <Link className="p-order-link" to={`/account/bookings/${booking.order_number}`}>{booking.order_number}</Link>
          <span className="p-muted">{serviceLabel(booking.service_type)}</span>
        </div>
        <StatusBadge status={booking.status} />
      </header>
      <p className="p-route"><MapPin aria-hidden="true" /> <span>{booking.pickup_location} <b aria-hidden="true">→</b><span className="sr-only"> to </span> {booking.dropoff_location}</span></p>
      <dl className="p-meta">
        <div><dt>Pickup</dt><dd>{formatDateTime(booking.pickup_at)}</dd></div>
        <div><dt>Passengers</dt><dd>{booking.passengers} · {booking.luggage} bags</dd></div>
        <div><dt>Payment</dt><dd><PaymentBadge booking={booking} /></dd></div>
      </dl>
      {booking.driver && (
        <p className="p-driver"><UserRound aria-hidden="true" /> {booking.driver.full_name}{booking.vehicle && <><Car aria-hidden="true" /> {booking.vehicle.name} · {booking.vehicle.registration}</>}</p>
      )}
      <div className="p-actions">
        <Link className="p-btn p-btn-dark p-btn-small" to={`/account/bookings/${booking.order_number}`}>Track booking</Link>
        {canClientCancel(booking) && <CancelBooking booking={booking} onDone={onChanged} />}
      </div>
    </article>
  )
}

export default function MyBookings() {
  const { user, profile } = useAuth()
  const { data, error, loading, reload } = useAsync(
    () => must(supabase.from('bookings').select(BOOKING_SELECT).eq('client_id', user.id).order('pickup_at', { ascending: true })),
    [user.id],
  )
  useRealtime('my-bookings', [{ event: '*', table: 'bookings', filter: `client_id=eq.${user.id}` }], reload)

  const bookings = data || []
  const upcoming = bookings.filter(b => OPEN_STATUSES.includes(b.status))
  const past = bookings.filter(b => !OPEN_STATUSES.includes(b.status)).reverse()

  return (
    <PortalShell eyebrow={`Welcome${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`} title="My" italic="bookings." actions={<Link className="p-btn p-btn-gold" to="/book"><Plus aria-hidden="true" /> New booking</Link>}>
      {error && <ErrorNote error={errorMessage(error)} onRetry={reload} />}
      {loading && !data ? <Loading label="Loading your bookings…" /> : !bookings.length && !error ? (
        <Empty title="No bookings yet">
          <p>When you book a trip it will appear here with its order number and live status.</p>
          <Link className="p-btn p-btn-dark" to="/book">Book your first trip</Link>
        </Empty>
      ) : (
        <>
          <section className="p-section" aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="p-section-title">Upcoming &amp; active <span>{upcoming.length}</span></h2>
            {upcoming.length ? <div className="p-card-grid">{upcoming.map(b => <BookingCard key={b.id} booking={b} onChanged={reload} />)}</div> : <p className="p-muted">No upcoming trips.</p>}
          </section>
          {past.length > 0 && (
            <section className="p-section" aria-labelledby="past-title">
              <h2 id="past-title" className="p-section-title">Past &amp; cancelled <span>{past.length}</span></h2>
              <div className="p-card-grid">{past.map(b => <BookingCard key={b.id} booking={b} onChanged={reload} />)}</div>
            </section>
          )}
        </>
      )}
    </PortalShell>
  )
}
