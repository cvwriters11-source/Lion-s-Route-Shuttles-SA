import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// Runs an async loader and exposes { data, error, loading, reload }.
// Reloads keep the previous data on screen to avoid flicker.
export function useAsync(loader, deps) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    setState(current => ({ ...current, loading: true }))
    try {
      const data = await loaderRef.current()
      if (id === requestId.current) setState({ data, error: null, loading: false })
    } catch (error) {
      if (id === requestId.current) setState(current => ({ data: current.data, error, loading: false }))
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, deps)

  return { ...state, reload }
}

// Throws Supabase errors so useAsync can surface them.
export async function must(promise) {
  const { data, error, count } = await promise
  if (error) throw error
  return count !== undefined && count !== null && data === null ? count : data
}

// Subscribes to postgres_changes and calls onChange (debounced) for any matching event.
// Returns the channel status: 'connecting' | 'live' | 'offline'.
export function useRealtime(name, bindings, onChange, enabled = true) {
  const [status, setStatus] = useState('connecting')
  const callback = useRef(onChange)
  callback.current = onChange
  const key = JSON.stringify(bindings)

  useEffect(() => {
    if (!enabled || !supabase) return undefined
    let timer
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => callback.current(), 200)
    }
    const channel = supabase.channel(`${name}-${Math.random().toString(36).slice(2)}`)
    for (const binding of bindings) channel.on('postgres_changes', { schema: 'public', ...binding }, fire)
    channel.subscribe(state => {
      if (state === 'SUBSCRIBED') setStatus('live')
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus('offline')
    })
    const onVisible = () => document.visibilityState === 'visible' && fire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key, enabled])

  return status
}
