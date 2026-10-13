import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { must, useAsync } from '../../lib/hooks'
import { errorMessage } from '../../lib/booking'
import { Empty, ErrorNote, Field, Loading, Notice } from '../../components/portal'

const blank = { name: '', vehicle_type: '', registration: '', seats: 4 }

function validate(vehicle) {
  const errors = {}
  if (vehicle.name.trim().length < 2) errors.name = 'Enter a vehicle name, e.g. Mercedes V-Class.'
  if (vehicle.registration.trim().length < 2) errors.registration = 'Enter the registration plate.'
  const seats = Number(vehicle.seats)
  if (!Number.isInteger(seats) || seats < 1 || seats > 80) errors.seats = 'Seats must be between 1 and 80.'
  return errors
}

const toRow = vehicle => ({
  name: vehicle.name.trim(),
  vehicle_type: vehicle.vehicle_type.trim() || null,
  registration: vehicle.registration.trim().toUpperCase(),
  seats: Number(vehicle.seats),
})

function VehicleForm({ initial = blank, submitLabel, onSubmit, onCancel, idPrefix }) {
  const [form, setForm] = useState({ ...initial, vehicle_type: initial.vehicle_type || '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = field => e => setForm({ ...form, [field]: e.target.value })
  async function submit(event) {
    event.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    setError('')
    const { error: saveError } = await onSubmit(toRow(form))
    setBusy(false)
    if (saveError) return setError(/duplicate|unique/i.test(saveError.message) ? 'A vehicle with this registration already exists.' : errorMessage(saveError))
    if (!onCancel) setForm(blank)
    return undefined
  }
  return (
    <form className="p-form a-vehicle-form" onSubmit={submit} noValidate>
      <div className="p-grid-4">
        <Field label="Name *" id={`${idPrefix}-name`} error={errors.name}><input value={form.name} onChange={set('name')} placeholder="Mercedes V-Class" /></Field>
        <Field label="Type" id={`${idPrefix}-type`}><input value={form.vehicle_type} onChange={set('vehicle_type')} placeholder="Luxury MPV" /></Field>
        <Field label="Registration *" id={`${idPrefix}-reg`} error={errors.registration}><input value={form.registration} onChange={set('registration')} placeholder="LR 01 GP" autoCapitalize="characters" /></Field>
        <Field label="Seats *" id={`${idPrefix}-seats`} error={errors.seats}><input type="number" inputMode="numeric" min="1" max="80" value={form.seats} onChange={set('seats')} /></Field>
      </div>
      {error && <ErrorNote error={error} />}
      <div className="p-actions">
        <button type="submit" className="p-btn p-btn-dark p-btn-small" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

export default function AdminVehicles() {
  const vehicles = useAsync(() => must(supabase.from('vehicles').select('*').order('active', { ascending: false }).order('name')), [])
  const [editing, setEditing] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function toggle(vehicle) {
    setError('')
    const { error: updateError } = await supabase.from('vehicles').update({ active: !vehicle.active }).eq('id', vehicle.id)
    if (updateError) return setError(errorMessage(updateError))
    setMessage(`${vehicle.name} is now ${vehicle.active ? 'inactive' : 'active'}.`)
    return vehicles.reload()
  }

  return (
    <>
      <section className="p-card">
        <h2 className="p-card-title">Add a vehicle</h2>
        <VehicleForm idPrefix="nv" submitLabel="Add vehicle" onSubmit={async row => {
          const result = await supabase.from('vehicles').insert(row)
          if (!result.error) { setMessage(`${row.name} added.`); vehicles.reload() }
          return result
        }} />
      </section>
      {message && <Notice tone="success">{message}</Notice>}
      {error && <ErrorNote error={error} />}
      {vehicles.error && <ErrorNote error={errorMessage(vehicles.error)} onRetry={vehicles.reload} />}
      {vehicles.loading && !vehicles.data ? <Loading label="Loading fleet…" /> : !vehicles.data?.length ? (
        <Empty title="No vehicles yet"><p>Add your fleet above so you can assign vehicles when dispatching drivers.</p></Empty>
      ) : (
        <div className="a-people">
          {vehicles.data.map(v => (
            <article key={v.id} className={`p-card a-person ${v.active ? '' : 'is-inactive'}`}>
              {editing === v.id ? (
                <VehicleForm idPrefix={`ev-${v.id}`} initial={v} submitLabel="Save vehicle" onCancel={() => setEditing('')} onSubmit={async row => {
                  const result = await supabase.from('vehicles').update(row).eq('id', v.id)
                  if (!result.error) { setEditing(''); setMessage(`${row.name} updated.`); vehicles.reload() }
                  return result
                }} />
              ) : (
                <>
                  <header>
                    <div><h3>{v.name}</h3><p className="p-muted">{v.vehicle_type || 'Vehicle'} · {v.seats} seats</p></div>
                    <span className={`p-badge ${v.active ? 'p-pay-paid' : 'p-status-cancelled'}`}>{v.active ? 'Active' : 'Inactive'}</span>
                  </header>
                  <p className="a-plate">{v.registration}</p>
                  <div className="p-actions">
                    <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => setEditing(v.id)}>Edit</button>
                    <button type="button" className="p-btn p-btn-ghost p-btn-small" onClick={() => toggle(v)}>{v.active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  )
}
