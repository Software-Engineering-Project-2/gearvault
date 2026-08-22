import React from 'react'
import { Link } from 'react-router-dom'
import { clearSession } from '../lib/api'
import { supabase } from '../lib/supabaseClient'

export default function NavBar({ user, onSignOut }){
  async function signOut(){
    await supabase.auth.signOut()
    clearSession()
    onSignOut()
    window.location.href = '/login'
  }

  return (
    <div className="nav">
      <div className="inner">
        <div className="logo"><span className="dot"/>GearVault</div>
        <div className="topbar-actions">
          {user ? (
            <>
              <Link to="/dashboard" className="inline-link">Catalog</Link>
              <Link to="/bookings" className="inline-link">My bookings</Link>
              <Link to="/staff" className="inline-link" style={{ fontWeight: 600, color: '#ffb000' }}>Staff Operations</Link>
              <div className="muted" style={{marginRight:8}}>Signed in as: {user.email}</div>
              <button className="btn" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="inline-link">Log in</Link>
              <Link to="/signup" className="inline-link">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
