import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
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
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
        </Routes>
      </div>
    </>
  )
}
