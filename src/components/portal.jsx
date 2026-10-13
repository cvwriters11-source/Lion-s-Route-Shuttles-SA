import React from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AlertCircle, Check, Circle, Loader2, MessageCircle } from 'lucide-react'
import { roleHome, useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { contact } from '../data'
import {
  STATUS_FLOW, formatDateTime, formatMoney, paymentMethodLabel, statusLabel, SERVICE_TYPES,
} from '../lib/booking'

export function PortalShell({ eyebrow, title, italic, actions, children, narrow = false, className = '' }) {
  return (
    <main className={`portal ${narrow ? 'portal-narrow' : ''} ${className}`.trim()}>
      <header className="portal-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1>{title}{italic && <> <em>{italic}</em></>}</h1>
        </div>
        {actions && <div className="portal-head-actions">{actions}</div>}
      </header>
      {children}
    </main>
  )
}

export function Loading({ label = 'Loading…' }) {
  return <div className="p-state" role="status" aria-live="polite"><Loader2 className="p-spin" aria-hidden="true" /> {label}</div>
}

export function ErrorNote({ error, onRetry, children }) {
  if (!error && !children) return null
  return (
    <div className="p-alert p-alert-error" role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <p>{children || error}</p>
        {onRetry && <button type="button" className="p-link-button" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}

export function Notice({ children, tone = 'info' }) {
  return <div className={`p-alert p-alert-${tone}`} role="status"><div>{children}</div></div>
}

export function Empty({ title, children }) {
  return <div className="p-empty"><h3>{title}</h3>{children}</div>
}

export function StatusBadge({ status }) {
  return <span className={`p-badge p-status-${status}`}>{statusLabel(status)}</span>
}

export function PaymentBadge({ booking }) {
  if (booking.payment_status === 'paid') {
    return <span className="p-badge p-pay-paid">Paid{booking.payment_method ? ` · ${paymentMethodLabel(booking.payment_method)}` : ''}</span>
  }
  return <span className="p-badge p-pay-unpaid">Unpaid{booking.quoted_price != null ? ` · ${formatMoney(booking.quoted_price)}` : ''}</span>
}

export function LiveIndicator({ status }) {
  const text = status === 'live' ? 'Live updates on' : status === 'offline' ? 'Live updates paused — refresh to update' : 'Connecting to live updates…'
  return <span className={`p-live p-live-${status}`} role="status"><span aria-hidden="true" />{text}</span>
}

// Progress stepper: one row per stage with the time it was reached.
export function StatusTimeline({ booking, history }) {
  const reached = {}
  for (const entry of history) reached[entry.status] = entry.created_at
  const currentIndex = STATUS_FLOW.indexOf(booking.status)
  const cancelled = booking.status === 'cancelled'
  return (
    <ol className="p-stepper" aria-label="Booking progress">
      {STATUS_FLOW.map((status, index) => {
        const current = !cancelled && index === currentIndex
        const done = !cancelled && (index < currentIndex || (current && status === 'completed'))
        const state = done || (cancelled && reached[status]) ? 'done' : current ? 'current' : 'todo'
        return (
          <li key={status} className={`p-step p-step-${state}`} aria-current={current ? 'step' : undefined}>
            <span className="p-step-dot" aria-hidden="true">{state === 'done' ? <Check /> : <Circle />}</span>
            <span className="p-step-text">
              <strong>{statusLabel(status)}</strong>
              <small>{reached[status] ? formatDateTime(reached[status]) : current ? 'Now' : 'Pending'}</small>
            </span>
          </li>
        )
      })}
      {cancelled && (
        <li className="p-step p-step-cancelled" aria-current="step">
          <span className="p-step-dot" aria-hidden="true"><AlertCircle /></span>
          <span className="p-step-text"><strong>Cancelled</strong><small>{formatDateTime(reached.cancelled || booking.status_updated_at)}</small></span>
        </li>
      )}
    </ol>
  )
}

const roleNames = { admin: 'Lion\'s Route', driver: 'Driver', client: 'Client' }

export function ActivityLog({ history, showActor = false }) {
  if (!history.length) return <p className="p-muted">No updates yet.</p>
  return (
    <ul className="p-activity">
      {[...history].reverse().map(entry => (
        <li key={entry.id}>
          <div><StatusBadge status={entry.status} />{showActor && entry.changed_by_role && <span className="p-muted"> by {roleNames[entry.changed_by_role]}</span>}</div>
          {entry.note && <p>{entry.note}</p>}
          <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
        </li>
      ))}
    </ul>
  )
}

export function Field({ label, error, hint, id, children, className = '' }) {
  const errorId = error ? `${id}-error` : undefined
  const hintId = hint ? `${id}-hint` : undefined
  const child = React.cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
  })
  return (
    <div className={`p-field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {child}
      {hint && <span id={hintId} className="p-hint">{hint}</span>}
      {error && <span id={errorId} className="p-error">{error}</span>}
    </div>
  )
}

export function TripFields({ trip, errors, onChange, idPrefix = 'trip' }) {
  const set = field => event => onChange({ ...trip, [field]: event.target.value })
  return (
    <>
      <Field label="Service *" id={`${idPrefix}-service`} error={errors.service_type}>
        <select value={trip.service_type} onChange={set('service_type')}>
          {SERVICE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <div className="p-grid-2">
        <Field label="Pickup location *" id={`${idPrefix}-pickup`} error={errors.pickup_location} hint={trip.service_type === 'airport_transfer' ? 'e.g. O.R. Tambo International, Terminal A' : 'Street address, hotel or landmark'}>
          <input value={trip.pickup_location} onChange={set('pickup_location')} autoComplete="street-address" maxLength={300} />
        </Field>
        <Field label="Drop-off location *" id={`${idPrefix}-dropoff`} error={errors.dropoff_location}>
          <input value={trip.dropoff_location} onChange={set('dropoff_location')} maxLength={300} />
        </Field>
      </div>
      <div className="p-grid-2">
        <Field label="Pickup date *" id={`${idPrefix}-date`} error={errors.date}>
          <input type="date" value={trip.date} onChange={set('date')} />
        </Field>
        <Field label="Pickup time (SAST) *" id={`${idPrefix}-time`} error={errors.time}>
          <input type="time" value={trip.time} onChange={set('time')} step="300" />
        </Field>
      </div>
      <div className="p-grid-2">
        <Field label="Passengers *" id={`${idPrefix}-passengers`} error={errors.passengers}>
          <input type="number" inputMode="numeric" min="1" max="60" value={trip.passengers} onChange={set('passengers')} />
        </Field>
        <Field label="Luggage (bags)" id={`${idPrefix}-luggage`} error={errors.luggage}>
          <input type="number" inputMode="numeric" min="0" max="100" value={trip.luggage} onChange={set('luggage')} />
        </Field>
      </div>
      {trip.service_type === 'airport_transfer' && (
        <Field label="Flight number (optional)" id={`${idPrefix}-flight`} error={errors.flight_number} hint="Helps us track delays for airport pickups.">
          <input value={trip.flight_number} onChange={set('flight_number')} maxLength={12} autoCapitalize="characters" />
        </Field>
      )}
      <Field label="Special requests" id={`${idPrefix}-notes`} error={errors.notes} hint="Child seats, extra stops, wheelchair access, event details…">
        <textarea rows="4" value={trip.notes} onChange={set('notes')} maxLength={1000} />
      </Field>
    </>
  )
}

export function NotConfigured() {
  return (
    <PortalShell eyebrow="Online booking" title="Online booking is" italic="coming soon." narrow>
      <div className="p-card">
        <p>Our online booking system is being set up. In the meantime we would love to help you on WhatsApp or by phone.</p>
        <div className="p-actions">
          <a className="p-btn p-btn-gold" href={contact.whatsapp} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> Book on WhatsApp</a>
          <a className="p-btn p-btn-ghost" href={contact.phoneLink}>Call {contact.phone}</a>
        </div>
      </div>
    </PortalShell>
  )
}

// Route guard: redirects to /login when signed out, or to the user's own area for the wrong role.
export function RequireRole({ roles, children }) {
  const { session, profile, role, loading } = useAuth()
  const location = useLocation()
  if (!isSupabaseConfigured) return <NotConfigured />
  if (loading) return <main className="portal"><Loading /></main>
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (profile && !profile.active) {
    return (
      <PortalShell eyebrow="Account" title="Account" italic="paused." narrow>
        <Notice tone="warning">Your account is currently inactive. Please contact us on {contact.phone} if you think this is a mistake.</Notice>
      </PortalShell>
    )
  }
  if (!role) return <main className="portal"><ErrorNote error="We could not load your account. Please refresh the page." /></main>
  if (!roles.includes(role)) return <Navigate to={roleHome[role] || '/'} replace />
  return children
}

export function BackLink({ to, children }) {
  return <Link className="p-back" to={to}>← {children}</Link>
}
