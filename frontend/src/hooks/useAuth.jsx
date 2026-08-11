import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import i18n from '../lib/i18n'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id, session)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id, session)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId, currentSession) {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error && data) {
      setProfile(data)
      if (data.preferred_language) {
        i18n.changeLanguage(data.preferred_language)
      }
    } else {
      // Fallback: construct profile object from session metadata so login always works
      const s = currentSession || session
      const user = s?.user
      if (user) {
        const meta = user.user_metadata || {}
        const fallback = {
          id: user.id,
          name: meta.name || user.email?.split('@')[0] || 'User',
          email: user.email,
          role: meta.role || 'farmer',
          farm_id: meta.farm_id || null,
          region: meta.region || meta.farm_region || null,
          preferred_language: meta.preferred_language || 'en',
        }
        setProfile(fallback)
        if (fallback.preferred_language) {
          i18n.changeLanguage(fallback.preferred_language)
        }
      }
    }
    setLoading(false)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp({ email, password, name, role, farmName, farmRegion, farmLat, farmLng, region, preferredLanguage }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          preferred_language: preferredLanguage || 'en',
          farm_name: role === 'farmer' ? farmName : undefined,
          farm_region: role === 'farmer' ? farmRegion : undefined,
          farm_lat: role === 'farmer' && farmLat ? parseFloat(farmLat) : undefined,
          farm_lng: role === 'farmer' && farmLng ? parseFloat(farmLng) : undefined,
          region: role === 'govt_official' ? region : undefined,
        },
      },
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }

  async function updateLanguage(lang) {
    i18n.changeLanguage(lang)
    if (profile) {
      await supabase
        .from('profiles')
        .update({ preferred_language: lang })
        .eq('id', profile.id)
      setProfile(prev => ({ ...prev, preferred_language: lang }))
    }
  }

  const value = {
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    updateLanguage,
    refetchProfile: () => session && fetchProfile(session.user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // Fallback when used outside AuthProvider (e.g., LanguageSwitcher on login page)
    return {
      session: null, profile: null, loading: false,
      signIn: async () => {}, signUp: async () => {},
      signOut: async () => {},
      updateLanguage: async (lang) => { i18n.changeLanguage(lang) },
      refetchProfile: async () => {},
    }
  }
  return ctx
}
