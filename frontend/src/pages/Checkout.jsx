import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { api, getUser } from '../lib/api'
import RentalAgreementModal from '../components/RentalAgreementModal'

const formatTime = value => {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function Checkout() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [booking, setBooking] = useState(location.state?.booking || null)
  const [loading, setLoading] = useState(!location.state?.booking)
  const [paymentStatus, setPaymentStatus] = useState('ready') // 'ready' | 'processing' | 'success'
  const [paymentMethod, setPaymentMethod] = useState('card') // 'card' | 'upi'
  const [errorMessage, setErrorMessage] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(true)
  const [showAgreementModal, setShowAgreementModal] = useState(false)

  // Mock form fields
  const [cardHolder, setCardHolder] = useState('Sathya Tester')
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8821')
  const [expiry, setExpiry] = useState('08/28')
  const [cvv, setCvv] = useState('382')
  const [upiId, setUpiId] = useState('sathya@okaxis')

  useEffect(() => {
    if (!booking) {
      setLoading(true)
      api(`/bookings/${bookingId}`)
        .then(data => setBooking(data.booking))
        .catch(err => setErrorMessage(err.message || 'Failed to load booking details.'))
        .finally(() => setLoading(false))
    }
  }, [bookingId, booking])

  const handlePay = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    setPaymentStatus('processing')

    try {
      await new Promise(resolve => setTimeout(resolve, 1200))
      
      await api(`/bookings/${bookingId}/confirm-payment`, {
        method: 'POST',
        body: JSON.stringify({
          provider: paymentMethod === 'card' ? 'simulated_card' : 'simulated_upi'
        })
      })
      
      setPaymentStatus('success')

      setTimeout(() => {
        navigate('/bookings')
      }, 1800)
    } catch (err) {
      setPaymentStatus('ready')
      setErrorMessage(err.message || 'Payment authorization failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '32px auto', textAlign: 'center' }}>
        <div className="empty">Initializing secure checkout session…</div>
      </div>
    )
  }

  if (!booking && errorMessage) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '32px auto' }}>
        <h2>Order Error</h2>
        <p className="notice error">{errorMessage}</p>
        <Link to="/bookings" className="btn" style={{ display: 'inline-block', marginTop: 16 }}>
          Return to Reservations
        </Link>
      </div>
    )
  }

  const deposit = booking?.deposit_amount || 0
  const isHeld = (booking?.status || '').toLowerCase() === 'held'

  return (
    <div className="checkout-page">
      <div className="checkout-header">
        <Link to="/bookings" className="inline-link small">← Back to Reservations</Link>
        <h2>Order Confirmation</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>Review rental schedule and authorize refundable security deposit.</p>
      </div>

      {errorMessage && <div className="notice error" style={{ marginBottom: 20 }}>{errorMessage}</div>}

      <div className="grid checkout-grid">
        {/* Left Column: Booking Summary */}
        <div className="left">
          <div className="card">
            <h3>Reservation Details</h3>
            <div className="checkout-item-details">
              <div className="checkout-item-header">
                <h4>{booking?.item?.name || 'Equipment Item'}</h4>
                {booking?.item?.sku && <span className="badge">{booking.item.sku}</span>}
              </div>
              {booking?.item?.category?.name && (
                <p className="muted small" style={{ margin: '2px 0 8px' }}>
                  Category: {booking.item.category.name}
                </p>
              )}
              {booking?.item?.description && (
                <p className="small" style={{ margin: '4px 0 14px', color: 'var(--text-secondary)' }}>
                  {booking.item.description}
                </p>
              )}

              <div className="meta-box">
                <div className="meta-row">
                  <span className="muted">Rental Start:</span>
                  <strong>{formatTime(booking?.start_ts)}</strong>
                </div>
                <div className="meta-row">
                  <span className="muted">Rental Return:</span>
                  <strong>{formatTime(booking?.end_ts)}</strong>
                </div>
                {booking?.hold_expires_at && isHeld && (
                  <div className="meta-row hold-expiry-row">
                    <span className="muted">Hold Active Until:</span>
                    <span className="badge held">{formatTime(booking.hold_expires_at)}</span>
                  </div>
                )}
                <div className="meta-row">
                  <span className="muted">Reservation Status:</span>
                  <span className="badge available">{booking?.status}</span>
                </div>
              </div>

              <div className="price-breakdown">
                <div className="price-row">
                  <span>Replacement Value</span>
                  <span>₹{booking?.item?.purchase_price?.toLocaleString('en-IN') || booking?.pricing?.purchase_price?.toLocaleString('en-IN') || '0'}</span>
                </div>
                <div className="price-row">
                  <span>
                    Asset Valuation
                    {booking?.pricing?.age_years !== undefined && (
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        ({booking.pricing.age_years} yr old)
                      </span>
                    )}
                  </span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    ₹{(booking?.pricing?.depreciated_value || booking?.item?.depreciated_value || booking?.item?.purchase_price)?.toLocaleString('en-IN')}
                  </strong>
                </div>
                {booking?.pricing?.rental_price !== undefined && (
                  <div className="price-row">
                    <span>
                      Rental Charges
                      <span className="badge available" style={{ marginLeft: 6, fontSize: 11, padding: '2px 8px' }}>
                        {booking?.pricing?.duration_days} Day(s)
                      </span>
                    </span>
                    <strong style={{ color: 'var(--accent)' }}>
                      ₹{booking.pricing.rental_price.toLocaleString('en-IN')}
                    </strong>
                  </div>
                )}
                <div className="price-row">
                  <span>Refundable Security Deposit</span>
                  <span>₹{deposit.toLocaleString('en-IN')}</span>
                </div>
                <div className="price-row total">
                  <div>
                    <strong>Deposit Due Now</strong>
                    <p className="muted small" style={{ margin: '2px 0 0', fontWeight: 'normal' }}>
                      (Rental charges settle at equipment collection)
                    </p>
                  </div>
                  <strong className="accent-amount">₹{deposit.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Payment Screen / Simulation */}
        <div className="right">
          <div className="card payment-card">
            {paymentStatus === 'processing' && (
              <div className="payment-animation-box">
                <div className="spinner"></div>
                <h3 style={{ margin: '0 0 6px' }}>Authorizing Escrow…</h3>
                <p className="muted small">Processing security deposit of ₹{deposit.toLocaleString('en-IN')} via secure gateway</p>
              </div>
            )}

            {paymentStatus === 'success' && (
              <div className="payment-animation-box success-box">
                <div className="success-checkmark">
                  <div className="check-icon">
                    <span className="icon-line line-tip"></span>
                    <span className="icon-line line-long"></span>
                  </div>
                </div>
                <h3 style={{ color: '#1b7a37', marginTop: 12, marginBottom: 4 }}>Deposit Confirmed</h3>
                <p className="muted small">Your reservation is confirmed. Redirecting to your reservations…</p>
              </div>
            )}

            {paymentStatus === 'ready' && (
              <>
                <h3 style={{ marginBottom: 4 }}>Payment Method</h3>
                <p className="muted small">Select an authorization method for deposit hold:</p>

                {/* Segmented Tabs */}
                <div className="payment-tabs">
                  <button
                    type="button"
                    className={`tab-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('card')}
                  >
                    💳 Credit / Debit Card
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('upi')}
                  >
                    📱 UPI / QR
                  </button>
                </div>

                <form onSubmit={handlePay} style={{ marginTop: 16 }}>
                  {paymentMethod === 'card' ? (
                    <>
                      <div className="form-row">
                        <label>Cardholder Name</label>
                        <input
                          type="text"
                          value={cardHolder}
                          onChange={e => setCardHolder(e.target.value)}
                          placeholder="Name on card"
                          required
                        />
                      </div>
                      <div className="form-row">
                        <label>Card Number</label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={e => setCardNumber(e.target.value)}
                          placeholder="4532 0000 0000 0000"
                          required
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-row">
                          <label>Expiry</label>
                          <input
                            type="text"
                            value={expiry}
                            onChange={e => setExpiry(e.target.value)}
                            placeholder="MM/YY"
                            required
                          />
                        </div>
                        <div className="form-row">
                          <label>CVV</label>
                          <input
                            type="password"
                            value={cvv}
                            onChange={e => setCvv(e.target.value)}
                            placeholder="•••"
                            maxLength={4}
                            required
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="form-row">
                      <label>UPI ID / VPA</label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={e => setUpiId(e.target.value)}
                        placeholder="yourname@bank"
                        required
                      />
                      <p className="small muted" style={{ marginTop: 4 }}>
                        A payment authorization prompt will be issued to this VPA.
                      </p>
                    </div>
                  )}

                  <div className="checkout-terms-card">
                    <div className="checkout-terms-header" onClick={() => setShowAgreementModal(true)}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        📄 Master Rental Agreement & Policies
                      </span>
                      <span className="inline-link small">View Agreement ↗</span>
                    </div>
                    <label className="terms-checkbox-label">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={e => setAgreedToTerms(e.target.checked)}
                        required
                      />
                      <span>
                        I acknowledge and accept the <strong>GearVault Rental Terms</strong>, Late Return Policies, and Equipment Liability Agreement.
                      </span>
                    </label>
                  </div>

                  <div className="payment-security-note">
                    <span style={{ fontSize: 13 }}>🔒</span>
                    <span className="small muted">256-bit Encrypted Transaction</span>
                  </div>

                  <button
                    type="submit"
                    className="btn"
                    style={{ width: '100%', padding: '12px 20px', fontSize: 15, fontWeight: 600, marginTop: 10 }}
                    disabled={!isHeld || !agreedToTerms}
                  >
                    {!agreedToTerms
                      ? 'Accept Terms to Continue'
                      : isHeld
                      ? `Authorize ₹${deposit.toLocaleString('en-IN')} Deposit`
                      : 'Reservation Not Held'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Digital Rental Agreement Modal (FR014) */}
      <RentalAgreementModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        data={{
          bookingId: booking?.id,
          customer: getUser(),
          item: booking?.item,
          startTs: booking?.start_ts,
          endTs: booking?.end_ts,
          pricing: booking?.pricing,
          depositAmount: deposit,
          paymentProvider: paymentMethod === 'card' ? 'Credit/Debit Card (Simulated)' : 'UPI / QR (Simulated)',
        }}
      />
    </div>
  )
}
