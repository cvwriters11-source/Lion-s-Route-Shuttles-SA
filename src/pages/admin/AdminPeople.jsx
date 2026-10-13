import React, { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Mail, MessageCircle, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { must, useAsync } from '../../lib/hooks'
import { ACTIVE_TRIP_STATUSES, BOOKING_SELECT, OPEN_STATUSES, errorMessage, formatDate, telLink, whatsappLink } from '../../lib/booking'
import { BackLink, Empty, ErrorNote, Field, Loading, Notice } from '../../components/portal'
import BookingTable from './BookingTable'

const ROLE_LABELS = { client: 'Client', driver: 'Driver', admin: 'Admin' }

async function updateProfile(id, changes) {
  const { data, error } = await supabase.from('profiles').update(changes).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The change was not saved. Please refresh and try again.')
}

function ContactLinks({ person }) {
  return (
    <div className="p-actions">
      {person.phone && <a className="p-btn p-btn-ghost p-btn-small" href={telLink(person.phone)}><Phone aria-hidden="true" /> {person.phone}</a>}
      {person.phone && <a className="p-btn p-btn-ghost p-btn-small" href={whatsappLink(person.phone)} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp</a>}
      {person.email && <a className="p-btn p-btn-ghost p-btn-small" href={`mailto:${person.email}`}><Mail aria-hidden="true" /> Email</a>}
    </div>
  )
}

function DriverJobs({ driverId }) {
  const { data, error, loading } = useAsync(
    () => must(supabase.from('bookings').select(BOOKING_SELECT).eq('driver_id', driverId).order('pickup_at', { ascending: false }).limit(100)),
    [driverId],
  )
  if (loading && !data) return <Loading label="Loading jobs…" />
  if (error) return <ErrorNote error={errorMessage(error)} />
  const open = data.filter(b => OPEN_STATUSES.includes(b.status)).reverse()
  const done = data.filter(b => !OPEN_STATUSES.includes(b.status))
  return (
    <>
      <h4 className="a-subhead">Open jobs ({open.length})</h4>
      <BookingTable bookings={open} showDriver={false} emptyText="No open jobs." />
      <h4 className="a-subhead">Recent completed &amp; cancelled ({done.length})</h4>
      <BookingTable bookings={done.slice(0, 20)} showDriver={false} emptyText="No completed jobs yet." />
    </>
  )
}

export function AdminDrivers() {
  const drivers = useAsync(() => must(supabase.from('profiles').select('*').eq('role', 'driver').order('full_name')), [])
  const workload = useAsync(() => must(supabase.from('bookings').select('driver_id, status').not('driver_id', 'is', null).in('status', OPEN_STATUSES).limit(5000)), [])
  const candidates = useAsync(() => must(supabase.from('profiles').select('id, full_name, email, phone').eq('role', 'client').eq('active', true).order('full_name').limit(1000)), [])
  const [expanded, setExpanded] = useState('')
  const [term, setTerm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const counts = useMemo(() => {
    const result = {}
    for (const b of workload.data || []) {
      result[b.driver_id] ??= { open: 0, onRoad: 0 }
      result[b.driver_id].open += 1
      if (ACTIVE_TRIP_STATUSES.includes(b.status)) result[b.driver_id].onRoad += 1
    }
    return result
  }, [workload.data])

  const matches = term.trim().length >= 2
    ? (candidates.data || []).filter(c => [c.full_name, c.email, c.phone].some(v => (v || '').toLowerCase().includes(term.trim().toLowerCase()))).slice(0, 8)
    : []

  async function change(person, changes, text) {
    setError('')
    setMessage('')
    try {
      await updateProfile(person.id, changes)
      setMessage(text)
      drivers.reload()
      candidates.reload()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <section className="p-card">
        <h2 className="p-card-title">Add a driver</h2>
        <p className="p-muted">For security, drivers create their own login: ask them to register at <strong>{window.location.origin}/register</strong> with their own email and password. Then find them here and make them a driver.</p>
        <Field label="Find a registered user" id="drv-search"><input type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Name, email or phone (min. 2 characters)" /></Field>
        {matches.length > 0 && (
          <ul className="a-people-list">
            {matches.map(c => (
              <li key={c.id}>
                <span><strong>{c.full_name || '(no name)'}</strong><small>{c.email} · {c.phone || 'no phone'}</small></span>
                <button type="button" className="p-btn p-btn-dark p-btn-small" onClick={() => change(c, { role: 'driver' }, `${c.full_name} is now a driver.`)}>Make driver</button>
              </li>
            ))}
          </ul>
        )}
        {term.trim().length >= 2 && !matches.length && <p className="p-muted">No registered client accounts match “{term}”.</p>}
      </section>
      {message && <Notice tone="success">{message}</Notice>}
      {error && <ErrorNote error={error} />}
      {drivers.error && <ErrorNote error={errorMessage(drivers.error)} onRetry={drivers.reload} />}
      {drivers.loading && !drivers.data ? <Loading label="Loading drivers…" /> : !drivers.data?.length ? (
        <Empty title="No drivers yet"><p>Add your first driver above.</p></Empty>
      ) : (
        <div className="a-people">
          {drivers.data.map(d => (
            <article key={d.id} className={`p-card a-person ${d.active ? '' : 'is-inactive'}`}>
              <header>
                <div>
                  <h3>{d.full_name}</h3>
                  <p className="p-muted">{d.email}</p>
                </div>
                <span className={`p-badge ${d.active ? 'p-pay-paid' : 'p-status-cancelled'}`}>{d.active ? 'Active' : 'Inactive'}</span>
              </header>
              <p className="a-person-stats"><span><strong>{counts[d.id]?.open || 0}</strong> open jobs</span><span><strong>{counts[d.id]?.onRoad || 0}</strong> on the road</span></p>
              <ContactLinks person={d} />
              <div className="p-actions">
                <button type="button" className="p-btn p-btn-dark p-btn-small" aria-expanded={expanded === d.id} onClick={() => setExpanded(expanded === d.id ? '' : d.id)}>{expanded === d.id ? 'Hide jobs' : 'View jobs'}</button>
                <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => change(d, { active: !d.active }, `${d.full_name} is now ${d.active ? 'inactive' : 'active'}.`)}>{d.active ? 'Deactivate' : 'Activate'}</button>
                <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => { if (window.confirm(`Change ${d.full_name} back to a client account? They will no longer see driver jobs.`)) change(d, { role: 'client' }, `${d.full_name} is now a client.`) }}>Remove driver role</button>
              </div>
              {expanded === d.id && <div className="a-person-jobs"><DriverJobs driverId={d.id} /></div>}
            </article>
          ))}
        </div>
      )}
    </>
  )
}

export function AdminClients() {
  const [term, setTerm] = useState('')
  const [role, setRole] = useState('client')
  const people = useAsync(() => {
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000)
    if (role) query = query.eq('role', role)
    return must(query)
  }, [role])
  const bookingCounts = useAsync(() => must(supabase.from('bookings').select('client_id').not('client_id', 'is', null).limit(10000)), [])
  const counts = useMemo(() => {
    const result = {}
    for (const b of bookingCounts.data || []) result[b.client_id] = (result[b.client_id] || 0) + 1
    return result
  }, [bookingCounts.data])
  const t = term.trim().toLowerCase()
  const list = (people.data || []).filter(p => !t || [p.full_name, p.email, p.phone].some(v => (v || '').toLowerCase().includes(t)))

  return (
    <>
      <div className="a-filters p-form">
        <Field label="Search" id="cl-search"><input type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Name, email or phone" /></Field>
        <Field label="Role" id="cl-role">
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="client">Clients</option>
            <option value="driver">Drivers</option>
            <option value="admin">Admins</option>
            <option value="">Everyone</option>
          </select>
        </Field>
      </div>
      <p className="p-muted p-small">Phone and WhatsApp bookings without an account are listed under <Link to="/admin/bookings">Bookings</Link> by client name and phone.</p>
      {people.error && <ErrorNote error={errorMessage(people.error)} onRetry={people.reload} />}
      {people.loading && !people.data ? <Loading label="Loading accounts…" /> : !list.length ? <Empty title="No accounts found" /> : (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Role</th><th scope="col">Bookings</th><th scope="col">Joined</th></tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td data-label="Name"><Link className="p-order-link" to={`/admin/clients/${p.id}`}>{p.full_name || '(no name)'}</Link>{!p.active && <small>Inactive</small>}</td>
                  <td data-label="Email">{p.email}</td>
                  <td data-label="Phone">{p.phone || '—'}</td>
                  <td data-label="Role">{ROLE_LABELS[p.role]}</td>
                  <td data-label="Bookings">{counts[p.id] || 0}</td>
                  <td data-label="Joined">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function AdminClientDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const person = useAsync(() => must(supabase.from('profiles').select('*').eq('id', id).maybeSingle()), [id])
  const bookings = useAsync(() => must(supabase.from('bookings').select(BOOKING_SELECT).eq('client_id', id).order('pickup_at', { ascending: false })), [id])
  const [role, setRole] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (person.loading && !person.data) return <Loading />
  if (person.error) return <ErrorNote error={errorMessage(person.error)} onRetry={person.reload} />
  const p = person.data
  if (!p) return <><BackLink to="/admin/clients">Clients</BackLink><ErrorNote error="Account not found." /></>
  const isSelf = p.id === user.id

  async function change(changes, text) {
    setError('')
    setMessage('')
    try {
      await updateProfile(p.id, changes)
      setMessage(text)
      setRole('')
      person.reload()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <BackLink to="/admin/clients">Clients</BackLink>
      <div className="a-detail">
        <div className="a-detail-main">
          <section className="p-card">
            <h2 className="p-card-title">{p.full_name || '(no name)'}</h2>
            <p className="p-muted">{p.email} · {ROLE_LABELS[p.role]} · {p.active ? 'Active' : 'Inactive'} · joined {formatDate(p.created_at)}</p>
            <ContactLinks person={p} />
          </section>
          <section className="p-section">
            <h2 className="p-section-title">Booking history <span>{bookings.data?.length ?? ''}</span></h2>
            {bookings.error && <ErrorNote error={errorMessage(bookings.error)} />}
            {bookings.loading && !bookings.data ? <Loading /> : <BookingTable bookings={bookings.data || []} showClient={false} emptyText="This client has no bookings yet." />}
            <Link className="p-btn p-btn-gold p-btn-small" to="/admin/bookings/new">+ Book for a client</Link>
          </section>
        </div>
        <div className="a-detail-side">
          <section className="p-card">
            <h2 className="p-card-title">Account access</h2>
            {isSelf ? <p className="p-muted">This is your own account. Another admin must change your role or status.</p> : (
              <>
                <Field label="Role" id="cd-role" hint="Drivers see only jobs assigned to them. Admins can manage everything.">
                  <select value={role || p.role} onChange={e => setRole(e.target.value)}>
                    <option value="client">Client</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
                <div className="p-actions">
                  <button type="button" className="p-btn p-btn-dark p-btn-small" disabled={!role || role === p.role}
                    onClick={() => { if (role !== 'admin' || window.confirm(`Give ${p.full_name} full admin access?`)) change({ role }, `Role changed to ${ROLE_LABELS[role]}.`) }}>Save role</button>
                  <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => change({ active: !p.active }, p.active ? 'Account deactivated.' : 'Account activated.')}>{p.active ? 'Deactivate account' : 'Activate account'}</button>
                </div>
              </>
            )}
            {message && <p className="p-success" role="status">{message}</p>}
            {error && <ErrorNote error={error} />}
          </section>
        </div>
      </div>
    </>
  )
}
