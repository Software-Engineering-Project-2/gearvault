import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getUser } from '../lib/api'
import RentalAgreementModal from '../components/RentalAgreementModal'

const time = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function Bookings() {
  const [bookings, setBookings] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedAgreementBooking, setSelectedAgreementBooking] = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      setBookings((await api('/bookings/mine')).bookings)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const proceedToCheckout = (booking) => {
    navigate(`/checkout/${booking.id}`, { state: { booking } })
  }

  const cancel = async id => {
    try {
      await api(`/bookings/${id}`, { method: 'DELETE' })
      setMessage('Hold cancelled.')
      load()
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div className="card bookings-page">
      <h2>Your bookings</h2>
      <p className="muted">Times are shown in your current local timezone.</p>
      {message && <p className="notice">{message}</p>}
      {loading ? (
        <div className="empty">Loading…</div>
      ) : bookings.length ? (
        bookings.map(b => (
          <div className="booking-item booking-row" key={b.id}>
            <div style={{ flex: 1 }}>
              <strong>{b.item?.name}</strong>
              <div className="meta">
                {time(b.start_ts)} → {time(b.end_ts)}
              </div>
              {b.rental_price !== undefined && b.rental_price !== null && (
                <div className="small" style={{ color: '#475569', marginTop: 2 }}>
                  Estimated Rental: <strong>₹{b.rental_price.toLocaleString('en-IN')}</strong> ({b.duration_days}d • {b.duration_tier} Tier) • Deposit: ₹{b.deposit_amount?.toLocaleString('en-IN')}
                </div>
              )}
              {b.status === 'Held' && (
                <div className="meta" style={{ color: '#95250e', fontWeight: 500, marginTop: 2 }}>
                  Hold expires: {time(b.hold_expires_at)}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${b.status === 'Confirmed' ? 'available' : b.status === 'Held' ? 'unavailable' : ''}`}>
                {b.status}
              </span>
              {b.status === 'Held' && (
                <div className="booking-actions">
                  <button className="btn" onClick={() => proceedToCheckout(b)}>
                    Pay ₹{b.deposit_amount}
                  </button>
                  <button className="btn secondary" onClick={() => cancel(b.id)}>
                    Cancel
                  </button>
                </div>
              )}
              {b.status !== 'Held' && b.status !== 'Cancelled' && b.status !== 'Expired' && (
                <div style={{ marginTop: 6 }}>
                  <button
                    className="btn secondary"
                    style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={() => setSelectedAgreementBooking(b)}
                  >
                    📄 View Agreement
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="empty">You have no bookings yet.</div>
      )}

      {/* Digital Rental Agreement Modal */}
      <RentalAgreementModal
        isOpen={Boolean(selectedAgreementBooking)}
        onClose={() => setSelectedAgreementBooking(null)}
        data={{
          bookingId: selectedAgreementBooking?.id,
          customer: getUser(),
          item: selectedAgreementBooking?.item,
          startTs: selectedAgreementBooking?.start_ts,
          endTs: selectedAgreementBooking?.end_ts,
          pricing: selectedAgreementBooking?.pricing,
          depositAmount: selectedAgreementBooking?.deposit_amount,
          paymentProvider: 'Simulated Gateway',
        }}
      />
    </div>
  )
}
