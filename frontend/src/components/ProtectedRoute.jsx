import React from 'react'
import { Navigate } from 'react-router-dom'
import { getToken, getUser } from '../lib/api'

export default function ProtectedRoute({ children, requiredRole }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole === 'staff') {
    const user = getUser()
    const isStaffOrManager = Boolean(
      user && (
        user.role === 'staff' ||
        user.role === 'manager' ||
        user.user_metadata?.role === 'staff' ||
        user.user_metadata?.role === 'manager' ||
        user.email?.toLowerCase().includes('staff') ||
        user.email?.toLowerCase().includes('manager') ||
        user.email?.toLowerCase().includes('admin')
      )
    )

    if (!isStaffOrManager) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}
