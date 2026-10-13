import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { Car, MessageCircle, Phone, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { must, useAsync, useRealtime } from '../../lib/hooks'
import { contact } from '../../data'
import {
  BOOKING_SELECT, STATUS_DESCRIPTIONS, errorMessage, formatDateTime, formatMoney, serviceLabel, telLink, whatsappLink,
} from '../../lib/booking'
import {
  ActivityLog, BackLink, Empty, ErrorNote, LiveIndicator, Loading, PaymentBadge, PortalShell, StatusBadge, StatusTimeline,
} from '../../components/portal'

async function loadTracking(orderNumber) {
  const booking = await must(supabase.from('bookings').select(BOOKING_SELECT).eq('order_number', orderNumber).maybeSingle())
  if (!booking) return { booking: null, history: [] }
  const history = await must(supabase.from('booking_status_history').select('*').eq('booking_id', booking.id).order('created_at').order('id'))
  return { booking, history }
}

export default function TrackBooking() {
  const { orderNumber } = useParams()
  const { data, error, loading, reload } = useAsync(() => loadTracking(orderNumber), [orderNumber])
  const booking = data?.booking
  const live = useRealtime(`track-${booking?.id}`, [
    { event: 'UPDATE', table: 'bookings', filter: `id=eq.${booking?.id}` },
    { event: 'INSERT', table: 'booking_status_history', filter: `booking_id=eq.${booking?.id}` },
  ], reload, Boolean(booking?.id))

  if (loading && !data) return <main className="portal"><Loading label="Loading your booking…" /></main>
  if (error && !data) return <main className="portal"><ErrorNote error={errorMessage(error)} onRetry={reload} /></main>
  if (!booking) {
    return (
      <PortalShell eyebrow="Track a booking" title="Booking" italic="not found." narrow>
        <Empty title={`We could not find ${orderNumber}`}>
          <p>Check the order number, or make sure you are signed in with the account used to book.</p>
          <Link className="p-btn p-btn-dark" to="/account">My bookings</Link>
        </Empty>
      </PortalShell>
    )
  }

  return (
    <PortalShell eyebrow={`Order ${booking.order_number}`} title="Track your" italic="journey." actions={<LiveIndicator status={live} />}>
      <BackLink to="/account">My bookings</BackLink>
      {error && <ErrorNote error={errorMessage(error)} onRetry={reload} />}
      <div className="p-track">
        <section className="p-card p-track-status" aria-live="polite">
          <div className="p-track-current">
            <StatusBadge status={booking.status} />
            <p>{STATUS_DESCRIPTIONS[booking.status]}</p>
            {booking.cancellation_reason && <p className="p-muted">Reason: {booking.cancellation_reason}</p>}
          </div>
          <StatusTimeline booking={booking} history={data.history} />
        </section>

        <aside className="p-track-side">
          <section className="p-card">
            <h2 className="p-card-title">Trip details</h2>
            <dl className="p-summary">
              <div><dt>Service</dt><dd>{serviceLabel(booking.service_type)}</dd></div>
              <div><dt>Pickup</dt><dd>{booking.pickup_location}</dd></div>
              <div><dt>Drop-off</dt><dd>{booking.dropoff_location}</dd></div>
              <div><dt>When</dt><dd>{formatDateTime(booking.pickup_at)}</dd></div>
              <div><dt>Passengers</dt><dd>{booking.passengers} · {booking.luggage} bags</dd></div>
              {booking.flight_number && <div><dt>Flight</dt><dd>{booking.flight_number}</dd></div>}
              {booking.notes && <div><dt>Requests</dt><dd>{booking.notes}</dd></div>}
              <div><dt>Price</dt><dd>{booking.quoted_price != null ? formatMoney(booking.quoted_price) : 'Quote to follow'}</dd></div>
              <div><dt>Payment</dt><dd><PaymentBadge booking={booking} /></dd></div>
            </dl>
          </section>

          <section className="p-card">
            <h2 className="p-card-title">Your driver</h2>
            {booking.driver ? (
              <>
                <p className="p-driver"><UserRound aria-hidden="true" /> {booking.driver.full_name}</p>
                {booking.vehicle && <p className="p-driver"><Car aria-hidden="true" /> {booking.vehicle.name} · <strong>{booking.vehicle.registration}</strong></p>}
                {booking.driver.phone && !['completed', 'cancelled'].includes(booking.status) && (
                  <div className="p-actions">
                    <a className="p-btn p-btn-ghost p-btn-small" href={telLink(booking.driver.phone)}><Phone aria-hidden="true" /> Call driver</a>
                    <a className="p-btn p-btn-ghost p-btn-small" href={whatsappLink(booking.driver.phone, `Hi, this is about Lion's Route booking ${booking.order_number}.`)} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp</a>
                  </div>
                )}
              </>
            ) : <p className="p-muted">Your driver and vehicle will appear here once your trip is dispatched.</p>}
          </section>

          <section className="p-card">
            <h2 className="p-card-title">Updates</h2>
            <ActivityLog history={data.history} />
            <p className="p-muted p-small">Questions? Call or WhatsApp us on <a href={contact.phoneLink}>{contact.phone}</a> and quote {booking.order_number}.</p>
          </section>
        </aside>
      </div>
    </PortalShell>
  )
}
