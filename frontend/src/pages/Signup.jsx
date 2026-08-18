import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { setSession } from '../lib/api'
import { supabase } from '../lib/supabaseClient'

export default function Signup({ onAuthenticated }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      if (error) throw error
      if (!data.session) {
        setError('Check your email to confirm your account, then log in.')
        return
      }
      setSession(data.session.access_token, data.user)
      onAuthenticated(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Signup error')
    } finally { setLoading(false) }
  }

  return (
    <div className="card" style={{maxWidth:540,margin:'24px auto'}}>
      <h2 style={{marginTop:0}}>Create an account</h2>
      <p className="muted">Sign up to start booking equipment</p>
      <form onSubmit={handleSubmit} style={{marginTop:12}}>
        <div className="form-row">
          <label>Full name</label>
          <input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="form-row">
          <label>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Choose a secure password" />
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
          <Link to="/login" className="inline-link small">Have an account?</Link>
        </div>
      </form>
      {error && <p style={{color:'red'}}>{error}</p>}
    </div>
  )
}
