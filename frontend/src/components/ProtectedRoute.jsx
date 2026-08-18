import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ProtectedRoute({ children }){
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data?.session ?? null)
      setLoading(false)
    })
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session ?? null)
      setLoading(false)
    })
    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  if (loading) return <div>Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}
