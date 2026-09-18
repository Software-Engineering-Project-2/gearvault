import React from 'react'
import { Navigate, Link } from 'react-router-dom'
import { getToken, getUser } from '../lib/api'

export default function ProtectedRoute({ children, allowedRoles }) {
  const token = getToken()
  const user = getUser()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = (user.role || 'customer').toLowerCase()
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase())

    if (!normalizedAllowed.includes(userRole)) {
      return (
        <div className="card" style={{ maxWidth: 540, margin: '60px auto', padding: '36px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🚫</div>
          <h2 style={{ color: '#ef4444', marginBottom: 8 }}>403 — Access Denied</h2>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
            You do not have permission to access this page. Your current account role is <strong>{userRole.toUpperCase()}</strong>.
            This section requires one of the following roles: <strong>{allowedRoles.map(r => r.toUpperCase()).join(', ')}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/dashboard" className="btn sm">
              Back to Inventory
            </Link>
          </div>
        </div>
      )
    }
  }

  return children
}

