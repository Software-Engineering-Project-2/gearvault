import React from 'react'

const formatTime = value => {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function RentalAgreementModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null

  const {
    bookingId,
    rentalId,
    customer,
    item,
    startTs,
    endTs,
    checkoutAt,
    pricing,
    depositAmount,
    conditionNotes,
    photoUrl,
    paymentProvider,
  } = data

  const agreementRef = `GV-AGR-${bookingId || '000'}-${rentalId || '000'}`
  const todayStr = new Date().toLocaleDateString(undefined, { dateStyle: 'long' })

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content agreement-modal" onClick={e => e.stopPropagation()}>
        {/* Action Header */}
        <div className="agreement-actions no-print">
          <button className="btn secondary sm" onClick={handlePrint}>
            🖨️ Print / Save PDF
          </button>
          <button className="btn secondary sm" onClick={onClose} style={{ marginLeft: 8 }}>
            ✕ Close
          </button>
        </div>

        {/* Official Document Container */}
        <div className="agreement-document">
          {/* Header */}
          <div className="agreement-header">
            <div className="brand-header">
              <h2>GEARVAULT</h2>
              <span className="doc-type">MASTER EQUIPMENT RENTAL AGREEMENT</span>
            </div>
            <div className="doc-meta">
              <div><strong>Agreement Ref:</strong> {agreementRef}</div>
              <div><strong>Issue Date:</strong> {todayStr}</div>
              <div><strong>Status:</strong> {rentalId ? 'Active Rental' : 'Confirmed Booking'}</div>
            </div>
          </div>

          <hr className="divider" />

          {/* Section 1: Parties */}
          <div className="doc-section">
            <h4>1. PARTIES & RESERVATION DETAILS</h4>
            <div className="grid-2-col">
              <div>
                <p><strong>Client (Renter):</strong> {customer?.full_name || customer?.email || 'Registered Customer'}</p>
                <p><strong>Account ID:</strong> {customer?.id || 'N/A'}</p>
                <p><strong>Email Address:</strong> {customer?.email || 'N/A'}</p>
              </div>
              <div>
                <p><strong>Provider:</strong> GearVault Operations Hub</p>
                <p><strong>Order Reference:</strong> #{bookingId || 'N/A'}</p>
                {rentalId && <p><strong>Rental Record:</strong> #{rentalId}</p>}
              </div>
            </div>
          </div>

          {/* Section 2: Equipment & Pre-Rental Condition Inspection */}
          <div className="doc-section">
            <h4>2. EQUIPMENT SPECIFICATIONS & INSPECTION LOG</h4>
            <div className="grid-2-col">
              <div>
                <p><strong>Equipment:</strong> {item?.name || 'N/A'}</p>
                <p><strong>Inventory SKU:</strong> {item?.sku || 'N/A'}</p>
                <p><strong>Category:</strong> {item?.category?.name || 'General'}</p>
              </div>
              <div>
                <p><strong>Replacement Value:</strong> ₹{item?.purchase_price?.toLocaleString('en-IN') || item?.replacement_price?.toLocaleString('en-IN') || '0'}</p>
                <p><strong>Current Asset Valuation:</strong> ₹{(pricing?.depreciated_value || item?.depreciated_value || item?.purchase_price)?.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="condition-box">
              <p><strong>Inspection Checklist:</strong></p>
              <p className="condition-text">{conditionNotes || 'Pre-dispatch hardware and operational verification completed. All factory accessories, caps, and batteries inspected.'}</p>
              {photoUrl && (
                <p className="small muted" style={{ marginTop: 6 }}>
                  📷 Inspection Photo Reference: <a href={photoUrl} target="_blank" rel="noreferrer" className="inline-link">{photoUrl}</a>
                </p>
              )}
            </div>
          </div>

          {/* Section 3: Rental Timeline */}
          <div className="doc-section">
            <h4>3. RENTAL TIMELINE & RETURN SCHEDULE</h4>
            <div className="grid-2-col">
              <div>
                <p><strong>Collection / Handover:</strong> {formatTime(checkoutAt || startTs)}</p>
                <p><strong>Scheduled Return:</strong> <span style={{ color: '#c9251d', fontWeight: 600 }}>{formatTime(endTs)}</span></p>
              </div>
              <div>
                <p><strong>Rental Period:</strong> {pricing?.duration_days || 1} Day(s)</p>
                <p><strong>Rate Structure:</strong> Standard Multiplier Schedule</p>
              </div>
            </div>
          </div>

          {/* Section 4: Financial Breakdown */}
          <div className="doc-section">
            <h4>4. FINANCIAL SCHEDULE & DEPOSIT ESCROW</h4>
            <table className="agreement-table">
              <thead>
                <tr>
                  <th>Line Item</th>
                  <th>Calculation Basis</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Rental Charges</td>
                  <td>{pricing?.duration_days || 1} day(s) calculated against current asset valuation</td>
                  <td style={{ textAlign: 'right' }}>₹{(pricing?.rental_price || 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td>Refundable Security Deposit</td>
                  <td>20% Collateral Escrow (Refundable upon post-rental inspection)</td>
                  <td style={{ textAlign: 'right' }}>₹{(depositAmount || pricing?.deposit_amount || 0).toLocaleString('en-IN')}</td>
                </tr>
                <tr className="highlight-row">
                  <td><strong>Security Deposit Authorized</strong></td>
                  <td>Confirmed via {paymentProvider || 'Secure Gateway'}</td>
                  <td style={{ textAlign: 'right' }}><strong>₹{(depositAmount || pricing?.deposit_amount || 0).toLocaleString('en-IN')}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 5: Binding Terms & Legal Business Rules */}
          <div className="doc-section">
            <h4>5. TERMS OF SERVICE & RETURN POLICIES</h4>
            <ol className="terms-list">
              <li>
                <strong>Late Return Policy:</strong> Equipment must be returned to the counter on or before the agreed Return Date. Unreturned equipment incurs standard daily penalty assessments until officially checked in.
              </li>
              <li>
                <strong>Unreturned Equipment Liability:</strong> Equipment unreturned past 7 consecutive days beyond the scheduled date is escalated to lost asset status, incurring full replacement liability (₹{item?.replacement_price?.toLocaleString('en-IN') || item?.purchase_price?.toLocaleString('en-IN') || '0'}).
              </li>
              <li>
                <strong>Condition Verification & Deposit Adjustments:</strong> Returned equipment is inspected against pre-dispatch records. Any identified damages are categorized systematically and deducted from the deposit balance.
              </li>
              <li>
                <strong>Dispute Resolution:</strong> Clients retain the right to request supervisory management review for any damage assessments or deposit adjustments.
              </li>
            </ol>
          </div>

          {/* Section 6: Digital Signature & Acceptance */}
          <div className="doc-section signatures-section">
            <div className="grid-2-col">
              <div className="signature-box">
                <p className="small muted">Client Digital Authorization:</p>
                <div className="sig-stamp">
                  ✓ DIGITALLY EXECUTED & CONFIRMED<br />
                  <span className="small">{customer?.email || 'Customer'} • {todayStr}</span>
                </div>
              </div>
              <div className="signature-box">
                <p className="small muted">Authorized Operations Officer:</p>
                <div className="sig-stamp staff-stamp">
                  ✓ VERIFIED & DISPATCHED<br />
                  <span className="small">GearVault Operations Desk • Station #01</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
