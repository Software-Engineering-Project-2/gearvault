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
        .catch(err => setErrorMessage(err.message || 'Failed to load booking.'))
        .finally(() => setLoading(false))
    }
  }, [bookingId, booking])

  const handlePay = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    setPaymentStatus('processing')

    try {
      // Show simulated processing animation for ~1.2s before backend confirmation
      await new Promise(resolve => setTimeout(resolve, 1200))
      
      // Confirm payment in backend & record in payments table
      await api(`/bookings/${bookingId}/confirm-payment`, {
        method: 'POST',
        body: JSON.stringify({
          provider: paymentMethod === 'card' ? 'simulated_card' : 'simulated_upi'
        })
      })
      
      // Show payment successful animation
      setPaymentStatus('success')

      // Automatically navigate back to bookings after 1.8s
      setTimeout(() => {
        navigate('/bookings')
      }, 1800)
    } catch (err) {
      setPaymentStatus('ready')
      setErrorMessage(err.message || 'Payment confirmation failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ maxWidth: 600, margin: '24px auto', textAlign: 'center' }}>
        <div className="empty">Loading checkout details...</div>
      </div>
    )
  }

  if (!booking && errorMessage) {
    return (
      <div className="card" style={{ maxWidth: 600, margin: '24px auto' }}>
        <h2>Checkout Error</h2>
        <p className="notice" style={{ color: '#95250e' }}>{errorMessage}</p>
        <Link to="/bookings" className="btn" style={{ display: 'inline-block', marginTop: 12 }}>
          Return to Bookings
        </Link>
      </div>
    )
  }

  const deposit = booking?.deposit_amount || 0
  const isHeld = (booking?.status || '').toLowerCase() === 'held'

  return (
    <div className="checkout-page">
      <div className="checkout-header">
        <Link to="/bookings" className="inline-link small">← Back to My Bookings</Link>
        <h2>Secure Checkout</h2>
        <p className="muted">Review your reservation details and complete deposit payment.</p>
      </div>

      {errorMessage && <p className="notice" style={{ color: '#95250e', marginBottom: 16 }}>{errorMessage}</p>}

      <div className="grid checkout-grid">
        {/* Left Column: Booking Summary */}
        <div className="left">
          <div className="card">
            <h3>Booking Summary</h3>
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
                <p className="small" style={{ margin: '4px 0 12px' }}>
                  {booking.item.description}
                </p>
              )}

              <div className="meta-box">
                <div className="meta-row">
                  <span className="muted">Rental Start:</span>
                  <strong>{formatTime(booking?.start_ts)}</strong>
                </div>
                <div className="meta-row">
                  <span className="muted">Rental End:</span>
                  <strong>{formatTime(booking?.end_ts)}</strong>
                </div>
                {booking?.hold_expires_at && isHeld && (
                  <div className="meta-row hold-expiry-row">
                    <span className="muted">Hold Expires:</span>
                    <span className="badge unavailable">{formatTime(booking.hold_expires_at)}</span>
                  </div>
                )}
                <div className="meta-row">
                  <span className="muted">Booking Status:</span>
                  <span className="badge available">{booking?.status}</span>
                </div>
              </div>

              <div className="price-breakdown">
                <div className="price-row">
                  <span>Original Purchase Price</span>
                  <span>₹{booking?.item?.purchase_price?.toLocaleString('en-IN') || booking?.pricing?.purchase_price?.toLocaleString('en-IN') || '0'}</span>
                </div>
                <div className="price-row">
                  <span>
                    Depreciated Value
                    {booking?.pricing?.age_years !== undefined && (
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        ({booking.pricing.age_years} yrs old)
                      </span>
                    )}
                  </span>
                  <strong style={{ color: '#1e293b' }}>
                    ₹{(booking?.pricing?.depreciated_value || booking?.item?.depreciated_value || booking?.item?.purchase_price)?.toLocaleString('en-IN')}
                  </strong>
                </div>
                {booking?.pricing?.rental_price !== undefined && (
                  <div className="price-row">
                    <span>
                      Rental Charges
                      <span className="badge available" style={{ marginLeft: 6, fontSize: 11, padding: '2px 6px' }}>
                        {booking?.pricing?.duration_days}d • {booking?.pricing?.duration_tier} Tier
                      </span>
                    </span>
                    <strong style={{ color: 'var(--accent, #ff5722)' }}>
                      ₹{booking.pricing.rental_price.toLocaleString('en-IN')}
                    </strong>
                  </div>
                )}
                <div className="price-row">
                  <span>Refundable Security Deposit</span>
                  <span>₹{deposit.toLocaleString('en-IN')}</span>
                </div>
                <div className="price-row total" style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #e2e8f0' }}>
                  <div>
                    <strong>Deposit Payable Now</strong>
                    <p className="muted small" style={{ margin: '2px 0 0', fontWeight: 'normal' }}>
                      (Rental charges settle at checkout handover)
                    </p>
                  </div>
                  <strong className="accent-amount" style={{ fontSize: 20 }}>₹{deposit.toLocaleString('en-IN')}</strong>
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
                <h3>Processing Payment...</h3>
                <p className="muted small">Authorizing deposit of ₹{deposit} with GearVault Secure Pay</p>
              </div>
            )}

            {paymentStatus === 'success' && (
              <div className="payment-animation-box success-box">
                <div className="success-checkmark">
                  <div className="check-icon">
                    <span className="icon-line line-tip"></span>
                    <span className="icon-line line-long"></span>
                    <div className="icon-circle"></div>
                    <div className="icon-fix"></div>
                  </div>
                </div>
                <h3 style={{ color: '#17652d', marginTop: 16 }}>Payment Successful!</h3>
                <p className="muted small">Your booking has been confirmed. Redirecting to your bookings...</p>
              </div>
            )}

            {paymentStatus === 'ready' && (
              <>
                <h3>Payment Method</h3>
                <p className="muted small">Select your preferred mock payment option:</p>

                {/* Tabs */}
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                        placeholder="yourname@okhdfcbank"
                        required
                      />
                      <p className="small muted" style={{ marginTop: 4 }}>
                        A simulated payment request will be sent to this ID.
                      </p>
                    </div>
                  )}

                  <div className="checkout-terms-card">
                    <div className="checkout-terms-header" onClick={() => setShowAgreementModal(true)}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                        📄 Digital Rental Agreement & Policies
                      </span>
                      <span className="inline-link small">Review Full Agreement ↗</span>
                    </div>
                    <label className="terms-checkbox-label">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={e => setAgreedToTerms(e.target.checked)}
                        required
                      />
                      <span>
                        I accept the <strong>GearVault Rental Agreement</strong>, Late Return Penalty rules (BR4), and Damage Liability policies (FR018).
                      </span>
                    </label>
                  </div>

                  <div className="payment-security-note">
                    <span className="lock-icon">🔒</span>
                    <span className="small muted">256-bit Simulated SSL Encryption</span>
                  </div>

                  <button
                    type="submit"
                    className="btn"
                    style={{ width: '100%', padding: '12px', fontSize: 16, fontWeight: 600, marginTop: 8 }}
                    disabled={!isHeld || !agreedToTerms}
                  >
                    {!agreedToTerms
                      ? 'Please Accept Terms to Continue'
                      : isHeld
                      ? `Pay ₹${deposit.toLocaleString('en-IN')} & Confirm Reservation`
                      : 'Booking Not in Held Status'}
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
