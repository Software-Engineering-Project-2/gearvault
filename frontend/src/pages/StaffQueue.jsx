import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'

const formatTime = value => {
  if (!value) return '-'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function StaffQueue() {
  const [activeTab, setActiveTab] = useState('confirmed') // 'confirmed' | 'active_rentals'
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [activeRentals, setActiveRentals] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Handover modal state
  const [handoverBooking, setHandoverBooking] = useState(null)
  const [showConditionLog, setShowConditionLog] = useState(false)
  const [conditionNotes, setConditionNotes] = useState('Item inspected with customer. All accessories included.')
  const [photoUrl, setPhotoUrl] = useState('')
  const [processingHandover, setProcessingHandover] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [bRes, rRes] = await Promise.all([
        api('/staff/bookings/confirmed'),
        api('/staff/rentals/active')
      ])
      setConfirmedBookings(bRes.bookings || [])
      setActiveRentals(rRes.rentals || [])
    } catch (err) {
      setError(err.message || 'Failed to load staff operations data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleHandoverSubmit = async (e) => {
    e.preventDefault()
    if (!handoverBooking) return
    setProcessingHandover(true)
    setError('')
    setMessage('')

    try {
      const payload = showConditionLog
        ? { notes: conditionNotes, photo_url: photoUrl }
        : {}

      const res = await api(`/staff/bookings/${handoverBooking.id}/handover`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      setMessage(res.message || 'Equipment successfully checked out to customer.')
      setHandoverBooking(null)
      setShowConditionLog(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to process handover.')
    } finally {
      setProcessingHandover(false)
    }
  }

  // Filter lists based on search
  const filteredBookings = confirmedBookings.filter(b => {
    const q = search.toLowerCase()
    return (
      b.item?.name?.toLowerCase().includes(q) ||
      b.item?.sku?.toLowerCase().includes(q) ||
      String(b.id).includes(q)
    )
  })

  const filteredRentals = activeRentals.filter(r => {
    const q = search.toLowerCase()
    return (
      r.item?.name?.toLowerCase().includes(q) ||
      r.item?.sku?.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    )
  })

  return (
    <div className="staff-queue-page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Staff Counter Operations</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Manage equipment pickup handovers and monitor active customer rentals.
            </p>
          </div>
          <button className="btn secondary" onClick={loadData} disabled={loading}>
            🔄 Refresh
          </button>
        </div>

        {message && <p className="notice" style={{ background: '#d7f5df', borderColor: '#17652d', color: '#17652d', marginTop: 12 }}>{message}</p>}
        {error && <p className="notice" style={{ color: '#95250e', marginTop: 12 }}>{error}</p>}
      </div>

      {/* Tabs */}
      <div className="payment-tabs" style={{ margin: '16px 0 8px' }}>
        <button
          className={`tab-btn ${activeTab === 'confirmed' ? 'active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
          style={{ fontSize: 14, padding: '10px 16px' }}
        >
          📦 Ready for Pickup ({confirmedBookings.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'active_rentals' ? 'active' : ''}`}
          onClick={() => setActiveTab('active_rentals')}
          style={{ fontSize: 14, padding: '10px 16px' }}
        >
          🚚 Active Rentals ({activeRentals.length})
        </button>
      </div>

      {/* Search filter */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === 'confirmed' ? 'pickup queue' : 'active rentals'} by item, SKU, or ID...`}
          style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #ddd' }}
        />
      </div>

      {/* Confirmed Bookings Tab */}
      {activeTab === 'confirmed' && (
        <div className="card">
          <h3>Confirmed Bookings Queue (Awaiting Customer Pickup)</h3>
          <p className="muted small">
            Deposit is confirmed. Hand over equipment and activate the rental when the customer arrives.
          </p>

          {loading ? (
            <div className="empty">Loading queue...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="empty">No confirmed bookings waiting for pickup.</div>
          ) : (
            filteredBookings.map(b => (
              <div key={b.id} className="booking-item booking-row">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{b.item?.name}</strong>
                    {b.item?.sku && <span className="badge">{b.item.sku}</span>}
                    <span className="badge available">Deposit Paid</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    Pickup: {formatTime(b.start_ts)} → Due: {formatTime(b.end_ts)}
                  </div>
                  <div className="small muted">
                    Booking #{b.id} • Deposit Held: ₹{b.deposit_amount}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <button
                    className="btn"
                    onClick={() => {
                      setHandoverBooking(b)
                      setMessage('')
                      setError('')
                    }}
                  >
                    Handover Equipment
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Active Rentals Tab */}
      {activeTab === 'active_rentals' && (
        <div className="card">
          <h3>Active Equipment Rentals</h3>
          <p className="muted small">
            All equipment currently checked out by customers.
          </p>

          {loading ? (
            <div className="empty">Loading active rentals...</div>
          ) : filteredRentals.length === 0 ? (
            <div className="empty">No active equipment rentals at this time.</div>
          ) : (
            filteredRentals.map(r => {
              const isOverdue = new Date(r.due_at) < new Date()
              return (
                <div key={r.id} className="booking-item booking-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{r.item?.name || `Item #${r.item_id}`}</strong>
                      {r.item?.sku && <span className="badge">{r.item.sku}</span>}
                      <span className={`badge ${isOverdue ? 'unavailable' : 'available'}`}>
                        {isOverdue ? '⚠️ Overdue' : 'Active'}
                      </span>
                    </div>
                    <div className="meta" style={{ marginTop: 4 }}>
                      Checked Out: {formatTime(r.checkout_at)} → Due: {formatTime(r.due_at)}
                    </div>
                    <div className="small muted">
                      Rental #{r.id} • Deposit Held: ₹{r.deposit_held || 0}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span className="badge" style={{ background: '#e9ecef', color: '#495057' }}>
                      Rented
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Handover Modal / Panel */}
      {handoverBooking && (
        <div className="card" style={{ border: '2px solid var(--accent)', marginTop: 16, background: '#fff9f6' }}>
          <h3>Process Equipment Handover — Booking #{handoverBooking.id}</h3>
          <p className="small muted">
            Item: <strong>{handoverBooking.item?.name}</strong> (SKU: {handoverBooking.item?.sku || 'N/A'})
          </p>

          <form onSubmit={handleHandoverSubmit} style={{ marginTop: 12 }}>
            <div className="meta-box" style={{ background: '#fff', border: '1px solid #ddd' }}>
              <div className="meta-row">
                <span>Rental Duration:</span>
                <strong>{formatTime(handoverBooking.start_ts)} → {formatTime(handoverBooking.end_ts)}</strong>
              </div>
              <div className="meta-row">
                <span>Deposit Confirmed:</span>
                <strong style={{ color: 'var(--accent)' }}>₹{handoverBooking.deposit_amount}</strong>
              </div>
            </div>

            {/* Optional Pre-Rental Condition Logging Checkbox */}
            <div style={{ margin: '14px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={showConditionLog}
                  onChange={e => setShowConditionLog(e.target.checked)}
                />
                Log Pre-Rental Condition Inspection (Optional)
              </label>
            </div>

            {showConditionLog && (
              <div style={{ background: '#fff', padding: 14, border: '1px solid #ddd', borderRadius: 6, marginBottom: 14 }}>
                <div className="form-row">
                  <label>Inspection Notes</label>
                  <textarea
                    rows={2}
                    value={conditionNotes}
                    onChange={e => setConditionNotes(e.target.value)}
                    placeholder="Enter pre-rental equipment condition notes..."
                  />
                </div>
                <div className="form-row">
                  <label>Pre-Rental Photo Reference (URL or Mock Attachment)</label>
                  <input
                    type="text"
                    value={photoUrl}
                    onChange={e => setPhotoUrl(e.target.value)}
                    placeholder="https://example.com/photos/item-condition-front.jpg"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="submit"
                className="btn"
                disabled={processingHandover}
                style={{ flex: 1, padding: '10px 16px' }}
              >
                {processingHandover ? 'Activating Rental...' : '✅ Complete Handover & Activate Rental'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setHandoverBooking(null)}
                disabled={processingHandover}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
