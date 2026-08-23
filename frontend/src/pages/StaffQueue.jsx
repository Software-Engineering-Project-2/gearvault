import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import RentalAgreementModal from '../components/RentalAgreementModal'

const formatTime = value => {
  if (!value) return '—'
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
  const [conditionNotes, setConditionNotes] = useState('Item inspected with client. All standard accessories, caps, and battery included.')
  const [photoUrl, setPhotoUrl] = useState('')
  const [processingHandover, setProcessingHandover] = useState(false)
  const [selectedAgreementData, setSelectedAgreementData] = useState(null)

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
      setError(err.message || 'Failed to load counter operations queue.')
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

      setMessage(res.message || 'Equipment successfully dispatched and rental activated.')
      setHandoverBooking(null)
      setShowConditionLog(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to process equipment dispatch.')
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
            <h2>Counter Dispatch & Operations</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Manage counter collection handovers, verify equipment condition, and track active client rentals.
            </p>
          </div>
          <button className="btn secondary sm" onClick={loadData} disabled={loading}>
            🔄 Refresh
          </button>
        </div>

        {message && <div className="notice success" style={{ marginTop: 14 }}>{message}</div>}
        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      {/* Apple Segmented Control */}
      <div className="payment-tabs" style={{ margin: '0 0 16px', maxWidth: 440 }}>
        <button
          className={`tab-btn ${activeTab === 'confirmed' ? 'active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
        >
          📦 Ready for Collection ({confirmedBookings.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'active_rentals' ? 'active' : ''}`}
          onClick={() => setActiveTab('active_rentals')}
        >
          🚚 Active Rentals ({activeRentals.length})
        </button>
      </div>

      {/* Search filter */}
      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === 'confirmed' ? 'collection queue' : 'active rentals'} by equipment, SKU, or order ID...`}
        />
      </div>

      {/* Confirmed Bookings Tab */}
      {activeTab === 'confirmed' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Orders Awaiting Collection</h3>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                Deposit is secured. Verify physical condition with client and authorize dispatch.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="empty">Loading collection queue…</div>
          ) : filteredBookings.length === 0 ? (
            <div className="empty">No orders currently awaiting counter collection.</div>
          ) : (
            filteredBookings.map(b => (
              <div key={b.id} className="booking-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 16 }}>{b.item?.name}</strong>
                    {b.item?.sku && <span className="badge" style={{ fontSize: 11 }}>{b.item.sku}</span>}
                    <span className="badge available">● Deposit Confirmed</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    Collection: {formatTime(b.start_ts)} → Due: {formatTime(b.end_ts)}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Order #{b.id} • {b.rental_price ? `Rental: ₹${b.rental_price.toLocaleString('en-IN')} (${b.duration_days}d) • ` : ''}Deposit: ₹{b.deposit_amount?.toLocaleString('en-IN')}
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
                    Authorize Dispatch
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
          <div className="card-header">
            <div>
              <h3>Active Field Rentals</h3>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                All equipment currently in active client possession.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="empty">Loading active rentals…</div>
          ) : filteredRentals.length === 0 ? (
            <div className="empty">No equipment currently deployed in the field.</div>
          ) : (
            filteredRentals.map(r => {
              const isOverdue = new Date(r.due_at) < new Date()
              return (
                <div key={r.id} className="booking-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 16 }}>{r.item?.name || `Item #${r.item_id}`}</strong>
                      {r.item?.sku && <span className="badge">{r.item.sku}</span>}
                      <span className={`badge ${isOverdue ? 'unavailable' : 'available'}`}>
                        {isOverdue ? '⚠️ Overdue' : '● Active'}
                      </span>
                    </div>
                    <div className="meta" style={{ marginTop: 4 }}>
                      Dispatched: {formatTime(r.checkout_at)} → Due: {formatTime(r.due_at)}
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      Rental #{r.id} • {r.total_price ? `Fee: ₹${r.total_price.toLocaleString('en-IN')} • ` : ''}Deposit Held: ₹{r.deposit_held?.toLocaleString('en-IN') || 0}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <button
                      className="btn secondary sm"
                      onClick={() => setSelectedAgreementData({
                        rentalId: r.id,
                        bookingId: r.booking_id,
                        item: r.item,
                        startTs: r.checkout_at,
                        endTs: r.due_at,
                        checkoutAt: r.checkout_at,
                        pricing: {
                          rental_price: r.total_price,
                          depreciated_value: r.item?.depreciated_value,
                          duration_tier: 'Daily Tier',
                          duration_days: Math.max(1, Math.ceil((new Date(r.due_at) - new Date(r.checkout_at)) / 86400000)),
                        },
                        depositAmount: r.deposit_held,
                        conditionNotes: 'Verified during counter collection inspection.',
                        customer: { id: r.customer_id },
                      })}
                    >
                      📄 Agreement
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Handover Modal / Panel */}
      {handoverBooking && (
        <div className="card" style={{ border: '1px solid var(--accent)', marginTop: 24, boxShadow: '0 8px 30px rgba(0, 113, 227, 0.12)' }}>
          <h3>Equipment Dispatch — Order #{handoverBooking.id}</h3>
          <p className="small muted">
            Asset: <strong>{handoverBooking.item?.name}</strong> (SKU: {handoverBooking.item?.sku || 'N/A'})
          </p>

          <form onSubmit={handleHandoverSubmit} style={{ marginTop: 16 }}>
            <div className="meta-box">
              <div className="meta-row">
                <span className="muted">Rental Period:</span>
                <strong>{formatTime(handoverBooking.start_ts)} → {formatTime(handoverBooking.end_ts)}</strong>
              </div>
              {handoverBooking.rental_price && (
                <div className="meta-row">
                  <span className="muted">Rental Charge ({handoverBooking.duration_days}d):</span>
                  <strong>₹{handoverBooking.rental_price.toLocaleString('en-IN')}</strong>
                </div>
              )}
              <div className="meta-row">
                <span className="muted">Deposit Confirmed:</span>
                <strong style={{ color: 'var(--accent)' }}>₹{handoverBooking.deposit_amount?.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            {/* Pre-Rental Condition Logging Checkbox */}
            <div style={{ margin: '16px 0 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={showConditionLog}
                  onChange={e => setShowConditionLog(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Log Pre-Dispatch Condition Inspection Checklist (Optional)
              </label>
            </div>

            {showConditionLog && (
              <div className="meta-box" style={{ marginBottom: 16 }}>
                <div className="form-row">
                  <label>Inspection Notes</label>
                  <textarea
                    rows={2}
                    value={conditionNotes}
                    onChange={e => setConditionNotes(e.target.value)}
                    placeholder="Enter pre-dispatch hardware inspection notes..."
                  />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Inspection Photo Reference URL</label>
                  <input
                    type="text"
                    value={photoUrl}
                    onChange={e => setPhotoUrl(e.target.value)}
                    placeholder="https://example.com/photos/item-condition.jpg"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn"
                disabled={processingHandover}
                style={{ flex: 1 }}
              >
                {processingHandover ? 'Dispatching Gear…' : 'Authorize Handover & Dispatch'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSelectedAgreementData({
                  bookingId: handoverBooking.id,
                  item: handoverBooking.item,
                  startTs: handoverBooking.start_ts,
                  endTs: handoverBooking.end_ts,
                  checkoutAt: new Date().toISOString(),
                  pricing: handoverBooking.pricing,
                  depositAmount: handoverBooking.deposit_amount,
                  conditionNotes: showConditionLog ? conditionNotes : 'Standard pre-dispatch hardware verification.',
                  photoUrl: showConditionLog ? photoUrl : null,
                  customer: { id: handoverBooking.customer_id },
                })}
                disabled={processingHandover}
              >
                📄 Preview Agreement
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

      {/* Digital Rental Agreement Modal (FR014) */}
      <RentalAgreementModal
        isOpen={Boolean(selectedAgreementData)}
        onClose={() => setSelectedAgreementData(null)}
        data={selectedAgreementData}
      />
    </div>
  )
}
