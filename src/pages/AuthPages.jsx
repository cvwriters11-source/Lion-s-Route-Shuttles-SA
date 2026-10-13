import React, { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { roleHome, useAuth } from '../lib/auth'
import { errorMessage } from '../lib/booking'
import { ErrorNote, Field, Loading, NotConfigured, Notice, PortalShell } from '../components/portal'

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function validateRegistration(form) {
  const errors = {}
  if (form.full_name.trim().length < 2) errors.full_name = 'Please enter your full name.'
  if (form.phone.replace(/\D/g, '').length < 9) errors.phone = 'Please enter a valid phone number.'
  if (!emailPattern.test(form.email.trim())) errors.email = 'Please enter a valid email address.'
  if (form.password.length < 8) errors.password = 'Use at least 8 characters.'
  if (form.confirm !== form.password) errors.confirm = 'Passwords do not match.'
  return errors
}

// Sign-in / sign-up form. onDone(session) runs when a session is available.
export function AuthPanel({ initialMode = 'register', onDone, next = '', compact = false }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const set = field => event => setForm({ ...form, [field]: event.target.value })

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (mode === 'register') {
      const nextErrors = validateRegistration(form)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length) return
      setBusy(true)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { full_name: form.full_name.trim(), phone: form.phone.trim() },
          emailRedirectTo: `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`,
        },
      })
      setBusy(false)
      if (signUpError) return setError(errorMessage(signUpError))
      if (data.session) return onDone?.(data.session)
      setPendingEmail(form.email.trim())
      return undefined
    }
    const nextErrors = {}
    if (!emailPattern.test(form.email.trim())) nextErrors.email = 'Please enter a valid email address.'
    if (!form.password) nextErrors.password = 'Please enter your password.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return undefined
    setBusy(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
    setBusy(false)
    if (signInError) return setError(errorMessage(signInError))
    return onDone?.(data.session)
  }

  if (pendingEmail) {
    return (
      <Notice tone="success">
        <strong>Check your inbox.</strong> We sent a confirmation link to {pendingEmail}. Open it to activate your account, then sign in{compact ? ' here' : ''} — your trip details are saved on this device.
        <div className="p-actions"><button type="button" className="p-btn p-btn-ghost" onClick={() => { setPendingEmail(''); setMode('login') }}>I have confirmed — sign in</button></div>
      </Notice>
    )
  }

  return (
    <form className="p-form p-auth" onSubmit={submit} noValidate>
      <div className="p-tabs" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setErrors({}); setError('') }}>Create account</button>
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setErrors({}); setError('') }}>Sign in</button>
      </div>
      {mode === 'register' && (
        <>
          <Field label="Full name *" id="auth-name" error={errors.full_name}><input value={form.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
          <Field label="Phone / WhatsApp *" id="auth-phone" error={errors.phone}><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        </>
      )}
      <Field label="Email *" id="auth-email" error={errors.email}><input type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
      <Field label="Password *" id="auth-password" error={errors.password} hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
        <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
      </Field>
      {mode === 'register' && (
        <Field label="Confirm password *" id="auth-confirm" error={errors.confirm}><input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
      )}
      <ErrorNote error={error} />
      <button className="p-btn p-btn-dark p-btn-block" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  )
}

function useAfterAuth() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || ''
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : ''
  return {
    next: safeNext,
    go: async session => {
      if (safeNext) return navigate(safeNext, { replace: true })
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      return navigate(roleHome[data?.role] || '/account', { replace: true })
    },
  }
}

function AuthPage({ mode }) {
  const { session, role, loading } = useAuth()
  const { next, go } = useAfterAuth()
  if (!isSupabaseConfigured) return <NotConfigured />
  if (loading) return <main className="portal"><Loading /></main>
  if (session && role) return <Navigate to={next || roleHome[role]} replace />
  return (
    <PortalShell eyebrow={mode === 'login' ? 'Welcome back' : 'Join Lion\'s Route'} title={mode === 'login' ? 'Sign in to' : 'Create your'} italic={mode === 'login' ? 'your account.' : 'account.'} narrow className="portal-auth">
      <div className="p-card">
        <AuthPanel initialMode={mode} onDone={go} next={next} />
      </div>
      <p className="p-muted p-center">
        {mode === 'login' ? <>New here? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link> or <Link to="/book">book a trip</Link>.</> : <>Already registered? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link>.</>}
      </p>
    </PortalShell>
  )
}

export const Login = () => <AuthPage mode="login" key="login" />
export const Register = () => <AuthPage mode="register" key="register" />
