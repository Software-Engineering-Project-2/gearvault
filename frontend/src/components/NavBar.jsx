import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clearSession } from '../lib/api'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from './NotificationBell'

export default function NavBar({ user, onSignOut }) {
  const location = useLocation()

  async function signOut() {
    await supabase.auth.signOut()
    clearSession()
    onSignOut()
    window.location.href = '/login'
  }

  const isActive = (path) => location.pathname === path

  const role = (user?.role || 'customer').toLowerCase()

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
                {/* Catalog Inventory: All authenticated roles */}
                <Link
                  to="/dashboard"
                  className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                >
                  Inventory
                </Link>

                {/* Customer only: Reservations */}
                {role === 'customer' && (
                  <Link
                    to="/bookings"
                    className={`nav-link ${isActive('/bookings') ? 'active' : ''}`}
                  >
                    Reservations
                  </Link>
                )}

                {/* Manager only: Analytics & Operations Reports */}
                {role === 'manager' && (
                  <Link
                    to="/analytics"
                    className={`nav-link ${isActive('/analytics') ? 'active' : ''}`}
                  >
                    Analytics
                  </Link>
                )}

                {/* Staff only: Counter Dispatch Queue */}
                {role === 'staff' && (
                  <Link
                    to="/staff"
                    className={`staff-pill-btn ${isActive('/staff') ? 'active' : ''}`}
                  >
                    <span>⚙️</span> Counter Dispatch
                  </Link>
                )}


                <NotificationBell />
                <div className="user-badge-pill">
                  <span className="user-status-dot" />
                  <span>{user.email}</span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      marginLeft: '6px',
                      background:
                        role === 'manager'
                          ? '#e0e7ff'
                          : role === 'staff'
                          ? '#fef3c7'
                          : '#e0f2fe',
                      color:
                        role === 'manager'
                          ? '#3730a3'
                          : role === 'staff'
                          ? '#92400e'
                          : '#0369a1',
                    }}
                  >
                    {role}
                  </span>
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
    </>
  )
}
