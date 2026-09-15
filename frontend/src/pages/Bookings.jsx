import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getUser } from '../lib/api'
import RentalAgreementModal from '../components/RentalAgreementModal'

const time = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function Bookings() {
  const [bookings, setBookings] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedAgreementBooking, setSelectedAgreementBooking] = useState(null)
  
  // Customer Dispute modal state (FR019)
  const [disputeRental, setDisputeRental] = useState(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)

  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api('/bookings/mine')
      setBookings(res.bookings || [])
    } catch (err) {
      setError(err.message || 'Failed to load bookings')
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
    } catch (err) {
      setError(err.message || 'Failed to release hold.')
    }
  }

  const handleDisputeSubmit = async (e) => {
    e.preventDefault()
    if (!disputeRental || !disputeReason.trim()) return
    setSubmittingDispute(true)
    setError('')
    setMessage('')

    try {
      const res = await api(`/rentals/${disputeRental.id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ reason: disputeReason.trim() }),
      })
      setMessage(res.message || 'Dispute submitted. A manager will review your assessment.')
      setDisputeRental(null)
      setDisputeReason('')
      load()
    } catch (err) {
      setError(err.message || 'Failed to submit dispute.')
    } finally {
      setSubmittingDispute(false)
    }
  }

  const getStatusBadge = (b) => {
    const rental = b.rental
    if (rental) {
      const rStatus = (rental.status || '').toLowerCase()
      if (rStatus === 'disputed') return <span className="badge disputed">⚠️ Disputed</span>
      if (rStatus === 'under_assessment') return <span className="badge held">🔍 Under Assessment</span>
      if (rStatus === 'presumed_lost') return <span className="badge unavailable">❌ Presumed Lost</span>
      if (rStatus === 'closed') return <span className="badge available">✓ Returned & Settled</span>
      if (rStatus === 'active') return <span className="badge available">● Active Rental</span>
    }

    const s = (b.status || '').toLowerCase()
    if (s === 'confirmed') return <span className="badge available">● Confirmed</span>
    if (s === 'held') return <span className="badge held">● Hold (15 Min)</span>
    if (s === 'active' || s === 'completed') return <span className="badge available">● {b.status}</span>
    return <span className="badge unavailable">● {b.status}</span>
  }

  return (
    <div className="card bookings-page">
      <div className="card-header">
        <div>
          <h2>Reservations & Rentals</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Manage active reservation holds, view rental return assessments, and review deposit settlements.
          </p>
        </div>
      </div>

      {message && <div className="notice success" style={{ marginBottom: 16 }}>{message}</div>}
      {error && <div className="notice error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="empty">Loading reservations…</div>
      ) : bookings.length ? (
        bookings.map(b => {
          const rental = b.rental
          const assessment = rental?.damage_assessment
          const hasDeductions = assessment && (assessment.damage_deduction > 0 || assessment.late_penalty > 0)

          return (
            <div className="booking-item" key={b.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 16 }}>{b.item?.name}</strong>
                    {b.item?.sku && <span className="badge" style={{ fontSize: 11 }}>{b.item.sku}</span>}
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
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
                  {getStatusBadge(b)}

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

              {/* Assessment & Return Outcome Box (FR019, FR026) */}
              {rental && assessment && (
                <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid var(--card-border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Return Settlement & Deposit Outcome:
                    </span>
                    {assessment.status === 'disputed' && (
                      <span className="badge disputed" style={{ fontSize: 11 }}>⚖️ Dispute Under Review</span>
                    )}
                    {assessment.status === 'resolved' && (
                      <span className="badge resolved" style={{ fontSize: 11 }}>✓ Dispute Settled by Manager</span>
                    )}
                  </div>

                  <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: 'var(--text-secondary)' }}>
                    <span>Deposit Refunded: <strong style={{ color: '#107c10' }}>₹{assessment.deposit_refunded?.toLocaleString('en-IN')}</strong></span>
                    {assessment.damage_deduction > 0 && (
                      <span>Damage Deduction: <strong style={{ color: '#c9251d' }}>-₹{assessment.damage_deduction?.toLocaleString('en-IN')}</strong> ({assessment.damage_type?.name || 'Damage'} Lv.{assessment.severity})</span>
                    )}
                    {assessment.late_penalty > 0 && (
                      <span>Late Penalty: <strong style={{ color: '#c9251d' }}>-₹{assessment.late_penalty?.toLocaleString('en-IN')}</strong></span>
                    )}
                  </div>

                  {/* Customer Dispute statement */}
                  {assessment.status === 'disputed' && assessment.dispute_reason && (
                    <div className="small muted" style={{ marginTop: 6, fontStyle: 'italic' }}>
                      Dispute rationale: "{assessment.dispute_reason}"
                    </div>
                  )}

                  {/* Manager Override resolution notes */}
                  {assessment.status === 'resolved' && assessment.manager_override_amount !== null && (
                    <div className="small" style={{ marginTop: 6, color: '#065f46', background: '#ecfdf5', padding: '6px 10px', borderRadius: 6 }}>
                      Manager Override: Final deduction adjusted to <strong>₹{assessment.manager_override_amount?.toLocaleString('en-IN')}</strong>. {assessment.manager_notes && `(${assessment.manager_notes})`}
                    </div>
                  )}

                  {/* Dispute Action button if assessed with deductions */}
                  {assessment.status === 'assessed' && hasDeductions && (
                    <div style={{ marginTop: 10, textAlign: 'right' }}>
                      <button
                        className="btn secondary sm"
                        onClick={() => {
                          setDisputeRental(rental)
                          setDisputeReason('')
                        }}
                      >
                        ⚖️ Dispute Damage Deduction
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      ) : (
        <div className="empty">No reservations or active rentals on record.</div>
      )}

      {/* Dispute Submission Modal (FR019) */}
      {disputeRental && (
        <div className="card" style={{ border: '1px solid #f59e0b', marginTop: 24, boxShadow: '0 8px 30px rgba(245, 158, 11, 0.18)' }}>
          <h3>Submit Dispute — Rental #{disputeRental.id}</h3>
          <p className="small muted">
            Asset: <strong>{disputeRental.item?.name}</strong> • Assessed Deduction: <strong>₹{disputeRental.damage_assessment?.damage_deduction?.toLocaleString('en-IN')}</strong>
          </p>

          <form onSubmit={handleDisputeSubmit} style={{ marginTop: 14 }}>
            <div className="form-row">
              <label>State Your Reason for Disputing this Deduction (FR019)</label>
              <textarea
                rows={3}
                value={disputeReason}
                onChange={e => setDisputeReason(e.target.value)}
                placeholder="Explain why the deduction is inaccurate (e.g. pre-existing cosmetic flaw, incorrect severity score)..."
                required
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" className="btn" disabled={submittingDispute}>
                {submittingDispute ? 'Submitting…' : 'Submit Dispute for Manager Review'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDisputeRental(null)}
                disabled={submittingDispute}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
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
