import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
import Checkout from './pages/Checkout'
import StaffQueue from './pages/StaffQueue'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'
import { getUser } from './lib/api'

export default function App() {
  const [user, setUser] = useState(getUser())

  return (
    <>
      <NavBar user={user} onSignOut={() => setUser(null)} />
      <div className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login onAuthenticated={setUser} />} />
          <Route path="/signup" element={<Signup onAuthenticated={setUser} />} />
          {/* Public Catalog Browsing (FR005, FR006) */}
          <Route path="/dashboard" element={<Dashboard />} />
          {/* Protected Customer & Staff Routes (FR003) */}
          <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
          <Route path="/checkout/:bookingId" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/staff" element={<ProtectedRoute requiredRole="staff"><StaffQueue /></ProtectedRoute>} />
        </Routes>
      </div>
    </>
  )
}
