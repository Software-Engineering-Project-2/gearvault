import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clearSession } from '../lib/api'
import { supabase } from '../lib/supabaseClient'
import SignInPromptModal from './SignInPromptModal'

export default function NavBar({ user, onSignOut }) {
  const location = useLocation()
  const [promptConfig, setPromptConfig] = useState(null)

  async function signOut() {
    await supabase.auth.signOut()
    clearSession()
    onSignOut()
    window.location.href = '/login'
  }

  const isActive = (path) => location.pathname === path

  const handleLoggedOutNav = (e, type) => {
    e.preventDefault()
    if (type === 'reservations') {
      setPromptConfig({
        title: 'Sign In to View Reservations',
        message: 'Please sign in or create an account to view your equipment reservations and rental history.',
      })
    } else if (type === 'staff') {
      setPromptConfig({
        title: 'Staff Authorization Required',
        message: 'Please sign in to access Counter Dispatch and staff operations.',
      })
    }
  }

  return (
    <>
      <header className="nav">
        <div className="inner">
          <Link to="/dashboard" className="logo">
            <div className="logo-icon">GV</div>
            <span>GearVault</span>
          </Link>

          <nav className="topbar-actions">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                >
                  Inventory
                </Link>
                <Link
                  to="/bookings"
                  className={`nav-link ${isActive('/bookings') ? 'active' : ''}`}
                >
                  Reservations
                </Link>
                <Link
                  to="/staff"
                  className={`staff-pill-btn ${isActive('/staff') ? 'active' : ''}`}
                >
                  <span>⚙️</span> Counter Dispatch
                </Link>
                <div className="user-badge-pill">
                  <span className="user-status-dot" />
                  <span>{user.email}</span>
                </div>
                <button className="btn secondary sm" onClick={signOut}>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/dashboard"
                  className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                >
                  Inventory
                </Link>
                <a
                  href="#reservations"
                  className="nav-link"
                  onClick={e => handleLoggedOutNav(e, 'reservations')}
                >
                  Reservations
                </a>
                <a
                  href="#staff"
                  className="staff-pill-btn"
                  onClick={e => handleLoggedOutNav(e, 'staff')}
                >
                  <span>⚙️</span> Counter Dispatch
                </a>
                <Link
                  to="/login"
                  className={`nav-link ${isActive('/login') ? 'active' : ''}`}
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="btn sm"
                >
                  Create Account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Sign-In Prompt Modal for Logged-Out Navigation */}
      <SignInPromptModal
        isOpen={Boolean(promptConfig)}
        onClose={() => setPromptConfig(null)}
        title={promptConfig?.title}
        message={promptConfig?.message}
      />
    </>
  )
}
