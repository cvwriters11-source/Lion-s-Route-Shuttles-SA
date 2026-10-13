import React, { useState } from 'react'
import { Car, Clock, Luggage, MapPin, MessageCircle, Navigation, Phone, Plane, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { must, useAsync, useRealtime } from '../../lib/hooks'
import {
  ACTIVE_TRIP_STATUSES, BOOKING_SELECT, DRIVER_NEXT, errorMessage, formatDate, formatMoney, formatTime, isoToSastDate,
  mapsLink, paymentMethodLabel, sastToday, serviceLabel, telLink, whatsappLink,
} from '../../lib/booking'
import { Empty, ErrorNote, LiveIndicator, Loading, PortalShell, StatusBadge } from '../../components/portal'

function AdvanceButton({ booking, onDone }) {
  const step = DRIVER_NEXT[booking.status]
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!step) return null

  async function advance() {
    if (step.next === 'completed' && !confirming) return setConfirming(true)
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('advance_booking_status', { p_booking_id: booking.id, p_next_status: step.next, p_note: note.trim() || null })
    setBusy(false)
    setConfirming(false)
    if (rpcError) {
      setError(errorMessage(rpcError))
      return onDone()
    }
    setNote('')
    setShowNote(false)
    return onDone()
  }

  return (
    <div className="d-advance">
      {showNote ? (
        <label className="d-note">
          <span>Note for this update (optional)</span>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="e.g. Traffic on the N1, 10 min delay" />
        </label>
      ) : (
        <button type="button" className="p-link-button" onClick={() => setShowNote(true)}>+ Add a note</button>
      )}
      {error && <ErrorNote error={error} />}
      <button type="button" className={`d-advance-button ${step.next === 'completed' ? 'is-complete' : ''}`} onClick={advance} disabled={busy}>
        {busy ? 'Updating…' : confirming ? 'Tap again to confirm: trip completed' : step.label}
      </button>
      {confirming && !busy && <button type="button" className="p-link-button" onClick={() => setConfirming(false)}>Not yet</button>}
    </div>
  )
}

function JobCard({ job, onChanged }) {
  const active = ACTIVE_TRIP_STATUSES.includes(job.status)
  return (
    <article className={`p-card d-job ${active ? 'is-active' : ''}`}>
      <header className="d-job-head">
        <div className="d-time"><Clock aria-hidden="true" /> <strong>{formatTime(job.pickup_at)}</strong> <span>{formatDate(job.pickup_at)}</span></div>
        <StatusBadge status={job.status} />
      </header>
      <p className="d-order">{job.order_number} · {serviceLabel(job.service_type)}</p>
      <ol className="d-route">
        <li><span>Pickup</span><a href={mapsLink(job.pickup_location)} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" /> {job.pickup_location}</a></li>
        <li><span>Drop-off</span><a href={mapsLink(job.dropoff_location)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" /> {job.dropoff_location}</a></li>
      </ol>
      <ul className="d-facts">
        <li><Users aria-hidden="true" /> {job.passengers} passenger{job.passengers === 1 ? '' : 's'}</li>
        <li><Luggage aria-hidden="true" /> {job.luggage} bag{job.luggage === 1 ? '' : 's'}</li>
        {job.flight_number && <li><Plane aria-hidden="true" /> {job.flight_number}</li>}
        {job.vehicle && <li><Car aria-hidden="true" /> {job.vehicle.name} · {job.vehicle.registration}</li>}
      </ul>
      {job.notes && <p className="d-notes"><strong>Client notes:</strong> {job.notes}</p>}
      <div className="d-client">
        <div><span className="p-muted">Client</span><strong>{job.client_name}</strong></div>
        <div className="d-contact">
          <a className="d-icon-button" href={telLink(job.client_phone)} aria-label={`Call ${job.client_name}`}><Phone aria-hidden="true" /> Call</a>
          <a className="d-icon-button d-whatsapp" href={whatsappLink(job.client_phone, `Hello ${job.client_name}, this is your Lion's Route driver for booking ${job.order_number}.`)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${job.client_name}`}><MessageCircle aria-hidden="true" /> WhatsApp</a>
        </div>
      </div>
      <p className="d-payment">
        {job.payment_status === 'paid'
          ? <>Paid{job.payment_method ? ` (${paymentMethodLabel(job.payment_method)})` : ''} — nothing to collect.</>
          : <>Payment outstanding{job.quoted_price != null ? <>: <strong>{formatMoney(job.quoted_price)}</strong></> : ''}. Collect only if arranged with the office.</>}
      </p>
      <AdvanceButton booking={job} onDone={onChanged} />
    </article>
  )
}

const TABS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['done', 'Completed']]

export default function DriverJobs() {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState('today')
  const { data, error, loading, reload } = useAsync(
    () => must(supabase.from('bookings').select(BOOKING_SELECT).eq('driver_id', user.id).order('pickup_at', { ascending: true })),
    [user.id],
  )
  const live = useRealtime('driver-jobs', [{ event: '*', table: 'bookings', filter: `driver_id=eq.${user.id}` }], reload)

  const jobs = data || []
  const today = sastToday()
  const open = jobs.filter(j => !['completed', 'cancelled'].includes(j.status))
  const groups = {
    today: open.filter(j => ACTIVE_TRIP_STATUSES.includes(j.status) || isoToSastDate(j.pickup_at) <= today)
      .sort((a, b) => ACTIVE_TRIP_STATUSES.includes(b.status) - ACTIVE_TRIP_STATUSES.includes(a.status)),
    upcoming: open.filter(j => !ACTIVE_TRIP_STATUSES.includes(j.status) && isoToSastDate(j.pickup_at) > today),
    done: jobs.filter(j => ['completed', 'cancelled'].includes(j.status)).reverse(),
  }
  const list = groups[tab]

  return (
    <PortalShell eyebrow={`Driver · ${profile?.full_name || ''}`} title="My" italic="jobs." className="portal-driver" actions={<LiveIndicator status={live} />}>
      <div className="d-tabs" role="tablist" aria-label="Jobs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
            {label} <span>{groups[key].length}</span>
          </button>
        ))}
      </div>
      {error && <ErrorNote error={errorMessage(error)} onRetry={reload} />}
      {loading && !data ? <Loading label="Loading your jobs…" /> : list.length ? (
        <div className="d-jobs">{list.map(job => tab === 'done' ? (
          <article key={job.id} className="p-card d-job is-done">
            <header className="d-job-head"><div className="d-time"><strong>{formatDate(job.pickup_at)}</strong> <span>{formatTime(job.pickup_at)}</span></div><StatusBadge status={job.status} /></header>
            <p className="d-order">{job.order_number} · {job.client_name}</p>
            <p className="p-muted">{job.pickup_location} → {job.dropoff_location}</p>
          </article>
        ) : <JobCard key={job.id} job={job} onChanged={reload} />)}</div>
      ) : (
        <Empty title={tab === 'today' ? 'No jobs for today' : tab === 'upcoming' ? 'No upcoming jobs' : 'No completed jobs yet'}>
          <p>{tab === 'done' ? 'Completed trips will be listed here.' : 'New jobs appear here automatically when the office dispatches you.'}</p>
        </Empty>
      )}
    </PortalShell>
  )
}
