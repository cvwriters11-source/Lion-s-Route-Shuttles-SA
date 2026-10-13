import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export const roleHome = { admin: '/admin', driver: '/driver', client: '/account' }

export function AuthProvider({ children }) {
  // undefined = still loading, null = signed out
  const [session, setSession] = useState(supabase ? undefined : null)
  const [profile, setProfile] = useState(undefined)
  const userId = session?.user?.id

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return null
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) {
      setProfile(null)
      return null
    }
    setProfile(data)
    return data
  }, [userId])

  useEffect(() => {
    if (session === undefined) return
    setProfile(undefined)
    loadProfile()
  }, [session === undefined, loadProfile])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile: profile ?? null,
    role: profile?.active ? profile.role : null,
    loading: session === undefined || (session !== null && profile === undefined),
    refreshProfile: loadProfile,
    signOut: async () => {
      await supabase?.auth.signOut()
      setProfile(null)
    },
  }), [session, profile, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
