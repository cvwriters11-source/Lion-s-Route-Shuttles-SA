import React, { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { contact } from '../data'
import {
  SERVICE_TYPES, emptyTrip, errorMessage, formatDateTime, serviceLabel, tripToRow, validateContact, validateTrip,
} from '../lib/booking'
import { ErrorNote, Field, Loading, NotConfigured, Notice, PortalShell, TripFields } from '../components/portal'
import { AuthPanel } from './AuthPages'

const DRAFT_KEY = 'lrs-booking-draft'

function loadDraft(service) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || localStorage.getItem(DRAFT_KEY) || 'null')
    if (saved?.trip) return { ...emptyTrip(), ...saved.trip, ...(service ? { service_type: service } : {}) }
  } catch { /* ignore corrupt drafts */ }
  return emptyTrip(service || 'airport_transfer')
}

export default function Book() {
  const [params] = useSearchParams()
  const requestedService = SERVICE_TYPES.some(s => s.value === params.get('service')) ? params.get('service') : ''
  const { session, profile, role, loading } = useAuth()
  const [trip, setTrip] = useState(() => loadDraft(requestedService))
  const [contactDetails, setContactDetails] = useState({ client_name: '', client_phone: '' })
  const [errors, setErrors] = useState({})
  const [step, setStep] = useState('details')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)
  const autoSubmit = useRef(false)

  useEffect(() => {
    const draft = JSON.stringify({ trip })
    sessionStorage.setItem(DRAFT_KEY, draft)
    localStorage.setItem(DRAFT_KEY, draft)
  }, [trip])

  useEffect(() => {
    if (profile) setContactDetails(current => ({
      client_name: current.client_name || profile.full_name || '',
      client_phone: current.client_phone || profile.phone || '',
    }))
  }, [profile])

  async function createBooking(details = contactDetails, sessionOverride = session) {
    setError('')
    setBusy(true)
    const { data, error: insertError } = await supabase
      .from('bookings')
      .insert({ ...tripToRow(trip), client_id: sessionOverride.user.id, client_name: details.client_name.trim(), client_phone: details.client_phone.trim() })
      .select('id, order_number, service_type, pickup_location, dropoff_location, pickup_at, passengers')
      .single()
    setBusy(false)
    if (insertError) {
      setStep('details')
      return setError(errorMessage(insertError, 'We could not save your booking. Please try again or contact us on WhatsApp.'))
    }
    sessionStorage.removeItem(DRAFT_KEY)
    localStorage.removeItem(DRAFT_KEY)
    setCreated(data)
    window.scrollTo({ top: 0, behavior: 'instant' })
    return undefined
  }

  // After signing up / in from the booking page, submit automatically once the profile has loaded.
  useEffect(() => {
    if (!autoSubmit.current || !session || !profile) return
    autoSubmit.current = false
    if (profile.role !== 'client') return setStep('details')
    const details = {
      client_name: contactDetails.client_name || profile.full_name || '',
      client_phone: contactDetails.client_phone || profile.phone || '',
    }
    if (Object.keys(validateContact(details)).length) {
      setContactDetails(details)
      return setStep('details')
    }
    createBooking(details, session)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile])

  function submit(event) {
    event.preventDefault()
    const tripErrors = validateTrip(trip)
    const contactErrors = session ? validateContact(contactDetails) : {}
    const nextErrors = { ...tripErrors, ...contactErrors }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      const first = document.querySelector('.p-form [aria-invalid="true"]')
      first?.focus()
      return
    }
    if (!session) {
      setStep('account')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    createBooking()
  }

  if (!isSupabaseConfigured) return <NotConfigured />
  if (loading && !created) return <main className="portal"><Loading /></main>

  if (created) {
    const message = `Hello Lion's Route Shuttles SA, I have just booked online. My order number is ${created.order_number}.`
    return (
      <PortalShell eyebrow="Booking received" title="Thank you —" italic="your trip is booked." narrow>
        <div className="p-card p-confirmation">
          <CheckCircle2 className="p-confirmation-icon" aria-hidden="true" />
          <p className="p-muted">Your order number</p>
          <p className="p-order-number" aria-live="polite">{created.order_number}</p>
          <p>Keep this number to track your booking. We will confirm your trip and send your quote shortly. No payment is needed online — you can pay your driver in cash or by EFT.</p>
          <dl className="p-summary">
            <div><dt>Service</dt><dd>{serviceLabel(created.service_type)}</dd></div>
            <div><dt>Pickup</dt><dd>{created.pickup_location}</dd></div>
            <div><dt>Drop-off</dt><dd>{created.dropoff_location}</dd></div>
            <div><dt>When</dt><dd>{formatDateTime(created.pickup_at)}</dd></div>
            <div><dt>Passengers</dt><dd>{created.passengers}</dd></div>
          </dl>
          <div className="p-actions">
            <Link className="p-btn p-btn-dark" to={`/account/bookings/${created.order_number}`}>Track this booking</Link>
            <Link className="p-btn p-btn-ghost" to="/account">My bookings</Link>
            <a className="p-btn p-btn-ghost" href={`${contact.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp us</a>
          </div>
        </div>
      </PortalShell>
    )
  }

  const wrongRole = session && role && role !== 'client'

  return (
    <PortalShell eyebrow="Book online" title="Plan your" italic="journey." narrow>
      <p className="portal-lead">Tell us about your trip. You will receive an order number to track your booking, and we will confirm the details and price with you. Prefer to chat? <a href={contact.whatsapp} target="_blank" rel="noreferrer">Book on WhatsApp</a>.</p>
      <ol className="p-progress" aria-label="Booking steps">
        <li className={step === 'details' ? 'is-active' : 'is-done'}>Trip details</li>
        <li className={step === 'account' ? 'is-active' : session ? 'is-done' : ''}>Your account</li>
        <li>Confirmation</li>
      </ol>

      {wrongRole && <Notice tone="warning">You are signed in as {role === 'admin' ? 'an administrator' : 'a driver'}. {role === 'admin' ? <>Use the <Link to="/admin/bookings/new">admin booking form</Link> to book for a client.</> : 'Please use a client account to make a booking.'}</Notice>}

      {step === 'account' && !session ? (
        <div className="p-card">
          <h2 className="p-card-title">Almost there — create an account or sign in</h2>
          <p className="p-muted">Your account lets you track this booking and see your trip history. Your trip details are saved.</p>
          <AuthPanel compact next="/book" onDone={() => { autoSubmit.current = true }} />
          <button type="button" className="p-link-button" onClick={() => setStep('details')}>← Back to trip details</button>
        </div>
      ) : busy ? (
        <div className="p-card"><Loading label="Saving your booking…" /></div>
      ) : (
        <form className="p-card p-form" onSubmit={submit} noValidate>
          <TripFields trip={trip} errors={errors} onChange={setTrip} idPrefix="book" />
          {session && (
            <fieldset className="p-fieldset">
              <legend>Contact for this trip</legend>
              <div className="p-grid-2">
                <Field label="Passenger name *" id="book-name" error={errors.client_name}>
                  <input value={contactDetails.client_name} onChange={e => setContactDetails({ ...contactDetails, client_name: e.target.value })} autoComplete="name" />
                </Field>
                <Field label="Phone / WhatsApp *" id="book-phone" error={errors.client_phone}>
                  <input type="tel" value={contactDetails.client_phone} onChange={e => setContactDetails({ ...contactDetails, client_phone: e.target.value })} autoComplete="tel" />
                </Field>
              </div>
            </fieldset>
          )}
          <ErrorNote error={error} />
          <button className="p-btn p-btn-dark p-btn-block" type="submit" disabled={wrongRole}>
            {session ? 'Submit booking' : 'Continue'}
          </button>
          <p className="p-muted p-small">No online payment needed. We confirm every booking and agree the price with you before your trip.</p>
        </form>
      )}
    </PortalShell>
  )
}
