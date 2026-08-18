import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Login error')
    } finally { setLoading(false) }
  }

  return (
    <div className="card" style={{maxWidth:480,margin:'24px auto'}}>
      <h2 style={{marginTop:0}}>Welcome back</h2>
      <p className="muted">Sign in to your GearVault account</p>
      <form onSubmit={handleSubmit} style={{marginTop:12}}>
        <div className="form-row">
          <label>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          <Link to="/signup" className="inline-link small">Create account</Link>
        </div>
      </form>
      {error && <p style={{color:'red'}}>{error}</p>}
    </div>
  )
}
