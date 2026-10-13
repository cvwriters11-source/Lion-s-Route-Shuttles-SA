import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MessageCircle, Phone, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { must, useAsync, useRealtime } from '../../lib/hooks'
import {
  ACTIVE_TRIP_STATUSES, ALL_STATUSES, BOOKING_SELECT, PAYMENT_METHODS, SERVICE_TYPES, cleanSearch, emptyTrip, errorMessage,
  formatDateTime, formatMoney, rowToTrip, sastDayStartIso, sastToday, statusLabel, telLink, tripToRow, validateContact,
  validateTrip, whatsappLink,
} from '../../lib/booking'
import {
  ActivityLog, BackLink, ErrorNote, Field, LiveIndicator, Loading, Notice, PaymentBadge, StatusBadge, StatusTimeline, TripFields,
} from '../../components/portal'
import BookingTable from './BookingTable'

const PAGE_SIZE = 200

// ---------------------------------------------------------------------------
// Bookings list
// ---------------------------------------------------------------------------
export function AdminBookings() {
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') || '',
    status: params.get('status') || '',
    service: params.get('service') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    sort: params.get('sort') || 'newest',
  }
  const [search, setSearch] = useState(filters.q)
  useEffect(() => setSearch(filters.q), [filters.q])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase.from('bookings').select(BOOKING_SELECT, { count: 'exact' })
    if (filters.status === 'active') query = query.in('status', ACTIVE_TRIP_STATUSES)
    else if (filters.status) query = query.eq('status', filters.status)
    if (filters.service) query = query.eq('service_type', filters.service)
    if (filters.from) query = query.gte('pickup_at', sastDayStartIso(filters.from))
    if (filters.to) query = query.lt('pickup_at', new Date(new Date(sastDayStartIso(filters.to)).getTime() + 86400000).toISOString())
    const term = cleanSearch(filters.q)
    if (term) query = query.or(`order_number.ilike.*${term}*,client_name.ilike.*${term}*,client_phone.ilike.*${term}*`)
    query = filters.sort === 'pickup' ? query.order('pickup_at', { ascending: true }) : query.order('created_at', { ascending: false })
    const { data: rows, count, error: queryError } = await query.range(0, PAGE_SIZE - 1)
    if (queryError) throw queryError
    return { rows, count }
  }, [params.toString()])
  const live = useRealtime('admin-bookings', [{ event: '*', table: 'bookings' }], reload)

  const hasFilters = Object.entries(filters).some(([k, v]) => k !== 'sort' && v)

  return (
    <>
      <form className="a-filters p-form" role="search" onSubmit={e => { e.preventDefault(); setFilter('q', search.trim()) }}>
        <div className="a-search">
          <Field label="Search" id="f-search">
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Order number, client name or phone" />
          </Field>
          <button type="submit" className="p-btn p-btn-dark" aria-label="Search bookings"><Search aria-hidden="true" /></button>
        </div>
        <Field label="Status" id="f-status">
          <select value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">On the road now</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Service" id="f-service">
          <select value={filters.service} onChange={e => setFilter('service', e.target.value)}>
            <option value="">All services</option>
            {SERVICE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Pickup from" id="f-from"><input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} /></Field>
        <Field label="Pickup to" id="f-to"><input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} /></Field>
        <Field label="Sort" id="f-sort">
          <select value={filters.sort} onChange={e => setFilter('sort', e.target.value === 'newest' ? '' : e.target.value)}>
            <option value="newest">Newest bookings first</option>
            <option value="pickup">Pickup date (soonest first)</option>
          </select>
        </Field>
      </form>
      <div className="a-toolbar">
        <span className="p-muted">{data ? `${data.count ?? data.rows.length} booking${data.count === 1 ? '' : 's'}${data.count > PAGE_SIZE ? ` (showing first ${PAGE_SIZE})` : ''}` : ''}</span>
        {hasFilters && <button type="button" className="p-link-button" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
        <button type="button" className="p-link-button" onClick={() => { const next = new URLSearchParams(params); next.set('from', sastToday()); next.set('to', sastToday()); setParams(next, { replace: true }) }}>Today</button>
        <LiveIndicator status={live} />
        <Link className="p-btn p-btn-gold p-btn-small" to="/admin/bookings/new">+ New booking</Link>
      </div>
      {error && <ErrorNote error={errorMessage(error)} onRetry={reload} />}
      {loading && !data ? <Loading label="Loading bookings…" /> : data && <BookingTable bookings={data.rows} emptyText={hasFilters ? 'No bookings match these filters.' : 'No bookings yet.'} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Create a booking on behalf of a client
// ---------------------------------------------------------------------------
function ClientPicker({ clients, value, onChange }) {
  const [term, setTerm] = useState('')
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase()
    return (clients || []).filter(c => !t || [c.full_name, c.email, c.phone].some(v => (v || '').toLowerCase().includes(t))).slice(0, 50)
  }, [clients, term])
  return (
    <div className="a-client-picker">
      <Field label="Find client" id="nb-client-search"><input type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Name, email or phone" /></Field>
      <div className="a-client-options" role="radiogroup" aria-label="Client account">
        {filtered.map(c => (
          <label key={c.id} className={value === c.id ? 'is-selected' : ''}>
            <input type="radio" name="nb-client" checked={value === c.id} onChange={() => onChange(c)} />
            <span><strong>{c.full_name || '(no name)'}</strong><small>{c.email} · {c.phone || 'no phone'}</small></span>
          </label>
        ))}
        {!filtered.length && <p className="p-muted">No matching client accounts.</p>}
      </div>
    </div>
  )
}

export function AdminNewBooking() {
  const navigate = useNavigate()
  const clients = useAsync(() => must(supabase.from('profiles').select('id, full_name, email, phone').eq('role', 'client').order('full_name').limit(1000)), [])
  const [mode, setMode] = useState('existing')
  const [clientId, setClientId] = useState('')
  const [contactDetails, setContactDetails] = useState({ client_name: '', client_phone: '', client_email: '' })
  const [trip, setTrip] = useState(emptyTrip())
  const [extra, setExtra] = useState({ status: 'confirmed', quoted_price: '', payment_status: 'unpaid', payment_method: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pickClient = client => {
    setClientId(client.id)
    setContactDetails({ client_name: client.full_name || '', client_phone: client.phone || '', client_email: client.email || '' })
  }

  async function submit(event) {
    event.preventDefault()
    const nextErrors = { ...validateTrip(trip, { requireFuture: false }), ...validateContact(contactDetails) }
    if (mode === 'existing' && !clientId) nextErrors.client = 'Choose a client account, or switch to a new phone/WhatsApp client.'
    if (extra.quoted_price !== '' && !(Number(extra.quoted_price) >= 0)) nextErrors.quoted_price = 'Enter a valid amount.'
    if (extra.payment_status === 'paid' && !extra.payment_method) nextErrors.payment_method = 'Choose how it was paid.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    setError('')
    const { data, error: insertError } = await supabase.from('bookings').insert({
      ...tripToRow(trip),
      client_id: mode === 'existing' ? clientId : null,
      client_name: contactDetails.client_name.trim(),
      client_phone: contactDetails.client_phone.trim(),
      client_email: contactDetails.client_email.trim() || null,
      status: extra.status,
      quoted_price: extra.quoted_price === '' ? null : Number(extra.quoted_price),
      payment_status: extra.payment_status,
      payment_method: extra.payment_method || null,
    }).select('order_number').single()
    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    return navigate(`/admin/bookings/${data.order_number}`, { state: { created: true } })
  }

  return (
    <form className="p-form a-new-booking" onSubmit={submit} noValidate>
      <section className="p-card">
        <h2 className="p-card-title">1. Client</h2>
        <div className="p-tabs" role="tablist" aria-label="Client type">
          <button type="button" role="tab" aria-selected={mode === 'existing'} className={mode === 'existing' ? 'is-active' : ''} onClick={() => setMode('existing')}>Existing client account</button>
          <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'is-active' : ''} onClick={() => { setMode('new'); setClientId(''); setContactDetails({ client_name: '', client_phone: '', client_email: '' }) }}>New phone / WhatsApp client</button>
        </div>
        {mode === 'existing' ? (
          clients.loading && !clients.data ? <Loading label="Loading clients…" /> : <>
            <ClientPicker clients={clients.data} value={clientId} onChange={pickClient} />
            {errors.client && <p className="p-error">{errors.client}</p>}
          </>
        ) : (
          <Notice>The booking is saved with these contact details. If the client registers later, you can link the booking to their account from the booking page.</Notice>
        )}
        <div className="p-grid-3">
          <Field label="Client name *" id="nb-name" error={errors.client_name}><input value={contactDetails.client_name} onChange={e => setContactDetails({ ...contactDetails, client_name: e.target.value })} /></Field>
          <Field label="Phone / WhatsApp *" id="nb-phone" error={errors.client_phone}><input type="tel" value={contactDetails.client_phone} onChange={e => setContactDetails({ ...contactDetails, client_phone: e.target.value })} /></Field>
          <Field label="Email" id="nb-email" error={errors.client_email}><input type="email" value={contactDetails.client_email} onChange={e => setContactDetails({ ...contactDetails, client_email: e.target.value })} /></Field>
        </div>
      </section>
      <section className="p-card">
        <h2 className="p-card-title">2. Trip</h2>
        <TripFields trip={trip} errors={errors} onChange={setTrip} idPrefix="nb" />
      </section>
      <section className="p-card">
        <h2 className="p-card-title">3. Status &amp; price</h2>
        <div className="p-grid-2">
          <Field label="Initial status" id="nb-status">
            <select value={extra.status} onChange={e => setExtra({ ...extra, status: e.target.value })}>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending (needs confirming)</option>
            </select>
          </Field>
          <Field label="Quoted price (ZAR)" id="nb-price" error={errors.quoted_price}><input type="number" inputMode="decimal" min="0" step="0.01" value={extra.quoted_price} onChange={e => setExtra({ ...extra, quoted_price: e.target.value })} /></Field>
          <Field label="Payment" id="nb-payment">
            <select value={extra.payment_status} onChange={e => setExtra({ ...extra, payment_status: e.target.value })}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
          <Field label="Payment method" id="nb-method" error={errors.payment_method}>
            <select value={extra.payment_method} onChange={e => setExtra({ ...extra, payment_method: e.target.value })}>
              <option value="">—</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>
        <p className="p-muted p-small">Assign a driver from the booking page after saving.</p>
        <ErrorNote error={error} />
        <button className="p-btn p-btn-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create booking'}</button>
      </section>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Booking detail
// ---------------------------------------------------------------------------
async function loadDetail(orderNumber) {
  const booking = await must(supabase.from('bookings')
    .select(`${BOOKING_SELECT}, client:profiles!bookings_client_id_fkey(id, full_name, email, phone)`)
    .eq('order_number', orderNumber).maybeSingle())
  if (!booking) return { booking: null }
  const [history, note, drivers, vehicles] = await Promise.all([
    must(supabase.from('booking_status_history').select('*').eq('booking_id', booking.id).order('created_at').order('id')),
    must(supabase.from('booking_admin_notes').select('notes, updated_at').eq('booking_id', booking.id).maybeSingle()),
    must(supabase.from('profiles').select('id, full_name, phone, active').eq('role', 'driver').order('full_name')),
    must(supabase.from('vehicles').select('*').order('name')),
  ])
  return { booking, history, note, drivers, vehicles }
}

function useAction(onDone) {
  const [state, setState] = useState({ busy: false, error: '', message: '' })
  const run = async (fn, message = 'Saved.') => {
    setState({ busy: true, error: '', message: '' })
    const { error } = await fn()
    if (error) {
      setState({ busy: false, error: errorMessage(error), message: '' })
      return false
    }
    setState({ busy: false, error: '', message })
    onDone()
    return true
  }
  return [state, run]
}

function ActionResult({ state }) {
  return <>{state.error && <ErrorNote error={state.error} />}{state.message && <p className="p-success" role="status">{state.message}</p>}</>
}

function StatusPanel({ booking, onDone }) {
  const [state, run] = useAction(onDone)
  const [override, setOverride] = useState('')
  const [note, setNote] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const closed = ['completed', 'cancelled'].includes(booking.status)
  return (
    <section className="p-card">
      <h2 className="p-card-title">Status</h2>
      <div className="p-actions">
        {booking.status === 'pending' && (
          <button type="button" className="p-btn p-btn-dark" disabled={state.busy} onClick={() => run(() => supabase.rpc('admin_set_booking_status', { p_booking_id: booking.id, p_status: 'confirmed', p_note: note.trim() || 'Booking confirmed' }), 'Booking confirmed.')}>Confirm booking</button>
        )}
        {!closed && !cancelling && <button type="button" className="p-btn p-btn-ghost" onClick={() => setCancelling(true)}>Cancel booking</button>}
      </div>
      {cancelling && (
        <div className="p-inline-confirm">
          <Field label="Cancellation reason" id="a-cancel-reason"><input value={note} onChange={e => setNote(e.target.value)} maxLength={500} /></Field>
          <div className="p-actions">
            <button type="button" className="p-btn p-btn-danger p-btn-small" disabled={state.busy} onClick={async () => { if (await run(() => supabase.rpc('cancel_booking', { p_booking_id: booking.id, p_reason: note.trim() || null }), 'Booking cancelled.')) { setCancelling(false); setNote('') } }}>Yes, cancel</button>
            <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => setCancelling(false)}>Keep booking</button>
          </div>
        </div>
      )}
      <details className="a-override">
        <summary>Override status</summary>
        <div className="p-grid-2">
          <Field label="New status" id="a-override-status">
            <select value={override} onChange={e => setOverride(e.target.value)}>
              <option value="">Choose…</option>
              {ALL_STATUSES.filter(s => s !== booking.status).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </Field>
          <Field label="Note (shown to the client)" id="a-override-note"><input value={note} onChange={e => setNote(e.target.value)} maxLength={500} /></Field>
        </div>
        <button type="button" className="p-btn p-btn-dark p-btn-small" disabled={!override || state.busy} onClick={async () => { if (await run(() => supabase.rpc('admin_set_booking_status', { p_booking_id: booking.id, p_status: override, p_note: note.trim() || null }), 'Status updated.')) { setOverride(''); setNote('') } }}>Apply status</button>
      </details>
      <ActionResult state={state} />
    </section>
  )
}

function DispatchPanel({ booking, drivers, vehicles, onDone }) {
  const [state, run] = useAction(onDone)
  const [driverId, setDriverId] = useState(booking.driver_id || '')
  const [vehicleId, setVehicleId] = useState(booking.vehicle_id || '')
  const [note, setNote] = useState('')
  useEffect(() => { setDriverId(booking.driver_id || ''); setVehicleId(booking.vehicle_id || '') }, [booking.driver_id, booking.vehicle_id])
  const closed = ['completed', 'cancelled'].includes(booking.status)
  const activeDrivers = drivers.filter(d => d.active || d.id === booking.driver_id)
  const activeVehicles = vehicles.filter(v => v.active || v.id === booking.vehicle_id)
  const vehicle = vehicles.find(v => v.id === vehicleId)
  const changed = driverId !== (booking.driver_id || '') || vehicleId !== (booking.vehicle_id || '')
  return (
    <section className="p-card">
      <h2 className="p-card-title">Dispatch</h2>
      {booking.driver ? <p className="p-driver">Assigned: <strong>{booking.driver.full_name}</strong>{booking.vehicle && <> · {booking.vehicle.name} ({booking.vehicle.registration})</>}</p> : <p className="p-muted">No driver assigned yet.</p>}
      {closed ? <p className="p-muted">This booking is {statusLabel(booking.status).toLowerCase()}.</p> : (
        <>
          {!activeDrivers.length && <Notice tone="warning">No active drivers yet. <Link to="/admin/drivers">Add a driver</Link> first.</Notice>}
          <div className="p-grid-2">
            <Field label="Driver" id="a-driver">
              <select value={driverId} onChange={e => setDriverId(e.target.value)}>
                <option value="">Choose a driver…</option>
                {activeDrivers.map(d => <option key={d.id} value={d.id}>{d.full_name}{d.active ? '' : ' (inactive)'}</option>)}
              </select>
            </Field>
            <Field label="Vehicle" id="a-vehicle">
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                <option value="">No vehicle</option>
                {activeVehicles.map(v => <option key={v.id} value={v.id}>{v.name} · {v.registration} · {v.seats} seats</option>)}
              </select>
            </Field>
          </div>
          {vehicle && vehicle.seats < booking.passengers && <Notice tone="warning">{vehicle.name} has {vehicle.seats} seats but the booking is for {booking.passengers} passengers.</Notice>}
          <Field label="Dispatch note (optional, shown to the client)" id="a-dispatch-note"><input value={note} onChange={e => setNote(e.target.value)} maxLength={500} /></Field>
          <div className="p-actions">
            <button type="button" className="p-btn p-btn-dark" disabled={!driverId || !changed || state.busy}
              onClick={() => run(() => supabase.rpc('assign_driver', { p_booking_id: booking.id, p_driver_id: driverId, p_vehicle_id: vehicleId || null, p_note: note.trim() || null }), booking.driver_id ? 'Driver reassigned.' : 'Driver dispatched.')}>
              {booking.driver_id ? 'Reassign driver' : 'Assign driver'}
            </button>
            {booking.driver_id && ['pending', 'confirmed', 'driver_assigned'].includes(booking.status) && (
              <button type="button" className="p-btn p-btn-ghost" disabled={state.busy} onClick={() => run(() => supabase.rpc('assign_driver', { p_booking_id: booking.id, p_driver_id: null, p_vehicle_id: null, p_note: note.trim() || null }), 'Driver removed.')}>Unassign</button>
            )}
          </div>
        </>
      )}
      <ActionResult state={state} />
    </section>
  )
}

function PaymentPanel({ booking, onDone }) {
  const [state, run] = useAction(onDone)
  const [form, setForm] = useState({ quoted_price: booking.quoted_price ?? '', payment_status: booking.payment_status, payment_method: booking.payment_method || '' })
  useEffect(() => setForm({ quoted_price: booking.quoted_price ?? '', payment_status: booking.payment_status, payment_method: booking.payment_method || '' }), [booking.quoted_price, booking.payment_status, booking.payment_method])
  const [error, setError] = useState('')
  function save(overrides = {}) {
    const next = { ...form, ...overrides }
    if (next.quoted_price !== '' && !(Number(next.quoted_price) >= 0)) return setError('Enter a valid price.')
    if (next.payment_status === 'paid' && !next.payment_method) return setError('Choose the payment method.')
    setError('')
    setForm(next)
    return run(() => supabase.from('bookings').update({
      quoted_price: next.quoted_price === '' ? null : Number(next.quoted_price),
      payment_status: next.payment_status,
      payment_method: next.payment_method || null,
    }).eq('id', booking.id), next.payment_status === 'paid' && booking.payment_status !== 'paid' ? 'Marked as paid.' : 'Price and payment saved.')
  }
  return (
    <section className="p-card">
      <h2 className="p-card-title">Price &amp; payment</h2>
      <p><PaymentBadge booking={booking} />{booking.paid_at && <span className="p-muted"> on {formatDateTime(booking.paid_at)}</span>}</p>
      <div className="p-grid-3">
        <Field label="Quoted price (ZAR)" id="a-price"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.quoted_price} onChange={e => setForm({ ...form, quoted_price: e.target.value })} /></Field>
        <Field label="Payment status" id="a-pay-status">
          <select value={form.payment_status} onChange={e => setForm({ ...form, payment_status: e.target.value })}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </Field>
        <Field label="Method" id="a-pay-method">
          <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
            <option value="">—</option>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
      </div>
      {error && <ErrorNote error={error} />}
      <div className="p-actions">
        <button type="button" className="p-btn p-btn-dark p-btn-small" disabled={state.busy} onClick={() => save()}>Save</button>
        {booking.payment_status !== 'paid' && (
          <>
            <button type="button" className="p-btn p-btn-gold p-btn-small" disabled={state.busy} onClick={() => save({ payment_status: 'paid', payment_method: 'cash' })}>Mark paid · cash</button>
            <button type="button" className="p-btn p-btn-gold p-btn-small" disabled={state.busy} onClick={() => save({ payment_status: 'paid', payment_method: 'eft' })}>Mark paid · EFT</button>
          </>
        )}
      </div>
      <ActionResult state={state} />
    </section>
  )
}

function NotesPanel({ booking, note, onDone }) {
  const [state, run] = useAction(onDone)
  const [text, setText] = useState(note?.notes || '')
  useEffect(() => setText(note?.notes || ''), [note?.notes])
  return (
    <section className="p-card">
      <h2 className="p-card-title">Internal notes</h2>
      <Field label="Only visible to admins" id="a-notes"><textarea rows="4" value={text} onChange={e => setText(e.target.value)} maxLength={4000} /></Field>
      {note?.updated_at && <p className="p-muted p-small">Last updated {formatDateTime(note.updated_at)}</p>}
      <button type="button" className="p-btn p-btn-dark p-btn-small" disabled={state.busy || text === (note?.notes || '')}
        onClick={() => run(() => supabase.from('booking_admin_notes').upsert({ booking_id: booking.id, notes: text }), 'Notes saved.')}>Save notes</button>
      <ActionResult state={state} />
    </section>
  )
}

function EditPanel({ booking, onDone }) {
  const [open, setOpen] = useState(false)
  const [state, run] = useAction(onDone)
  const [trip, setTrip] = useState(() => rowToTrip(booking))
  const [contactDetails, setContactDetails] = useState({ client_name: booking.client_name, client_phone: booking.client_phone, client_email: booking.client_email || '' })
  const [clientId, setClientId] = useState(booking.client_id || '')
  const [errors, setErrors] = useState({})
  const clients = useAsync(() => (open ? must(supabase.from('profiles').select('id, full_name, email').eq('role', 'client').order('full_name').limit(1000)) : Promise.resolve([])), [open])
  useEffect(() => {
    if (!open) {
      setTrip(rowToTrip(booking))
      setContactDetails({ client_name: booking.client_name, client_phone: booking.client_phone, client_email: booking.client_email || '' })
      setClientId(booking.client_id || '')
    }
  }, [booking, open])

  async function save(event) {
    event.preventDefault()
    const nextErrors = { ...validateTrip(trip, { requireFuture: false }), ...validateContact(contactDetails) }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const ok = await run(() => supabase.from('bookings').update({
      ...tripToRow(trip),
      client_name: contactDetails.client_name.trim(),
      client_phone: contactDetails.client_phone.trim(),
      client_email: contactDetails.client_email.trim() || null,
      client_id: clientId || null,
    }).eq('id', booking.id), 'Booking details saved.')
    if (ok) setOpen(false)
  }

  if (!open) {
    return (
      <section className="p-card">
        <h2 className="p-card-title">Edit booking</h2>
        <p className="p-muted">Change the trip, contact details, or link the booking to a client account.</p>
        <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => setOpen(true)}>Edit details</button>
        <ActionResult state={state} />
      </section>
    )
  }
  return (
    <form className="p-card p-form" onSubmit={save} noValidate>
      <h2 className="p-card-title">Edit booking</h2>
      <TripFields trip={trip} errors={errors} onChange={setTrip} idPrefix="edit" />
      <div className="p-grid-3">
        <Field label="Client name *" id="edit-name" error={errors.client_name}><input value={contactDetails.client_name} onChange={e => setContactDetails({ ...contactDetails, client_name: e.target.value })} /></Field>
        <Field label="Phone *" id="edit-phone" error={errors.client_phone}><input type="tel" value={contactDetails.client_phone} onChange={e => setContactDetails({ ...contactDetails, client_phone: e.target.value })} /></Field>
        <Field label="Email" id="edit-email" error={errors.client_email}><input type="email" value={contactDetails.client_email} onChange={e => setContactDetails({ ...contactDetails, client_email: e.target.value })} /></Field>
      </div>
      <Field label="Client account" id="edit-client" hint="Linking lets the client see and track this booking.">
        <select value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">No account (phone / WhatsApp client)</option>
          {booking.client && !clients.data?.some(c => c.id === booking.client.id) && <option value={booking.client.id}>{booking.client.full_name} · {booking.client.email}</option>}
          {(clients.data || []).map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.email}</option>)}
        </select>
      </Field>
      <ActionResult state={state} />
      <div className="p-actions">
        <button type="submit" className="p-btn p-btn-dark p-btn-small" disabled={state.busy}>Save changes</button>
        <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

export function AdminBookingDetail() {
  const { orderNumber } = useParams()
  const { data, error, loading, reload } = useAsync(() => loadDetail(orderNumber), [orderNumber])
  const booking = data?.booking
  const live = useRealtime(`admin-booking-${booking?.id}`, [
    { event: 'UPDATE', table: 'bookings', filter: `id=eq.${booking?.id}` },
    { event: 'INSERT', table: 'booking_status_history', filter: `booking_id=eq.${booking?.id}` },
  ], reload, Boolean(booking?.id))

  if (loading && !data) return <Loading label="Loading booking…" />
  if (error && !data) return <ErrorNote error={errorMessage(error)} onRetry={reload} />
  if (!booking) return <><BackLink to="/admin/bookings">All bookings</BackLink><ErrorNote error={`Booking ${orderNumber} was not found.`} /></>

  return (
    <>
      <div className="a-toolbar"><BackLink to="/admin/bookings">All bookings</BackLink><LiveIndicator status={live} /></div>
      {error && <ErrorNote error={errorMessage(error)} onRetry={reload} />}
      <header className="a-detail-head">
        <div>
          <h2>{booking.order_number}</h2>
          <p className="p-muted">Booked {formatDateTime(booking.created_at)}</p>
        </div>
        <div className="a-detail-badges"><StatusBadge status={booking.status} /><PaymentBadge booking={booking} /></div>
      </header>
      <div className="a-detail">
        <div className="a-detail-main">
          <section className="p-card">
            <h2 className="p-card-title">Trip</h2>
            <dl className="p-summary">
              <div><dt>Service</dt><dd>{SERVICE_TYPES.find(s => s.value === booking.service_type)?.label}</dd></div>
              <div><dt>Pickup</dt><dd>{booking.pickup_location}</dd></div>
              <div><dt>Drop-off</dt><dd>{booking.dropoff_location}</dd></div>
              <div><dt>When</dt><dd>{formatDateTime(booking.pickup_at)}</dd></div>
              <div><dt>Passengers</dt><dd>{booking.passengers} · {booking.luggage} bags</dd></div>
              {booking.flight_number && <div><dt>Flight</dt><dd>{booking.flight_number}</dd></div>}
              <div><dt>Requests</dt><dd>{booking.notes || '—'}</dd></div>
              <div><dt>Price</dt><dd>{booking.quoted_price != null ? formatMoney(booking.quoted_price) : 'Not quoted'}</dd></div>
            </dl>
          </section>
          <section className="p-card">
            <h2 className="p-card-title">Client</h2>
            <p><strong>{booking.client_name}</strong> {booking.client ? <Link to={`/admin/clients/${booking.client.id}`}>(account)</Link> : <span className="p-muted">(no account)</span>}</p>
            <p className="p-muted">{booking.client_email || booking.client?.email || 'No email'}</p>
            <div className="p-actions">
              <a className="p-btn p-btn-ghost p-btn-small" href={telLink(booking.client_phone)}><Phone aria-hidden="true" /> {booking.client_phone}</a>
              <a className="p-btn p-btn-ghost p-btn-small" href={whatsappLink(booking.client_phone, `Hello ${booking.client_name}, this is Lion's Route Shuttles about booking ${booking.order_number}.`)} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp</a>
            </div>
          </section>
          <section className="p-card">
            <h2 className="p-card-title">Progress</h2>
            <StatusTimeline booking={booking} history={data.history} />
          </section>
          <section className="p-card">
            <h2 className="p-card-title">Activity</h2>
            <ActivityLog history={data.history} showActor />
          </section>
        </div>
        <div className="a-detail-side">
          <StatusPanel booking={booking} onDone={reload} />
          <DispatchPanel booking={booking} drivers={data.drivers} vehicles={data.vehicles} onDone={reload} />
          <PaymentPanel booking={booking} onDone={reload} />
          <NotesPanel booking={booking} note={data.note} onDone={reload} />
          <EditPanel booking={booking} onDone={reload} />
        </div>
      </div>
    </>
  )
}
