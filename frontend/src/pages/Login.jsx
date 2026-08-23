import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { setSession } from '../lib/api'
import { supabase } from '../lib/supabaseClient'

export default function Login({ onAuthenticated }) {
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setSession(data.session.access_token, data.user)
      onAuthenticated(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Login error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 440, margin: '40px auto', padding: '36px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="logo-icon" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18, margin: '0 auto 14px' }}>
          GV
        </div>
        <h2 style={{ fontSize: 24, margin: '0 0 6px' }}>Sign In to GearVault</h2>
        <p className="muted" style={{ margin: 0 }}>Access your equipment rental account</p>
      </div>

      {error && <div className="notice error" style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <button
          className="btn"
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 600, marginTop: 8 }}
        >
          {loading ? 'Signing In…' : 'Sign In'}
        </button>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13.5 }} className="muted">
          Don't have an account?{' '}
          <Link to="/signup" className="inline-link">
            Create account
          </Link>
        </div>
      </form>
    </div>
  )
}
