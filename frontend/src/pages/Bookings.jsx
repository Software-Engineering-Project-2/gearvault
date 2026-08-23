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
      setMessage('Reservation hold released successfully.')
      load()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'confirmed') return <span className="badge available">● Confirmed</span>
    if (s === 'held') return <span className="badge held">● Hold (15 Min)</span>
    if (s === 'active' || s === 'completed') return <span className="badge available">● {status}</span>
    return <span className="badge unavailable">● {status}</span>
  }

  return (
    <div className="card bookings-page">
      <div className="card-header">
        <div>
          <h2>Reservations & Rentals</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Manage active reservation holds, confirmed dispatches, and rental agreements.
          </p>
        </div>
      </div>

      {message && <div className="notice" style={{ marginBottom: 16 }}>{message}</div>}

      {loading ? (
        <div className="empty">Loading reservations…</div>
      ) : bookings.length ? (
        bookings.map(b => (
          <div className="booking-item" key={b.id}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16 }}>{b.item?.name}</strong>
                {b.item?.sku && <span className="badge" style={{ fontSize: 11 }}>{b.item.sku}</span>}
              </div>
              <div className="meta">
                {time(b.start_ts)} → {time(b.end_ts)}
              </div>
              {b.rental_price !== undefined && b.rental_price !== null && (
                <div className="small" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                  Estimated Rental: <strong style={{ color: 'var(--text-primary)' }}>₹{b.rental_price.toLocaleString('en-IN')}</strong> ({b.duration_days}d) • Security Deposit: ₹{b.deposit_amount?.toLocaleString('en-IN')}
                </div>
              )}
              {b.status === 'Held' && (
                <div className="small" style={{ color: '#c9251d', fontWeight: 500, marginTop: 4 }}>
                  ⏳ Hold window closes: {time(b.hold_expires_at)}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {getStatusBadge(b.status)}

              {b.status === 'Held' && (
                <div className="booking-actions">
                  <button className="btn" onClick={() => proceedToCheckout(b)}>
                    Authorize ₹{b.deposit_amount} Deposit
                  </button>
                  <button className="btn secondary" onClick={() => cancel(b.id)}>
                    Release Hold
                  </button>
                </div>
              )}

              {b.status !== 'Held' && b.status !== 'Cancelled' && b.status !== 'Expired' && (
                <div style={{ marginTop: 4 }}>
                  <button
                    className="btn secondary sm"
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
        <div className="empty">No reservations or active rentals on record.</div>
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
