import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { api, getUser } from '../lib/api'
import SignInPromptModal from '../components/SignInPromptModal'

const localInputValue = date => {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const futureLocal = hours => {
  const d = new Date(Date.now() + hours * 3600000)
  d.setMinutes(0, 0, 0)
  return localInputValue(d)
}

const toIso = value => new Date(value).toISOString()

const toLocalDateTimeValue = value => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : localInputValue(date)
}

export default function ItemDetail() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [user] = useState(getUser())
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [selectedAction, setSelectedAction] = useState(null)

  // Initialize start/end dates from state, query parameter, or fallback
  const initialStart = toLocalDateTimeValue(
    location.state?.start || new URLSearchParams(location.search).get('start_ts') || futureLocal(24)
  )
  const initialEnd = toLocalDateTimeValue(
    location.state?.end || new URLSearchParams(location.search).get('end_ts') || futureLocal(48)
  )

  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)

  const minimumStart = useMemo(() => futureLocal(1), [])
  const isWindowValid = Boolean(
    start && end && new Date(start) >= new Date(minimumStart) && new Date(end) > new Date(start)
  )

  async function loadItem() {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (isWindowValid) {
        p.set('start_ts', toIso(start))
        p.set('end_ts', toIso(end))
      }
      const data = await api(`/items/${itemId}?${p}`)
      setItem(data.item)
      setMessage('')
    } catch (e) {
      setMessage(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItem()
  }, [itemId, start, end])

  function updateStart(value) {
    setStart(value)
    if (!end || new Date(end) <= new Date(value)) {
      setEnd(localInputValue(new Date(new Date(value).getTime() + 24 * 3600000)))
    }
  }

  async function handleBooking(actionType) {
    if (!isWindowValid) return

    // Auth check
    if (!user) {
      setSelectedAction(actionType)
      return
    }

    setLoading(true)
    setMessage('')
    setIsSuccess(false)

    try {
      const d = await api('/bookings/hold', {
        method: 'POST',
        body: JSON.stringify({ item_id: parseInt(itemId), start_ts: toIso(start), end_ts: toIso(end) })
      })

      if (actionType === 'checkout') {
        // Direct checkout -> Redirect to checkout page immediately
        navigate(`/checkout/${d.booking.id}`, { state: { booking: d.booking } })
      } else {
        // Soft hold -> Keep user on details page and show notice
        setMessage('Hold placed successfully for 15 minutes. You can review and authorize it under your Reservations.')
        setIsSuccess(true)
        loadItem()
      }
    } catch (e) {
      setMessage(e.message)
      loadItem()
    }
  }

  if (loading && !item) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '32px auto', textAlign: 'center' }}>
        <div className="empty">Loading equipment specifications…</div>
      </div>
    )
  }

  if (!item && message) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '32px auto' }}>
        <h2>Equipment Error</h2>
        <p className="notice error">{message}</p>
        <Link to="/dashboard" className="btn" style={{ display: 'inline-block', marginTop: 16 }}>
          Return to Inventory
        </Link>
      </div>
    )
  }

  return (
    <div className="item-detail-page">
      <div className="checkout-header" style={{ marginBottom: 20 }}>
        <Link to="/dashboard" className="inline-link small">← Back to Inventory</Link>
        <h2>{item.name}</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {item.category?.name || 'General Equipment'} • SKU: {item.sku || 'N/A'}
        </p>
      </div>

      {message && (
        <div className={`notice ${isSuccess ? 'success' : 'error'}`} style={{ marginBottom: 20 }}>
          {message}
        </div>
      )}

      <div className="grid">
        {/* Left Column: Equipment Description and Valuation Info */}
        <div className="left">
          <div className="card">
            <h3>Specifications & Details</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {item.description || 'No detailed specifications provided.'}
            </p>

            <h3 style={{ marginTop: 32 }}>Asset Valuation</h3>
            <div className="price-breakdown" style={{ marginTop: 12 }}>
              <div className="price-row">
                <span>Replacement Cost</span>
                <strong>₹{item.replacement_price?.toLocaleString('en-IN')}</strong>
              </div>
              <div className="price-row">
                <span>Purchase Price</span>
                <span className="muted">₹{item.purchase_price?.toLocaleString('en-IN')}</span>
              </div>
              <div className="price-row">
                <span>Purchase Date</span>
                <span className="muted">{item.purchase_date ? new Date(`${item.purchase_date}T00:00:00`).toLocaleDateString('en-IN') : 'Not recorded'}</span>
              </div>
              <div className="price-row total">
                <div>
                  <strong>Current Depreciated Valuation</strong>
                  <p className="muted small" style={{ fontWeight: 'normal', margin: '2px 0 0' }}>
                    {item.pricing?.age_years !== undefined
                      ? `${item.pricing.age_years} year asset age · used to calculate liability rates & security deposits`
                      : 'Used to calculate liability rates & security deposits'}
                  </p>
                </div>
                <strong className="accent-amount">₹{item.depreciated_value?.toLocaleString('en-IN')}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Date Selection, Live Availability, Booking Actions */}
        <div className="right">
          <div className="card">
            <h3>Live Availability Calendar</h3>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Choose your rental window to refresh availability and pricing.</p>

            <div className="filters" style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '16px 0 20px', padding: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Rental Start</label>
                <input
                  type="datetime-local"
                  min={minimumStart}
                  value={start}
                  onChange={e => updateStart(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Rental Return</label>
                <input
                  type="datetime-local"
                  min={start || minimumStart}
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {!isWindowValid && (
              <div className="notice" style={{ fontSize: 13, padding: '10px 12px' }}>
                Specify future rental dates to calculate estimates.
              </div>
            )}

            {isWindowValid && (
              <div className="pricing-preview-box" style={{ margin: '16px 0 24px' }}>
                <div className="pricing-preview-row">
                  <span className="muted small">Daily Base Rate:</span>
                  <strong>₹{(item.pricing?.daily_rate ?? item.daily_rate)?.toLocaleString('en-IN')}/day</strong>
                </div>

                {item.estimated_price !== undefined && (
                  <>
                    <div className="pricing-preview-row" style={{ marginTop: 6 }}>
                      <span className="muted small">Estimated Rent ({item.duration_days}d):</span>
                      <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>
                        ₹{item.estimated_price?.toLocaleString('en-IN')}
                      </strong>
                    </div>
                    <div className="pricing-preview-row" style={{ marginTop: 6, borderTop: '1px solid var(--card-border-subtle)', paddingTop: 6 }}>
                      <span className="muted small">Refundable Deposit (20%):</span>
                      <strong style={{ color: 'var(--accent)', fontSize: 15 }}>
                        ₹{item.estimated_deposit?.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span className="muted small">Item Availability:</span>
              <span className={`badge ${item.available ? 'available' : 'unavailable'}`}>
                {item.available ? '● Available' : '● In Use'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn"
                style={{ width: '100%', padding: '12px 20px', fontSize: 14.5, fontWeight: 600 }}
                disabled={!item.available || !isWindowValid || loading}
                onClick={() => handleBooking('checkout')}
              >
                Book & Checkout Directly
              </button>
              
              <button
                className="btn secondary"
                style={{ width: '100%', padding: '12px 20px', fontSize: 14.5, fontWeight: 500 }}
                disabled={!item.available || !isWindowValid || loading}
                onClick={() => handleBooking('reserve')}
              >
                Reserve (Place 15-Min Hold)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Guest Sign-In Prompt Modal */}
      <SignInPromptModal
        isOpen={Boolean(selectedAction)}
        onClose={() => setSelectedAction(null)}
        title="Sign In to Proceed"
        message={`Please sign in or create an account to book or place a reservation hold on ${item.name}.`}
      />
    </div>
  )
}
