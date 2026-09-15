import React, { useEffect, useState, useRef } from 'react'
import { api, getToken } from '../lib/api'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  const fetchNotifications = async () => {
    if (!getToken()) return
    try {
      const data = await api('/notifications')
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch {
      // Quiet fail if not logged in
    }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 20000) // Poll every 20s
    return () => clearInterval(interval)
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAsRead = async (id) => {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' })
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // Ignore
    }
  }

  const markAllAsRead = async () => {
    setLoading(true)
    try {
      await api('/notifications/read-all', { method: 'POST' })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  const getIcon = (type) => {
    switch (type) {
      case 'hold_expired': return '⏳'
      case 'booking_confirmed': return '💳'
      case 'return_due': return '🚚'
      case 'damage_assessed': return '🛠️'
      case 'dispute_resolved': return '⚖️'
      default: return '🔔'
    }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
  }

  if (!getToken()) return null

  return (
    <div className="notif-bell-container" ref={dropdownRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="In-App Notifications"
        aria-label="Notifications"
      >
        <span style={{ fontSize: 17 }}>🔔</span>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <div>
              <strong style={{ fontSize: 15 }}>Notifications</strong>
              {unreadCount > 0 && (
                <span className="small muted" style={{ marginLeft: 6 }}>({unreadCount} unread)</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-clear-btn"
                onClick={markAllAsRead}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`notif-item ${n.read ? 'read' : 'unread'}`}
                  onClick={() => !n.read && markAsRead(n.id)}
                >
                  <div className="notif-icon">{getIcon(n.type)}</div>
                  <div className="notif-body">
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-message">{n.message}</div>
                    <div className="notif-time">{formatTime(n.created_at)}</div>
                  </div>
                  {!n.read && <div className="notif-unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
