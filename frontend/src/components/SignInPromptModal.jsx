import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function SignInPromptModal({ isOpen, onClose, title, message, targetPath = '/login' }) {
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleSignIn = () => {
    onClose()
    navigate(targetPath || '/login')
  }

  const handleSignUp = () => {
    onClose()
    navigate('/signup')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 22,
          padding: '32px 28px',
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.18)',
          textAlign: 'center',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(0, 113, 227, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            margin: '0 auto 16px',
            color: 'var(--accent)',
          }}
        >
          🔒
        </div>

        <h3 style={{ fontSize: 20, margin: '0 0 8px', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          {title || 'Sign In Required'}
        </h3>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
          {message || 'Please sign in or create an account to reserve equipment and manage your reservations.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn"
            style={{ width: '100%', padding: '11px 20px', fontSize: 14.5, fontWeight: 600 }}
            onClick={handleSignIn}
          >
            Sign In
          </button>
          
          <button
            className="btn secondary"
            style={{ width: '100%', padding: '11px 20px', fontSize: 14.5, fontWeight: 500 }}
            onClick={handleSignUp}
          >
            Create Account
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
              marginTop: 4,
              padding: '6px',
            }}
          >
            Continue Browsing
          </button>
        </div>
      </div>
    </div>
  )
}
